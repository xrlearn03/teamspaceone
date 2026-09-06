import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module.js';
import { createLogger, type Logger } from '@teamspace-one/logger';
import { initTelemetry } from '@teamspace-one/opentelemetry';
import { OrganisationContextMiddleware } from '@teamspace-one/organisation-context';

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

async function bootstrap() {
  initTelemetry({ serviceName: 'teamspace-one-realtime-service' });

  const pino = createLogger({ name: 'realtime-service' });
  const app = await NestFactory.create(AppModule, { logger: adaptLogger(pino) });

  const config = app.get(ConfigService);
  if (!config.get<string>('JWT_SECRET')) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  if (!config.get<string>('INTERNAL_API_KEY')) {
    throw new Error('INTERNAL_API_KEY environment variable is required');
  }


  app.use((req: any, res: any, next: any) => {
    const middleware = new OrganisationContextMiddleware();
    middleware.use(req, res, next);
  });

  app.useWebSocketAdapter(new IoAdapter(app));

  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 3005);

  await app.listen(port);
  pino.info(`Realtime service listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
