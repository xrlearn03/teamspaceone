import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../src/health/health.controller.js';
import { NatsClientService } from '../src/nats/nats-client.service.js';

describe('HealthController', () => {
  let controller: HealthController;

  const mockNatsClient = {
    isConnected: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: NatsClientService, useValue: mockNatsClient }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return health status', () => {
    expect(controller.health()).toEqual({ status: 'ok', service: 'api-gateway' });
  });

  it('should return ready status', async () => {
    const result = await controller.ready();
    expect(result.status).toBe('ok');
    expect(result.nats).toBe(true);
  });
});
