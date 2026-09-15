/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from '../src/projects/projects.controller.js';
import { ProjectsService } from '../src/projects/projects.service.js';
import { InboxService } from '../src/inbox/inbox.service.js';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  const service = {
    createProject: jest.fn(), listProjects: jest.fn(), getProject: jest.fn(), updateProject: jest.fn(), deleteProject: jest.fn(),
    createTask: jest.fn(), listTasks: jest.fn(), updateTask: jest.fn(), deleteTask: jest.fn(),
    listComments: jest.fn(), createComment: jest.fn(), updateComment: jest.fn(), deleteComment: jest.fn(),
    listAttachments: jest.fn(), addAttachment: jest.fn(), removeAttachment: jest.fn(), listActivity: jest.fn(),
    listMilestones: jest.fn(), createMilestone: jest.fn(), updateMilestone: jest.fn(), deleteMilestone: jest.fn(),
    listSprints: jest.fn(), createSprint: jest.fn(), updateSprint: jest.fn(), deleteSprint: jest.fn(),
  };
  const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({ controllers: [ProjectsController], providers: [{ provide: ProjectsService, useValue: service }] }).compile();
    controller = module.get(ProjectsController);
  });

  it('creates a project with its production fields', async () => {
    const dto = { name: 'Sprint 1', memberIds: ['user-2'], targetDate: '2026-10-01' };
    service.createProject.mockResolvedValue({ id: 'p-1', ...dto });
    await expect(controller.createProject(ctx, dto)).resolves.toMatchObject({ id: 'p-1' });
    expect(service.createProject).toHaveBeenCalledWith(ctx, dto);
  });

  it('passes complete task updates to the service', async () => {
    const dto = { status: 'in_progress', priority: 'high', dueDate: '2026-09-30', position: 2 };
    await controller.updateTask(ctx, 'task-1', dto);
    expect(service.updateTask).toHaveBeenCalledWith(ctx, 'task-1', dto);
  });

  it('passes comment pagination and mutations', async () => {
    service.listComments.mockResolvedValue({ items: [], nextCursor: null });
    await controller.listComments(ctx, 'p-1', 'comment-50', '25');
    await controller.createComment(ctx, 'p-1', { content: 'Status update' });
    expect(service.listComments).toHaveBeenCalledWith(ctx, 'p-1', 'comment-50', 25);
    expect(service.createComment).toHaveBeenCalledWith(ctx, 'p-1', { content: 'Status update' });
  });

  it('adds and removes project attachments', async () => {
    await controller.addAttachment(ctx, 'p-1', { fileId: 'file-1' });
    await controller.removeAttachment(ctx, 'p-1', 'file-1');
    expect(service.addAttachment).toHaveBeenCalledWith(ctx, 'p-1', { fileId: 'file-1' });
    expect(service.removeAttachment).toHaveBeenCalledWith(ctx, 'p-1', 'file-1');
  });

  it('passes activity pagination', async () => {
    await controller.listActivity(ctx, 'p-1', 'activity-50', '10');
    expect(service.listActivity).toHaveBeenCalledWith(ctx, 'p-1', 'activity-50', 10);
  });

  it('passes milestone and sprint mutations', async () => {
    await controller.listMilestones(ctx, 'p-1');
    await controller.createMilestone(ctx, 'p-1', { name: 'M1' });
    await controller.updateMilestone(ctx, 'p-1', 'm-1', { status: 'completed' });
    await controller.deleteMilestone(ctx, 'p-1', 'm-1');
    expect(service.listMilestones).toHaveBeenCalledWith(ctx, 'p-1');
    expect(service.createMilestone).toHaveBeenCalledWith(ctx, 'p-1', { name: 'M1' });
    expect(service.updateMilestone).toHaveBeenCalledWith(ctx, 'p-1', 'm-1', { status: 'completed' });
    expect(service.deleteMilestone).toHaveBeenCalledWith(ctx, 'p-1', 'm-1');

    await controller.listSprints(ctx, 'p-1');
    await controller.createSprint(ctx, 'p-1', { name: 'S1', startDate: '2026-09-15', endDate: '2026-09-29' });
    await controller.updateSprint(ctx, 'p-1', 's-1', { status: 'active' });
    await controller.deleteSprint(ctx, 'p-1', 's-1');
    expect(service.listSprints).toHaveBeenCalledWith(ctx, 'p-1');
    expect(service.createSprint).toHaveBeenCalledWith(ctx, 'p-1', { name: 'S1', startDate: '2026-09-15', endDate: '2026-09-29' });
    expect(service.updateSprint).toHaveBeenCalledWith(ctx, 'p-1', 's-1', { status: 'active' });
    expect(service.deleteSprint).toHaveBeenCalledWith(ctx, 'p-1', 's-1');
  });
});

describe('InboxService attendance timesheets', () => {
  it('upserts an attendance-backed time entry on checkout', async () => {
    const tx = {
      timeEntry: { upsert: jest.fn() },
      inboxEvent: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
    };
    const service = new InboxService(prisma as any);

    await service.handle({
      eventId: 'event-1',
      eventType: 'teamspace-one.hrms.attendance.checked_out',
      occurredAt: '2026-09-15T17:00:00.000Z',
      organisationId: 'org-1',
      actorId: 'user-1',
      resourceType: 'attendance-record',
      resourceId: 'attendance-1',
      payload: {
        attendanceRecordId: 'attendance-1',
        userId: 'user-1',
        date: '2026-09-15T00:00:00.000Z',
        checkInAt: '2026-09-15T08:00:00.000Z',
        checkOutAt: '2026-09-15T17:00:00.000Z',
        workMinutes: 480,
      },
    } as any);

    expect(tx.timeEntry.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { attendanceRecordId: 'attendance-1' },
      create: expect.objectContaining({
        userId: 'user-1',
        label: 'Attendance',
        minutes: 480,
        billable: false,
      }),
    }));
    expect(tx.inboxEvent.create).toHaveBeenCalled();
  });
});
