import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from '../src/projects/projects.controller.js';
import { ProjectsService } from '../src/projects/projects.service.js';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  const service = {
    createProject: jest.fn(), listProjects: jest.fn(), getProject: jest.fn(), updateProject: jest.fn(), deleteProject: jest.fn(),
    createTask: jest.fn(), listTasks: jest.fn(), updateTask: jest.fn(), deleteTask: jest.fn(),
    listComments: jest.fn(), createComment: jest.fn(), updateComment: jest.fn(), deleteComment: jest.fn(),
    listAttachments: jest.fn(), addAttachment: jest.fn(), removeAttachment: jest.fn(), listActivity: jest.fn(),
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
});
