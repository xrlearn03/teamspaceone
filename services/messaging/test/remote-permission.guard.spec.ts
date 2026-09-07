import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { RemotePermissionGuard, PERMISSION_METADATA_KEY } from '@teamspace-one/authorization/nest';
import type { AuthorizableUser } from '@teamspace-one/authorization';

const OPTIONS = {
  serviceName: 'messaging-service',
  organisationServiceUrl: 'http://organisation-service:3003',
  internalApiKey: 'test-internal-key',
};

function fakeReflector(requirement?: { permissions: string[]; requireAll: boolean }) {
  return { getAllAndOverride: jest.fn().mockImplementation((key: string) => (key === PERMISSION_METADATA_KEY ? requirement : undefined)) } as any;
}

function fakeContext(headers: Record<string, string>) {
  const request: { headers: Record<string, string>; user?: AuthorizableUser } = { headers };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

function fetchReturning(status: number, body: unknown) {
  return jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

const memberUser: AuthorizableUser = {
  id: 'user-1',
  organisationId: 'org-1',
  permissions: ['collaboration.message.send'],
  dataScopes: [],
};

describe('RemotePermissionGuard', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('allows routes without permission metadata', async () => {
    const guard = new RemotePermissionGuard(OPTIONS, fakeReflector(undefined));
    global.fetch = jest.fn();
    const { context } = fakeContext({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects when organisation or actor headers are missing', async () => {
    const guard = new RemotePermissionGuard(OPTIONS, fakeReflector({ permissions: ['collaboration.channel.view'], requireAll: true }));
    global.fetch = jest.fn();
    const { context } = fakeContext({ 'x-organisation-id': 'org-1' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects when the organisation service says the user is not a member', async () => {
    const guard = new RemotePermissionGuard(OPTIONS, fakeReflector({ permissions: ['collaboration.channel.view'], requireAll: true }));
    global.fetch = fetchReturning(404, null);
    const { context } = fakeContext({ 'x-organisation-id': 'org-1', 'x-actor-id': 'user-1' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when the user lacks the required permission', async () => {
    const guard = new RemotePermissionGuard(OPTIONS, fakeReflector({ permissions: ['collaboration.channel.create'], requireAll: true }));
    global.fetch = fetchReturning(200, memberUser);
    const { context } = fakeContext({ 'x-organisation-id': 'org-1', 'x-actor-id': 'user-1' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows and attaches the user when the permission matches', async () => {
    const guard = new RemotePermissionGuard(OPTIONS, fakeReflector({ permissions: ['collaboration.message.send'], requireAll: true }));
    global.fetch = fetchReturning(200, memberUser);
    const { context, request } = fakeContext({ 'x-organisation-id': 'org-1', 'x-actor-id': 'user-1' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(memberUser);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://organisation-service:3003/organisations/org-1/me/context',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-internal-api-key': 'test-internal-key',
          'x-internal-caller': 'messaging-service',
          'x-organisation-id': 'org-1',
          'x-actor-id': 'user-1',
        }),
      }),
    );
  });

  it('serves repeated checks from the cache', async () => {
    const guard = new RemotePermissionGuard(OPTIONS, fakeReflector({ permissions: ['collaboration.message.send'], requireAll: true }));
    global.fetch = fetchReturning(200, memberUser);
    const headers = { 'x-organisation-id': 'org-1', 'x-actor-id': 'user-1' };
    await guard.canActivate(fakeContext(headers).context);
    await guard.canActivate(fakeContext(headers).context);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('honours requireAll=false when any permission matches', async () => {
    const guard = new RemotePermissionGuard(
      OPTIONS,
      fakeReflector({ permissions: ['collaboration.channel.create', 'collaboration.message.send'], requireAll: false }),
    );
    global.fetch = fetchReturning(200, memberUser);
    const { context } = fakeContext({ 'x-organisation-id': 'org-1', 'x-actor-id': 'user-1' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
