import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

async function bootstrap() {
  initTelemetry({ serviceName: 'reactify-file-storage-service' });

  const pino = createLogger({ name: 'file-storage-service' });
  const app = await NestFactory.create(AppModule, { logger: adaptLogger(pino) });

  app.use((req: any, res: any, next: any) => {
    const middleware = new OrganisationContextMiddleware();
    middleware.use(req, res, next);
  });

  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3010);

  await app.listen(port);
  pino.info(`File storage service listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
