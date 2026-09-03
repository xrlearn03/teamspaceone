import pino, { type Logger, type LoggerOptions } from 'pino';

export type { Logger };

export interface CreateLoggerOptions {
  name: string;
  level?: string;
  redact?: string[];
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const { name, level = process.env.LOG_LEVEL ?? 'info' } = options;

  const pinoOptions: LoggerOptions = {
    name,
    level,
    redact: {
      paths: options.redact ?? [
        'password',
        'secret',
        'token',
        'authorization',
        'cookie',
        '*.password',
        '*.secret',
        '*.token',
      ],
      remove: true,
    },
  };

  if (process.env.NODE_ENV === 'development') {
    pinoOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        singleLine: false,
      },
    };
  }

  return pino(pinoOptions);
}

export const rootLogger = createLogger({ name: 'reactify' });
