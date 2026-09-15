/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from '../src/auth/auth.controller.js';
import { AuthService } from '../src/auth/auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;

  const mockConfig = { get: jest.fn((key: string) => key === 'INTERNAL_API_KEY' ? 'secret' : undefined) };
  const mockService = {
    login: jest.fn().mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com' },
      tokens: { accessToken: 'at', refreshToken: 'rt', expiresIn: 900 },
    }),
    register: jest.fn().mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com' },
      tokens: { accessToken: 'at', refreshToken: 'rt', expiresIn: 900 },
    }),
    updateProfileInternal: jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.com', firstName: 'Ada', lastName: 'Lovelace',
    }),
    listSessions: jest.fn().mockResolvedValue([{ id: 's1' }]),
    revokeSession: jest.fn().mockResolvedValue(undefined),
    getPreferences: jest.fn().mockResolvedValue({ smartReplySuggestions: false, autoSummarizeChannels: false }),
    updatePreferences: jest.fn().mockResolvedValue({ smartReplySuggestions: true, autoSummarizeChannels: false }),
    listApiTokens: jest.fn().mockResolvedValue([{ id: 't1', prefix: 'tso_example' }]),
    createApiToken: jest.fn().mockResolvedValue({ id: 't1', token: 'tso_secret' }),
    revokeApiToken: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockService },
        { provide: JwtService, useValue: { signAsync: jest.fn(), verifyAsync: jest.fn() } },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should log in', async () => {
    const result = await controller.login(
      { email: 'a@b.com', password: 'password' },
      { headers: {}, ip: '127.0.0.1' },
    );
    expect(result.tokens.accessToken).toBe('at');
    expect(mockService.login).toHaveBeenCalledWith(
      { email: 'a@b.com', password: 'password' },
      { deviceName: undefined, userAgent: undefined, ipAddress: '127.0.0.1' },
    );
  });

  it('lists and revokes the authenticated user sessions', async () => {
    await expect(controller.listSessions({ user: { sub: 'u1' } })).resolves.toEqual([{ id: 's1' }]);
    await controller.revokeSession({ user: { sub: 'u1' } }, 's1');
    expect(mockService.revokeSession).toHaveBeenCalledWith('u1', 's1');
  });

  it('updates authenticated user preferences', async () => {
    const body = { smartReplySuggestions: true };
    await controller.updatePreferences({ user: { sub: 'u1' } }, body);
    expect(mockService.updatePreferences).toHaveBeenCalledWith('u1', body);
  });

  it('creates and revokes developer API tokens', async () => {
    await expect(controller.createApiToken({ user: { sub: 'u1' } }, { name: 'CLI' })).resolves.toEqual({ id: 't1', token: 'tso_secret' });
    await controller.revokeApiToken({ user: { sub: 'u1' } }, 't1');
    expect(mockService.revokeApiToken).toHaveBeenCalledWith('u1', 't1');
  });

  it('authenticates internal profile synchronization', async () => {
    const dto = { firstName: 'Ada', lastName: 'Lovelace' };
    await controller.internalUpdateProfile('u1', dto, 'secret', 'hrms-service');
    expect(mockService.updateProfileInternal).toHaveBeenCalledWith('u1', dto);
  });

  it('rejects internal profile synchronization without a caller', async () => {
    await expect(controller.internalUpdateProfile('u1', { firstName: 'Ada' }, 'secret')).rejects.toThrow('Unauthorized');
    expect(mockService.updateProfileInternal).not.toHaveBeenCalledWith('u1', { firstName: 'Ada' });
  });
});
