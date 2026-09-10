import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AuthProfileUpdate {
  firstName?: string;
  lastName?: string;
  avatarFileId?: string | null;
}

@Injectable()
export class AuthProfileClientService {
  constructor(private readonly config: ConfigService) {}

  async updateUserProfile(
    userId: string,
    profile: AuthProfileUpdate,
    correlationId?: string,
  ): Promise<void> {
    if (Object.keys(profile).length === 0) return;

    const baseUrl = this.config.get<string>('AUTH_SERVICE_URL');
    const internalApiKey = this.config.get<string>('INTERNAL_API_KEY');
    if (!baseUrl) throw new Error('AUTH_SERVICE_URL environment variable is required');
    if (!internalApiKey) throw new Error('INTERNAL_API_KEY environment variable is required');

    const response = await fetch(`${baseUrl}/auth/internal/users/${userId}/profile`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': internalApiKey,
        'x-internal-caller': 'hrms-service',
        ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
      },
      body: JSON.stringify(profile),
    });
    if (!response.ok) {
      throw new Error(`Auth profile synchronization failed with status ${response.status}`);
    }
  }
}
