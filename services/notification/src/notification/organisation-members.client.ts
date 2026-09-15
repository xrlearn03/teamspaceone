import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Resolves organisation members by role name via the organisation service's
 * internal API. Used to fan out events (e.g. a new hire pending onboarding)
 * to role holders such as hr_admin/hr_manager when the producing service
 * cannot see organisation memberships.
 */
@Injectable()
export class OrganisationMembersClient {
  private readonly logger = new Logger(OrganisationMembersClient.name);

  constructor(private readonly config: ConfigService) {}

  async getUserIdsByRoleNames(organisationId: string, roleNames: string[]): Promise<string[]> {
    const orgUrl = this.config.get<string>('ORGANISATION_SERVICE_URL');
    const internalKey = this.config.get<string>('INTERNAL_API_KEY');
    if (!orgUrl || !internalKey) {
      this.logger.warn('ORGANISATION_SERVICE_URL or INTERNAL_API_KEY is not configured; skipping member lookup');
      return [];
    }

    try {
      const response = await fetch(
        `${orgUrl}/internal/organisations/${encodeURIComponent(organisationId)}/members-by-role?names=${encodeURIComponent(roleNames.join(','))}`,
        {
          headers: {
            'x-internal-api-key': internalKey,
            'x-internal-caller': 'notification-service',
            'x-organisation-id': organisationId,
          },
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => 'Unknown error');
        throw new Error(`Failed to fetch members by role: ${response.status} ${body}`);
      }

      const result = (await response.json()) as { userIds?: string[] };
      return result.userIds ?? [];
    } catch (err) {
      this.logger.error(
        { organisationId, roleNames, error: (err as Error).message },
        'Failed to load organisation members by role',
      );
      // Rethrow so the consumer naks and retries — otherwise the
      // notification would be silently dropped on a transient failure.
      throw err;
    }
  }
}
