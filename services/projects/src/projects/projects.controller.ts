import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { ProjectsService } from './projects.service.js';
import { type AddAttachmentDto } from './dto/add-attachment.dto.js';
import { type CreateApprovalDto } from './dto/create-approval.dto.js';
import { type CreateCommentDto } from './dto/create-comment.dto.js';
import { type CreateProjectDto } from './dto/create-project.dto.js';
import { type CreateTaskDto } from './dto/create-task.dto.js';
import { type ResolveApprovalDto } from './dto/resolve-approval.dto.js';
import { type UpdateCommentDto } from './dto/update-comment.dto.js';
import { type UpdateProjectDto } from './dto/update-project.dto.js';
import { type UpdateTaskDto } from './dto/update-task.dto.js';

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('projects/:id/access')
  resolveAccess(@Param('id') projectId: string, @Headers('x-actor-id') actorId?: string) {
    if (!actorId) return null;
    return this.projects.resolveAccess(projectId, actorId);
  }

  @Post('projects')
  createProject(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: CreateProjectDto) {
    return this.projects.createProject(ctx, dto);
  }

  @Get('projects')
  listProjects(@CurrentOrganisation() ctx: OrganisationContextValue, @Query('clientId') clientId?: string) {
    return this.projects.listProjects(ctx, clientId);
  }

  @Get('projects/:id')
  getProject(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string) {
    return this.projects.getProject(ctx, projectId);
  }

  @Patch('projects/:id')
  updateProject(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string, @Body() dto: UpdateProjectDto) {
    return this.projects.updateProject(ctx, projectId, dto);
  }

  @Delete('projects/:id')
  async deleteProject(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string) {
    await this.projects.deleteProject(ctx, projectId);
  }

  @Post('tasks')
  createTask(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: CreateTaskDto) {
    return this.projects.createTask(ctx, dto);
  }

  @Get('projects/:id/tasks')
  listTasks(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string) {
    return this.projects.listTasks(ctx, projectId);
  }

  @Patch('tasks/:id')
  updateTask(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') taskId: string, @Body() dto: UpdateTaskDto) {
    return this.projects.updateTask(ctx, taskId, dto);
  }

  @Delete('tasks/:id')
  async deleteTask(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') taskId: string) {
    await this.projects.deleteTask(ctx, taskId);
  }

  @Get('tasks/:id/attachments')
  listTaskAttachments(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') taskId: string) {
    return this.projects.listTaskAttachments(ctx, taskId);
  }

  @Post('tasks/:id/attachments')
  addTaskAttachment(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') taskId: string, @Body() dto: AddAttachmentDto) {
    return this.projects.addTaskAttachment(ctx, taskId, dto);
  }

  @Delete('tasks/:id/attachments/:fileId')
  async removeTaskAttachment(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') taskId: string, @Param('fileId') fileId: string) {
    await this.projects.removeTaskAttachment(ctx, taskId, fileId);
  }

  @Get('projects/:id/comments')
  listComments(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.projects.listComments(ctx, projectId, cursor, limit ? Number(limit) : 50);
  }

  @Post('projects/:id/comments')
  createComment(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string, @Body() dto: CreateCommentDto) {
    return this.projects.createComment(ctx, projectId, dto);
  }

  @Patch('project-comments/:id')
  updateComment(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') commentId: string, @Body() dto: UpdateCommentDto) {
    return this.projects.updateComment(ctx, commentId, dto);
  }

  @Delete('project-comments/:id')
  deleteComment(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') commentId: string) {
    return this.projects.deleteComment(ctx, commentId);
  }

  @Get('projects/:id/attachments')
  listAttachments(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string) {
    return this.projects.listAttachments(ctx, projectId);
  }

  @Post('projects/:id/attachments')
  addAttachment(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string, @Body() dto: AddAttachmentDto) {
    return this.projects.addAttachment(ctx, projectId, dto);
  }

  @Delete('projects/:id/attachments/:fileId')
  async removeAttachment(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string, @Param('fileId') fileId: string) {
    await this.projects.removeAttachment(ctx, projectId, fileId);
  }

  @Get('approvals')
  listApprovals(@CurrentOrganisation() ctx: OrganisationContextValue, @Query('projectId') projectId?: string, @Query('status') status?: string) {
    return this.projects.listApprovals(ctx, projectId, status);
  }

  @Post('approvals')
  createApproval(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: CreateApprovalDto) {
    return this.projects.createApproval(ctx, dto);
  }

  @Patch('approvals/:id')
  resolveApproval(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') approvalId: string, @Body() dto: ResolveApprovalDto) {
    return this.projects.resolveApproval(ctx, approvalId, dto);
  }

  @Get('projects/:id/activity')
  listActivity(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') projectId: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.projects.listActivity(ctx, projectId, cursor, limit ? Number(limit) : 50);
  }
}
