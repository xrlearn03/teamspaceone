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

/**
 * Headers that must never be accepted from external clients. The gateway sets
 * `x-actor-id` itself after verifying the JWT; `x-internal-api-key` and
 * `x-internal-caller` are attached when proxying / used for service-to-service
 * calls and must not be spoofable.
 */
const SPOOFABLE_HEADERS = [
  'x-actor-id',
  'x-internal-api-key',
  'x-internal-caller',
  'x-causation-id',
] as const;

function stripSpoofableHeaders(req: Request, _res: Response, next: NextFunction) {
  for (const header of SPOOFABLE_HEADERS) {
    delete req.headers[header];
  }
  next();
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
      const payload = verify(token, jwtSecret, { algorithms: ['HS256'] }) as { sub: string };
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

  // Drop expired buckets periodically so the map cannot grow unboundedly.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, windowMs);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    // CORS preflights and health probes must not consume the rate-limit bucket.
    if (req.method === 'OPTIONS' || req.path === '/health') {
      next();
      return;
    }

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

  // Trust the first proxy hop so req.ip reflects the real client address
  // (Docker bridge, load balancer) instead of giving every client a shared
  // rate-limit bucket.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const config = app.get(ConfigService);

  // CORS must be set up before any proxy middlewares so preflight OPTIONS
  // are handled at the gateway, not forwarded to services.
  const corsOrigins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length
      ? corsOrigins
      : ['http://localhost:1420', 'http://localhost:5173', 'http://tauri.localhost', 'tauri://localhost'],
    credentials: true,
  });

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
  app.use(stripSpoofableHeaders);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const middleware = new OrganisationContextMiddleware({ requireInternalApiKey: false });
    middleware.use(req, res, next);
  });

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
  const hrmsUrl = config.get<string>('HRMS_SERVICE_URL', 'http://localhost:3013');
  const jwtSecret = config.get<string>('JWT_SECRET');
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  const internalApiKey = config.get<string>('INTERNAL_API_KEY');
  if (!internalApiKey) {
    throw new Error('INTERNAL_API_KEY environment variable is required');
  }

  // Attach the shared internal key to every proxied request so downstream
  // services can verify the request transited the gateway. Public routes
  // (e.g. /auth, /shares) get the key but no x-actor-id.
  const proxy = (target: string) =>
    createProxyMiddleware({
      target,
      changeOrigin: true,
      on: {
        proxyReq: (proxyReq) => {
          proxyReq.setHeader('x-internal-api-key', internalApiKey);
        },
      },
    });

  app.use('/auth', proxy(authUrl));

  app.use('/organisations', createAuthMiddleware(jwtSecret));
  app.use('/organisations', proxy(orgUrl));

  app.use(['/channels', '/messages'], createAuthMiddleware(jwtSecret));
  app.use(['/channels', '/messages'], proxy(msgUrl));

  app.use(['/projects', '/tasks', '/project-comments', '/approvals'], createAuthMiddleware(jwtSecret));
  app.use(['/projects', '/tasks', '/project-comments', '/approvals'], proxy(projectsUrl));

  app.use('/notifications', createAuthMiddleware(jwtSecret));
  app.use('/notifications', proxy(notificationUrl));

  app.use('/meetings', createAuthMiddleware(jwtSecret));
  app.use('/meetings', proxy(meetingUrl));

  app.use('/shares', proxy(fileStorageUrl));

  app.use('/files', createAuthMiddleware(jwtSecret));
  app.use('/files', proxy(fileStorageUrl));

  app.use('/search', createAuthMiddleware(jwtSecret));
  app.use('/search', proxy(searchUrl));

  app.use('/ai', createAuthMiddleware(jwtSecret));
  app.use('/ai', proxy(aiUrl));

  app.use('/hrms', createAuthMiddleware(jwtSecret));
  app.use('/hrms', proxy(hrmsUrl));

  app.enableShutdownHooks();

  const port = config.get<number>('GATEWAY_PORT', 3000);

  await app.listen(port);
  pino.info(`API Gateway listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
