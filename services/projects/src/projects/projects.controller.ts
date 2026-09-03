import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@reactify/organisation-context';
import { ProjectsService } from './projects.service.js';
import { type CreateProjectDto } from './dto/create-project.dto.js';
import { type CreateTaskDto } from './dto/create-task.dto.js';
import { type UpdateTaskDto } from './dto/update-task.dto.js';

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post('projects')
  async createProject(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projects.createProject(ctx, dto);
  }

  @Get('projects')
  async listProjects(@CurrentOrganisation() ctx: OrganisationContextValue) {
    return this.projects.listProjects(ctx);
  }

  @Post('tasks')
  async createTask(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Body() dto: CreateTaskDto,
  ) {
    return this.projects.createTask(ctx, dto);
  }

  @Get('projects/:id/tasks')
  async listTasks(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') projectId: string,
  ) {
    return this.projects.listTasks(ctx, projectId);
  }

  @Put('tasks/:id')
  async updateTask(
    @CurrentOrganisation() ctx: OrganisationContextValue,
    @Param('id') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.projects.updateTask(ctx, taskId, dto);
  }
}
