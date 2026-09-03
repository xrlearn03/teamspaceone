import { RealtimeGateway } from '../src/realtime/realtime.gateway.js';

describe('RealtimeGateway', () => {
  it('should broadcast message.created to the right room', () => {
    const gateway = new RealtimeGateway();
    const to = jest.fn().mockReturnThis();
    const emit = jest.fn();
    (gateway as any).server = { to, emit } as any;

    gateway.broadcast({
      eventId: '1',
      eventType: 'reactify.message.created',
      organisationId: 'org-1',
      actorId: 'user-1',
      resourceType: 'message',
      resourceId: 'm-1',
      timestamp: new Date().toISOString(),
      payload: { channelId: 'ch-1', content: 'hello' },
    } as any);

    expect(to).toHaveBeenCalledWith('channel:ch-1');
    expect(emit).toHaveBeenCalledWith('message.created', { channelId: 'ch-1', content: 'hello' });
  });
});
