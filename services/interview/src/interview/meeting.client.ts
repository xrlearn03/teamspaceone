import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrganisationContextValue } from '@teamspace-one/organisation-context';

@Injectable()
export class MeetingClient {
  private readonly logger = new Logger(MeetingClient.name);

  constructor(private readonly config: ConfigService) {}

  private requireBaseUrl(): string {
    const url = this.config.get<string>('MEETING_SERVICE_URL');
    if (!url) throw new Error('MEETING_SERVICE_URL environment variable is required');
    return url;
  }

  private headers(ctx: OrganisationContextValue): Record<string, string> {
    const apiKey = this.config.get<string>('INTERNAL_API_KEY');
    if (!apiKey) throw new Error('INTERNAL_API_KEY environment variable is required');
    return {
      'x-internal-api-key': apiKey,
      'x-internal-caller': 'interview-service',
      'x-organisation-id': ctx.organisationId,
      'content-type': 'application/json',
      ...(ctx.correlationId ? { 'x-correlation-id': ctx.correlationId } : {}),
    };
  }

  async ensureRoom(ctx: OrganisationContextValue, id: string, title: string) {
    const baseUrl = this.requireBaseUrl();
    const response = await fetch(`${baseUrl}/meetings/internal/${encodeURIComponent(id)}/room`, {
      method: 'POST',
      headers: this.headers(ctx),
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      throw new Error(`Failed to create meeting room: ${response.status}`);
    }
    return response.json();
  }

  async getSfuToken(ctx: OrganisationContextValue, id: string, userId: string, displayName?: string) {
    const baseUrl = this.requireBaseUrl();
    const response = await fetch(`${baseUrl}/meetings/internal/${encodeURIComponent(id)}/sfu-token`, {
      method: 'POST',
      headers: this.headers(ctx),
      body: JSON.stringify({ userId, displayName }),
    });
    if (!response.ok) {
      throw new Error(`Failed to get SFU token: ${response.status}`);
    }
    return response.json();
  }
}
