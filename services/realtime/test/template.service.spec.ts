/// <reference types="jest" />

import { RealtimeGateway } from '../src/realtime/realtime.gateway.js';

describe('RealtimeGateway', () => {
  it('should broadcast message.created to the right room', () => {
    const gateway = new RealtimeGateway({ get: jest.fn().mockReturnValue('test-secret') } as any);
    const to = jest.fn().mockReturnThis();
    const emit = jest.fn();
    (gateway as any).server = { to, emit } as any;

    gateway.broadcast({
      eventId: '1',
      eventType: 'teamspace-one.message.created',
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

  it('joins a project room only after resource and organisation access checks', async () => {
    const gateway = new RealtimeGateway({ get: jest.fn((key: string, fallback: string) => fallback) } as any);
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ organisationId: 'org-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ allowed: true }) });
    global.fetch = fetchMock as any;
    const client = { data: { userId: 'user-1' }, join: jest.fn() } as any;
    await gateway.handleJoinProject(client, 'project-1');
    expect(client.join).toHaveBeenCalledWith('project:project-1');
  });

  it('denies a channel room when organisation access is rejected', async () => {
    const gateway = new RealtimeGateway({ get: jest.fn((key: string, fallback: string) => fallback) } as any);
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ organisationId: 'org-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ allowed: false }) }) as any;
    const client = { data: { userId: 'user-1' }, join: jest.fn() } as any;
    await gateway.handleJoin(client, 'channel-1');
    expect(client.join).not.toHaveBeenCalled();
  });
});
