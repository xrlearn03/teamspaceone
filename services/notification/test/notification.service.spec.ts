import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationController } from '../src/notification/notification.controller.js';
import { NotificationService } from '../src/notification/notification.service.js';
import { PushService } from '../src/notification/push.service.js';
import { OutboxService } from '../src/outbox/outbox.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { Subjects, createEventEnvelope } from '@teamspace-one/event-contracts';

describe('NotificationController', () => {
  let controller: NotificationController;

  const mockService = {
    list: jest.fn().mockResolvedValue([{ id: 'n1', read: false }]),
    countUnread: jest.fn().mockResolvedValue(2),
    markRead: jest.fn().mockResolvedValue({ count: 1 }),
    markAllRead: jest.fn().mockResolvedValue({ count: 3 }),
    getPreferenceForUser: jest.fn().mockResolvedValue({ eventType: Subjects.MESSAGE_CREATED, inApp: true }),
    setPreferenceForUser: jest.fn().mockResolvedValue({ eventType: Subjects.MESSAGE_CREATED, inApp: false }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        { provide: NotificationService, useValue: mockService },
        { provide: PushService, useValue: {} },
      ],
    }).compile();

    controller = module.get<NotificationController>(NotificationController);
  });

  it('lists notifications for the actor', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    const result = await controller.list(ctx);
    expect(result.length).toBe(1);
    expect(mockService.list).toHaveBeenCalledWith(ctx, expect.any(Object));
  });

  it('returns unread count', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    const result = await controller.countUnread(ctx);
    expect(result.count).toBe(2);
    expect(mockService.countUnread).toHaveBeenCalledWith(ctx);
  });

  it('marks a notification read', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    const result = await controller.markRead(ctx, 'n1');
    expect(result.updated).toBe(1);
    expect(mockService.markRead).toHaveBeenCalledWith(ctx, 'n1');
  });

  it('updates notification preferences', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    await controller.setPreference(ctx, Subjects.MESSAGE_CREATED, { email: true } as any);
    expect(mockService.setPreferenceForUser).toHaveBeenCalledWith(ctx, Subjects.MESSAGE_CREATED, {
      email: true,
    });
  });
});

describe('NotificationService', () => {
  let service: NotificationService;
  let tx: any;
  let outbox: { createEvent: jest.Mock };
  let queueAdd: jest.Mock;

  beforeEach(async () => {
    tx = {
      notification: { create: jest.fn() },
      notificationPreference: { findUnique: jest.fn() },
      outboxEvent: { create: jest.fn() },
    };

    const prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      notification: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
      notificationPreference: { findUnique: jest.fn(), upsert: jest.fn() },
      notificationDelivery: { findMany: jest.fn(), update: jest.fn() },
    };

    outbox = { createEvent: jest.fn() };
    queueAdd = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxService, useValue: outbox },
        { provide: getQueueToken('notification'), useValue: { add: queueAdd } },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('creates notifications for message recipients and mentions', async () => {
    tx.notificationPreference.findUnique.mockResolvedValue(null);
    tx.notification.create.mockResolvedValue({
      id: 'n1',
      organisationId: 'org-1',
      workspaceId: null,
      userId: 'user-2',
      actorId: null,
      eventId: 'evt-1',
      eventType: Subjects.MESSAGE_CREATED,
      resourceType: 'message',
      resourceId: 'm1',
      title: 'New message',
      body: 'New message in channel c1',
      link: null,
      read: false,
      deliveries: [{ id: 'd1', channel: 'desktop', status: 'pending' }],
    });

    const envelope = createEventEnvelope({
      eventType: Subjects.MESSAGE_CREATED,
      organisationId: 'org-1',
      workspaceId: 'ws-1',
      actorId: 'user-1',
      resourceType: 'message',
      resourceId: 'm1',
      payload: {
        id: 'm1',
        channelId: 'c1',
        senderId: 'user-1',
        content: 'hello <@user-2>',
      },
    });

    const result = await service.createFromEvent(tx, envelope);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('n1');
    expect(result[0].deliveryIds).toEqual(['d1']);
    expect(tx.notification.create).toHaveBeenCalled();
    expect(outbox.createEvent).toHaveBeenCalled();
  });

  it('skips notifications for unrecognised event types', async () => {
    const envelope = createEventEnvelope({
      eventType: 'teamspace-one.unknown.event',
      organisationId: 'org-1',
      resourceType: 'unknown',
      resourceId: 'u1',
      payload: {},
    });

    const result = await service.createFromEvent(tx, envelope);
    expect(result).toEqual([]);
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('enqueues pending deliveries', async () => {
    await service.enqueueDeliveries(['d1', 'd2']);
    expect(queueAdd).toHaveBeenCalledTimes(2);
    expect(queueAdd).toHaveBeenCalledWith(
      'send',
      { deliveryId: expect.any(String) },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  });
});
