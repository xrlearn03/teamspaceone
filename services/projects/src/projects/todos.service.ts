import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { type CreateTodoDto } from './dto/create-todo.dto.js';
import { type UpdateTodoDto } from './dto/update-todo.dto.js';

@Injectable()
export class TodosService {
  constructor(private readonly prisma: PrismaService) {}

  listTodos(ctx: OrganisationContextValue) {
    return this.prisma.personalTodo.findMany({
      where: { organisationId: ctx.organisationId, userId: this.actor(ctx) },
      orderBy: [
        { completedAt: { sort: 'asc', nulls: 'first' } },
        { position: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async createTodo(ctx: OrganisationContextValue, dto: CreateTodoDto) {
    const userId = this.actor(ctx);
    const title = this.required(dto.title, 'Todo title', 300);
    const position = dto.position ?? await this.prisma.personalTodo.count({
      where: { organisationId: ctx.organisationId, userId, completedAt: null },
    });
    return this.prisma.personalTodo.create({
      data: {
        id: randomUUID(),
        organisationId: ctx.organisationId,
        userId,
        title,
        notes: this.optional(dto.notes, 10000),
        dueDate: this.date(dto.dueDate),
        position,
      },
    });
  }

  async updateTodo(ctx: OrganisationContextValue, todoId: string, dto: UpdateTodoDto) {
    const todo = await this.ownTodo(ctx, todoId);
    const data: Prisma.PersonalTodoUpdateInput = {};
    if (dto.title !== undefined) data.title = this.required(dto.title, 'Todo title', 300);
    if (dto.notes !== undefined) data.notes = dto.notes === null ? null : this.optional(dto.notes, 10000);
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate === null ? null : this.date(dto.dueDate);
    if (dto.completed !== undefined) data.completedAt = dto.completed ? new Date() : null;
    if (dto.position !== undefined) data.position = Math.max(0, Math.trunc(dto.position));
    if (!Object.keys(data).length) throw new BadRequestException('No todo changes supplied');
    return this.prisma.personalTodo.update({ where: { id: todo.id }, data });
  }

  async deleteTodo(ctx: OrganisationContextValue, todoId: string) {
    const todo = await this.ownTodo(ctx, todoId);
    await this.prisma.personalTodo.delete({ where: { id: todo.id } });
  }

  private actor(ctx: OrganisationContextValue) {
    if (!ctx.actorId) throw new ForbiddenException('Missing actor');
    return ctx.actorId;
  }

  private async ownTodo(ctx: OrganisationContextValue, todoId: string) {
    const todo = await this.prisma.personalTodo.findFirst({
      where: { id: todoId, organisationId: ctx.organisationId, userId: this.actor(ctx) },
    });
    if (!todo) throw new NotFoundException('Todo not found');
    return todo;
  }

  private required(value: string | undefined, label: string, max: number) {
    const result = value?.trim();
    if (!result || result.length > max) throw new BadRequestException(`${label} must be between 1 and ${max} characters`);
    return result;
  }

  private optional(value: string | undefined, max: number) {
    const result = value?.trim();
    if (!result) return undefined;
    if (result.length > max) throw new BadRequestException(`Value must not exceed ${max} characters`);
    return result;
  }

  private date(value?: string) {
    if (!value) return undefined;
    const result = new Date(value);
    if (Number.isNaN(result.getTime())) throw new BadRequestException('Invalid date');
    return result;
  }
}
