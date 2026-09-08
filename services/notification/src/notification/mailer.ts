import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('Mailer');

export interface OutboundEmail {
  to: string;
  subject: string;
  body: string;
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

/**
 * Delivers email via EMAIL_WEBHOOK_URL or SMTP when configured; otherwise
 * logs without exposing message content.
 */
export async function sendEmail(config: ConfigService, email: OutboundEmail): Promise<void> {
  const webhookUrl = config.get<string>('EMAIL_WEBHOOK_URL');
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(email),
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
    const from = config.get<string>('SMTP_FROM', 'no-reply@teamspace.one');
    await transporter.sendMail({ from, to: email.to, subject: email.subject, text: email.body });
    logger.debug({ to: email.to }, 'Email sent via SMTP');
    return;
  }

  logger.log({ to: email.to }, 'Email delivery not configured; content redacted');
}
