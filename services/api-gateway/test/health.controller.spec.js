"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const health_controller_js_1 = require("../src/health/health.controller.js");
const nats_client_service_js_1 = require("../src/nats/nats-client.service.js");
describe('HealthController', () => {
    let controller;
    const mockNatsClient = {
        isConnected: jest.fn().mockReturnValue(true),
    };
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            controllers: [health_controller_js_1.HealthController],
            providers: [{ provide: nats_client_service_js_1.NatsClientService, useValue: mockNatsClient }],
        }).compile();
        controller = module.get(health_controller_js_1.HealthController);
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
//# sourceMappingURL=health.controller.spec.js.map