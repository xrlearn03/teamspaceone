import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('Mailer');

export interface EmailProvider {
  host: string;
  port: number;
  secure: boolean;
  user?: string | null;
  pass?: string | null;
  from?: string | null;
  enabled?: boolean;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  body: string;
  html?: string;
  from?: string;
}

function envBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function smtpAuth(user: string | undefined, pass: string | undefined) {
  if (!user && !pass) return undefined;
  return { user: user ?? '', pass: pass ?? '' };
}

function defaultFrom(config: ConfigService): string {
  return config.get<string>('SMTP_FROM', 'no-reply@teamspaceone.in');
}

async function sendViaSmtp(provider: EmailProvider, email: OutboundEmail, fallbackFrom: string): Promise<void> {
  const nodemailer = require('nodemailer') as any;
  const transporter = nodemailer.createTransport({
    host: provider.host,
    port: provider.port,
    secure: provider.secure,
    auth: smtpAuth(provider.user ?? undefined, provider.pass ?? undefined),
  });
  const from = email.from ?? provider.from ?? fallbackFrom;
  await transporter.sendMail({
    from,
    to: email.to,
    subject: email.subject,
    text: email.body,
    ...(email.html ? { html: email.html } : {}),
  });
  logger.debug({ to: email.to }, 'Email sent via organisation SMTP');
}

/**
 * Delivers email via an organisation-level SMTP provider, a global
 * EMAIL_WEBHOOK_URL, or global SMTP_* env vars; otherwise logs without
 * exposing message content.
 */
export async function sendEmail(config: ConfigService, email: OutboundEmail, provider?: EmailProvider | null): Promise<void> {
  if (provider && provider.enabled !== false && provider.host) {
    await sendViaSmtp(provider, email, defaultFrom(config));
    return;
  }

  const webhookUrl = config.get<string>('EMAIL_WEBHOOK_URL');
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: email.to,
        subject: email.subject,
        body: email.body,
        html: email.html,
        from: email.from,
      }),
    });
    if (!response.ok) {
      throw new Error(`Email webhook returned ${response.status}`);
    }
    logger.debug({ to: email.to }, 'Email sent via webhook');
    return;
  }

  const smtpHost = config.get<string>('SMTP_HOST');
  if (smtpHost) {
    const nodemailer = require('nodemailer') as any;
    const port = parseInt(config.get<string>('SMTP_PORT') ?? '587', 10);
    const secure = envBool(config.get<string>('SMTP_SECURE'), false);
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number.isNaN(port) ? 587 : port,
      secure,
      auth: smtpAuth(config.get<string>('SMTP_USER'), config.get<string>('SMTP_PASS')),
    });
    const from = email.from ?? defaultFrom(config);
    await transporter.sendMail({
      from,
      to: email.to,
      subject: email.subject,
      text: email.body,
      ...(email.html ? { html: email.html } : {}),
    });
    logger.debug({ to: email.to }, 'Email sent via SMTP');
    return;
  }

  logger.log({ to: email.to }, 'Email delivery not configured; content redacted');
}
