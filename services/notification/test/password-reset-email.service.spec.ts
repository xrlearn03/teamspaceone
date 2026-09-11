import { ConfigService } from '@nestjs/config';
import { PasswordResetEmailService } from '../src/notification/password-reset-email.service.js';
import { OrganisationEmailProviderClient } from '../src/notification/organisation-email-provider.client.js';
import { sendEmail } from '../src/notification/mailer.js';

jest.mock('../src/notification/mailer.js', () => ({ sendEmail: jest.fn() }));

const mockedSendEmail = jest.mocked(sendEmail);

describe('PasswordResetEmailService', () => {
  const config = { get: jest.fn() } as unknown as ConfigService;
  const provider = {
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    user: 'mailer@example.com',
    pass: 'secret',
    from: 'mailer@example.com',
    enabled: true,
  };
  const emailProvider = {
    getProviderForUser: jest.fn().mockResolvedValue(provider),
  } as unknown as OrganisationEmailProviderClient;
  const service = new PasswordResetEmailService(config, emailProvider);

  beforeEach(() => jest.clearAllMocks());

  it('uses the recipient organisation provider for password reset email', async () => {
    await service.send({
      eventId: 'event-1',
      eventVersion: 1,
      eventType: 'user.password-reset.requested',
      occurredAt: new Date().toISOString(),
      organisationId: 'global',
      actorId: 'user-1',
      resourceType: 'user',
      resourceId: 'user-1',
      correlationId: 'correlation-1',
      payload: { email: 'user@example.com', code: '123456' },
    });

    expect(emailProvider.getProviderForUser).toHaveBeenCalledWith('user-1');
    expect(mockedSendEmail).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ to: 'user@example.com' }),
      provider,
    );
  });
});
