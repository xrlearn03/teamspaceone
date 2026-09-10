import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { RemotePermissionGuard, RequirePermissions } from '@teamspace-one/authorization/nest';
import { COLLABORATION_PERMISSIONS } from '@teamspace-one/authorization';
import { ProjectsService } from './projects.service.js';
import { type AddAttachmentDto } from './dto/add-attachment.dto.js';
import { type CreateApprovalDto } from './dto/create-approval.dto.js';
import { type CreateCommentDto } from './dto/create-comment.dto.js';
import { type CreateProjectDto } from './dto/create-project.dto.js';
import { type CreateTaskDto } from './dto/create-task.dto.js';
import { type CreateTaskDependencyDto } from './dto/create-task-dependency.dto.js';
import { type CreateTaskFromMessageDto } from './dto/create-task-from-message.dto.js';
import { type ResolveApprovalDto } from './dto/resolve-approval.dto.js';
import { type UpdateCommentDto } from './dto/update-comment.dto.js';
import { type UpdateProjectDto } from './dto/update-project.dto.js';
import { type UpdateTaskDto } from './dto/update-task.dto.js';

@UseGuards(RemotePermissionGuard)
@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('projects/:id/access')
  resolveAccess(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') projectId: string,
    @Headers('x-actor-id') actorId?: string,
  ) {
    if (!actorId) return null;
    return this.projects.resolveAccess(projectId, actorId, ctx.organisationId);
  }

  @Get('tasks/:id/access')
  resolveTaskAccess(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') taskId: string,
    @Headers('x-actor-id') actorId?: string,
  ) {
    if (!actorId) return null;
    return this.projects.resolveTaskAccess(taskId, actorId, ctx.organisationId);
  }

  @Post('projects')
  @RequirePermissions(COLLABORATION_PERMISSIONS.PROJECT_CREATE)
  createProject(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: CreateProjectDto) {
    return this.projects.createProject(ctx, dto);
  }

  @Get('projects')
  @RequirePermissions(COLLABORATION_PERMISSIONS.PROJECT_VIEW)
  listProjects(@CurrentOrganisation() ctx: OrganisationContextValue, @Query('clientId') clientId?: string) {
    return this.projects.listProjects(ctx, clientId);
  }

  @Get('projects/templates')
  @RequirePermissions(COLLABORATION_PERMISSIONS.PROJECT_VIEW)
  listProjectTemplates(@CurrentOrganisation() ctx: OrganisationContextValue) {
    return this.projects.listProjectTemplates(ctx);
  }

  @Post('projects/from-template/:id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.PROJECT_CREATE)
  createProjectFromTemplate(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') templateId: string,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projects.createProjectFromTemplate(ctx, templateId, dto);
  }

  @Get('projects/:id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.PROJECT_VIEW)
  getProject(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string) {
    return this.projects.getProject(ctx, projectId);
  }

  @Post('projects/:id/template')
  @RequirePermissions(COLLABORATION_PERMISSIONS.PROJECT_MANAGE)
  markProjectAsTemplate(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string) {
    return this.projects.markProjectAsTemplate(ctx, projectId);
  }

  @Delete('projects/:id/template')
  @RequirePermissions(COLLABORATION_PERMISSIONS.PROJECT_MANAGE)
  unmarkProjectAsTemplate(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string) {
    return this.projects.unmarkProjectAsTemplate(ctx, projectId);
  }

  @Patch('projects/:id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.PROJECT_MANAGE)
  updateProject(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string, @Body() dto: UpdateProjectDto) {
    return this.projects.updateProject(ctx, projectId, dto);
  }

  @Delete('projects/:id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.PROJECT_DELETE)
  async deleteProject(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string) {
    await this.projects.deleteProject(ctx, projectId);
  }

  @Post('tasks')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_CREATE)
  createTask(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: CreateTaskDto) {
    return this.projects.createTask(ctx, dto);
  }

  @Post('tasks/from-message')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_CREATE)
  createTaskFromMessage(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: CreateTaskFromMessageDto) {
    return this.projects.createTaskFromMessage(ctx, dto);
  }

  @Get('projects/:id/tasks')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_VIEW)
  listTasks(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string) {
    return this.projects.listTasks(ctx, projectId);
  }

  @Patch('tasks/:id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_EDIT)
  updateTask(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') taskId: string, @Body() dto: UpdateTaskDto) {
    return this.projects.updateTask(ctx, taskId, dto);
  }

  @Delete('tasks/:id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_DELETE)
  async deleteTask(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') taskId: string) {
    await this.projects.deleteTask(ctx, taskId);
  }

  @Get('tasks/:id/dependencies')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_VIEW)
  listTaskDependencies(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') taskId: string) {
    return this.projects.listTaskDependencies(ctx, taskId);
  }

  @Post('tasks/:id/dependencies')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_EDIT)
  addTaskDependency(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') taskId: string, @Body() dto: CreateTaskDependencyDto) {
    return this.projects.addTaskDependency(ctx, taskId, dto);
  }

  @Delete('tasks/:id/dependencies/:dependencyId')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_EDIT)
  async removeTaskDependency(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') taskId: string,
    @Param('dependencyId') dependencyId: string,
  ) {
    await this.projects.removeTaskDependency(ctx, taskId, dependencyId);
  }

  @Get('tasks/:id/attachments')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_VIEW)
  listTaskAttachments(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') taskId: string) {
    return this.projects.listTaskAttachments(ctx, taskId);
  }

  @Post('tasks/:id/attachments')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_UPLOAD)
  addTaskAttachment(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') taskId: string, @Body() dto: AddAttachmentDto) {
    return this.projects.addTaskAttachment(ctx, taskId, dto);
  }

  @Delete('tasks/:id/attachments/:fileId')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_DELETE)
  async removeTaskAttachment(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') taskId: string, @Param('fileId') fileId: string) {
    await this.projects.removeTaskAttachment(ctx, taskId, fileId);
  }

  @Get('projects/:id/comments')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_VIEW)
  listComments(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.projects.listComments(ctx, projectId, cursor, limit ? Number(limit) : 50);
  }

  @Post('projects/:id/comments')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_CREATE)
  createComment(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string, @Body() dto: CreateCommentDto) {
    return this.projects.createComment(ctx, projectId, dto);
  }

  @Patch('project-comments/:id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_EDIT)
  updateComment(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') commentId: string, @Body() dto: UpdateCommentDto) {
    return this.projects.updateComment(ctx, commentId, dto);
  }

  @Delete('project-comments/:id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_DELETE)
  deleteComment(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') commentId: string) {
    return this.projects.deleteComment(ctx, commentId);
  }

  @Get('projects/:id/attachments')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_VIEW)
  listAttachments(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string) {
    return this.projects.listAttachments(ctx, projectId);
  }

  @Post('projects/:id/attachments')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_UPLOAD)
  addAttachment(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string, @Body() dto: AddAttachmentDto) {
    return this.projects.addAttachment(ctx, projectId, dto);
  }

  @Delete('projects/:id/attachments/:fileId')
  @RequirePermissions(COLLABORATION_PERMISSIONS.FILE_DELETE)
  async removeAttachment(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string, @Param('fileId') fileId: string) {
    await this.projects.removeAttachment(ctx, projectId, fileId);
  }

  @Get('approvals')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_VIEW)
  listApprovals(@CurrentOrganisation() ctx: OrganisationContextValue, @Query('projectId') projectId?: string, @Query('status') status?: string) {
    return this.projects.listApprovals(ctx, projectId, status);
  }

  @Post('approvals')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_CREATE)
  createApproval(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: CreateApprovalDto) {
    return this.projects.createApproval(ctx, dto);
  }

  @Patch('approvals/:id')
  @RequirePermissions(COLLABORATION_PERMISSIONS.TASK_EDIT)
  resolveApproval(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') approvalId: string, @Body() dto: ResolveApprovalDto) {
    return this.projects.resolveApproval(ctx, approvalId, dto);
  }

  @Get('projects/:id/activity')
  @RequirePermissions(COLLABORATION_PERMISSIONS.PROJECT_VIEW)
  listActivity(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.projects.listActivity(ctx, projectId, cursor, limit ? Number(limit) : 50);
  }
}
