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
        '*.password',
        'secret',
        '*.secret',
        'token',
        '*.token',
        'authorization',
        'cookie',
        'apiKey',
        '*.apiKey',
        'api_key',
        '*.api_key',
        'accessKey',
        '*.accessKey',
        'access_key',
        '*.access_key',
        'secretKey',
        '*.secretKey',
        'privateKey',
        '*.privateKey',
        'private_key',
        '*.private_key',
        'refreshToken',
        '*.refreshToken',
        'refresh_token',
        '*.refresh_token',
        'accessToken',
        '*.accessToken',
        'access_token',
        '*.access_token',
        'jwt',
        '*.jwt',
        'headers.authorization',
        'headers.cookie',
        'req.headers.authorization',
        'req.headers.cookie',
      ],
      remove: false,
      censor: '[Redacted]',
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

export const rootLogger = createLogger({ name: 'teamspace-one' });
