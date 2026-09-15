import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ProvisionedAccount {
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
  temporaryPassword: string | null;
  accountCreated: boolean;
}

@Injectable()
export class AuthAccountsClientService {
  constructor(private readonly config: ConfigService) {}

  private headers(correlationId?: string): Record<string, string> {
    const internalApiKey = this.config.get<string>('INTERNAL_API_KEY');
    if (!internalApiKey) throw new Error('INTERNAL_API_KEY environment variable is required');
    return {
      'content-type': 'application/json',
      'x-internal-api-key': internalApiKey,
      'x-internal-caller': 'hrms-service',
      ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
    };
  }

  private baseUrl(): string {
    const baseUrl = this.config.get<string>('AUTH_SERVICE_URL');
    if (!baseUrl) throw new Error('AUTH_SERVICE_URL environment variable is required');
    return baseUrl;
  }

  /**
   * Provision a login account for an HR-driven employee invite. Existing
   * accounts are returned with `temporaryPassword: null` — their password is
   * never reset by this path.
   */
  async provisionUser(
    input: { email: string; firstName?: string; lastName?: string },
    correlationId?: string,
  ): Promise<ProvisionedAccount> {
    const response = await fetch(`${this.baseUrl()}/auth/internal/provision`, {
      method: 'POST',
      headers: this.headers(correlationId),
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => 'User provisioning failed');
      throw new Error(`User provisioning failed: ${body}`);
    }
    return (await response.json()) as ProvisionedAccount;
  }

  /**
   * Rotate the temporary password on an invited account that has not activated
   * yet. Returns null when the account is already activated (409) so the
   * invite email can fall back to the "existing account" wording.
   */
  async resetTemporaryPassword(userId: string, correlationId?: string): Promise<string | null> {
    const response = await fetch(
      `${this.baseUrl()}/auth/internal/users/${encodeURIComponent(userId)}/reset-temporary-password`,
      { method: 'POST', headers: this.headers(correlationId) },
    );
    if (response.status === 409) return null;
    if (!response.ok) {
      const body = await response.text().catch(() => 'Password reset failed');
      throw new Error(`Password reset failed: ${body}`);
    }
    const data = (await response.json()) as { temporaryPassword: string };
    return data.temporaryPassword;
  }
}
