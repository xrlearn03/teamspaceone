import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import { legacyCreateProxyMiddleware as createProxyMiddleware } from 'http-proxy-middleware';
import { verify } from 'jsonwebtoken';
import { AppModule } from './app.module.js';
import { createLogger, type Logger } from '@teamspace-one/logger';
import { initTelemetry } from '@teamspace-one/opentelemetry';
import { OrganisationContextMiddleware } from '@teamspace-one/organisation-context';
import { MetricsService } from '@teamspace-one/metrics';

function adaptLogger(pino: Logger): LoggerService {
  return {
    log: (message: unknown, ...optionalParams: unknown[]) =>
      pino.info({ message: String(message), context: optionalParams }),
    error: (message: unknown, ...optionalParams: unknown[]) =>
      pino.error({ message: String(message), context: optionalParams }),
    warn: (message: unknown, ...optionalParams: unknown[]) =>
      pino.warn({ message: String(message), context: optionalParams }),
    debug: (message: unknown, ...optionalParams: unknown[]) =>
      pino.debug({ message: String(message), context: optionalParams }),
    verbose: (message: unknown, ...optionalParams: unknown[]) =>
      pino.debug({ message: String(message), context: optionalParams }),
  };
}

function createAuthMiddleware(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers['authorization'] as string | undefined;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing access token' });
      return;
    }
    const token = header.slice(7);
    try {
      const payload = verify(token, jwtSecret) as { sub: string };
      req.headers['x-actor-id'] = payload.sub;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid access token' });
    }
  };
}

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.removeHeader('X-Powered-By');
  next();
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

function createRateLimitMiddleware(windowMs: number, maxRequests: number) {
  const store = new Map<string, RateLimitEntry>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = (req.ip || req.socket.remoteAddress || 'unknown').toString();
    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    next();
  };
}

async function bootstrap() {
  initTelemetry({ serviceName: 'teamspace-one-api-gateway' });

  const pino = createLogger({ name: 'api-gateway' });
  const app = await NestFactory.create(AppModule, { logger: adaptLogger(pino) });

  // CORS must be set up before any proxy middlewares so preflight OPTIONS
  // are handled at the gateway, not forwarded to services.
  app.enableCors({ origin: true, credentials: true });

  const metrics = app.get(MetricsService);
  const requestCounter = metrics.counter(
    'teamspaceone_http_requests_total',
    'HTTP requests handled by the gateway',
    ['method', 'status'],
  );
  const requestDuration = metrics.histogram(
    'teamspaceone_http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method'],
    [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  );

  function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      const status = String(res.statusCode);
      requestCounter.inc({ method: req.method, status });
      requestDuration.observe({ method: req.method }, duration);
    });
    next();
  }

  app.use(securityHeaders);
  app.use(metricsMiddleware);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const middleware = new OrganisationContextMiddleware();
    middleware.use(req, res, next);
  });

  const config = app.get(ConfigService);
  const rateLimitWindow = config.get<number>('RATE_LIMIT_WINDOW_MS', 60000);
  const rateLimitMax = config.get<number>('RATE_LIMIT_MAX', 100);
  app.use(createRateLimitMiddleware(rateLimitWindow, rateLimitMax));

  const authUrl = config.get<string>('AUTH_SERVICE_URL', 'http://localhost:3002');
  const orgUrl = config.get<string>('ORGANISATION_SERVICE_URL', 'http://localhost:3003');
  const msgUrl = config.get<string>('MESSAGING_SERVICE_URL', 'http://localhost:3004');
  const projectsUrl = config.get<string>('PROJECTS_SERVICE_URL', 'http://localhost:3006');
  const notificationUrl = config.get<string>('NOTIFICATION_SERVICE_URL', 'http://localhost:3008');
  const meetingUrl = config.get<string>('MEETING_SERVICE_URL', 'http://localhost:3009');
  const fileStorageUrl = config.get<string>('FILE_STORAGE_SERVICE_URL', 'http://localhost:3010');
  const searchUrl = config.get<string>('SEARCH_SERVICE_URL', 'http://localhost:3011');
  const aiUrl = config.get<string>('AI_SERVICE_URL', 'http://localhost:3012');
  const jwtSecret = config.get<string>('JWT_SECRET', 'change-me');

  app.use(
    '/auth',
    createProxyMiddleware({
      target: authUrl,
      changeOrigin: true,
    }),
  );

  app.use('/organisations', createAuthMiddleware(jwtSecret));
  app.use(
    '/organisations',
    createProxyMiddleware({
      target: orgUrl,
      changeOrigin: true,
    }),
  );

  app.use(['/channels', '/messages'], createAuthMiddleware(jwtSecret));
  app.use(
    ['/channels', '/messages'],
    createProxyMiddleware({
      target: msgUrl,
      changeOrigin: true,
    }),
  );

  app.use(['/projects', '/tasks', '/project-comments', '/approvals'], createAuthMiddleware(jwtSecret));
  app.use(
    ['/projects', '/tasks', '/project-comments', '/approvals'],
    createProxyMiddleware({
      target: projectsUrl,
      changeOrigin: true,
    }),
  );

  app.use('/notifications', createAuthMiddleware(jwtSecret));
  app.use(
    '/notifications',
    createProxyMiddleware({
      target: notificationUrl,
      changeOrigin: true,
    }),
  );

  app.use('/meetings', createAuthMiddleware(jwtSecret));
  app.use(
    '/meetings',
    createProxyMiddleware({
      target: meetingUrl,
      changeOrigin: true,
    }),
  );

  app.use(
    '/shares',
    createProxyMiddleware({ target: fileStorageUrl, changeOrigin: true }),
  );

  app.use('/files', createAuthMiddleware(jwtSecret));
  app.use(
    '/files',
    createProxyMiddleware({
      target: fileStorageUrl,
      changeOrigin: true,
    }),
  );

  app.use('/search', createAuthMiddleware(jwtSecret));
  app.use(
    '/search',
    createProxyMiddleware({
      target: searchUrl,
      changeOrigin: true,
    }),
  );

  app.use('/ai', createAuthMiddleware(jwtSecret));
  app.use(
    '/ai',
    createProxyMiddleware({
      target: aiUrl,
      changeOrigin: true,
    }),
  );

  app.enableShutdownHooks();

  const port = config.get<number>('GATEWAY_PORT', 3000);

  await app.listen(port);
  pino.info(`API Gateway listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
