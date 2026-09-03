import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from '../src/auth/auth.controller.js';
import { AuthService } from '../src/auth/auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;

  const mockService = {
    login: jest.fn().mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com' },
      tokens: { accessToken: 'at', refreshToken: 'rt', expiresIn: 900 },
    }),
    register: jest.fn().mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com' },
      tokens: { accessToken: 'at', refreshToken: 'rt', expiresIn: 900 },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockService },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should log in', async () => {
    const result = await controller.login({ email: 'a@b.com', password: 'password' });
    expect(result.tokens.accessToken).toBe('at');
    expect(mockService.login).toHaveBeenCalledWith({ email: 'a@b.com', password: 'password' });
  });
});
