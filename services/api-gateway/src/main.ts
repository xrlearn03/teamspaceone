import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { verify } from 'jsonwebtoken';
import { AppModule } from './app.module.js';
import { createLogger, type Logger } from '@reactify/logger';
import { initTelemetry } from '@reactify/opentelemetry';
import { OrganisationContextMiddleware } from '@reactify/organisation-context';

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

async function bootstrap() {
  initTelemetry({ serviceName: 'reactify-api-gateway' });

  const pino = createLogger({ name: 'api-gateway' });
  const app = await NestFactory.create(AppModule, { logger: adaptLogger(pino) });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const middleware = new OrganisationContextMiddleware();
    middleware.use(req, res, next);
  });

  const config = app.get(ConfigService);
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

  app.use(['/projects', '/tasks'], createAuthMiddleware(jwtSecret));
  app.use(
    ['/projects', '/tasks'],
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

  app.enableCors({ origin: true, credentials: true });
  app.enableShutdownHooks();

  const port = config.get<number>('GATEWAY_PORT', 3000);

  await app.listen(port);
  pino.info(`API Gateway listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
