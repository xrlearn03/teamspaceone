import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('Mailer');

export interface OutboundEmail {
  to: string;
  subject: string;
  body: string;
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
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: config.get<number>('SMTP_PORT', 587),
      secure: config.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: config.get<string>('SMTP_USER'),
        pass: config.get<string>('SMTP_PASS'),
      },
    });
    const from = config.get<string>('SMTP_FROM', 'no-reply@teamspace.one');
    await transporter.sendMail({ from, to: email.to, subject: email.subject, text: email.body });
    logger.debug({ to: email.to }, 'Email sent via SMTP');
    return;
  }

  logger.log({ to: email.to }, 'Email delivery not configured; content redacted');
}
