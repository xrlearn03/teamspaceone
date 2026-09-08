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
    const result = await controller.login({ email: 'a@b.com', password: 'password' });
    expect(result.tokens.accessToken).toBe('at');
    expect(mockService.login).toHaveBeenCalledWith({ email: 'a@b.com', password: 'password' });
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
