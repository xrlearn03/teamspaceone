/// <reference types="jest" />

import { RealtimeGateway } from '../src/realtime/realtime.gateway.js';

describe('RealtimeGateway', () => {
  const config = { get: jest.fn().mockReturnValue('test-secret') } as any;
  const access = { canAccess: jest.fn() } as any;
  const presence = { onMessage: jest.fn(), publish: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should broadcast message.created to the right room', () => {
    const gateway = new RealtimeGateway(config, access, presence);
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

  it('joins a project room only after resource access check succeeds', async () => {
    access.canAccess.mockResolvedValueOnce(true);
    const client = { data: { userId: 'user-1' }, join: jest.fn() } as any;
    const gateway = new RealtimeGateway(config, access, presence);
    await gateway.handleJoinProject(client, 'project-1');
    expect(client.join).toHaveBeenCalledWith('project:project-1');
    expect(access.canAccess).toHaveBeenCalledWith('user-1', 'project', 'project-1');
  });

  it('denies a channel room when access check fails', async () => {
    access.canAccess.mockResolvedValueOnce(false);
    const client = { data: { userId: 'user-1' }, join: jest.fn() } as any;
    const gateway = new RealtimeGateway(config, access, presence);
    await gateway.handleJoin(client, 'channel-1');
    expect(client.join).not.toHaveBeenCalled();
    expect(access.canAccess).toHaveBeenCalledWith('user-1', 'channel', 'channel-1');
  });
});
