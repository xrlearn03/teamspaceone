import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentOrganisation, type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { RemotePermissionGuard } from '@teamspace-one/authorization/nest';
import { TodosService } from './todos.service.js';
import { type CreateTodoDto } from './dto/create-todo.dto.js';
import { type UpdateTodoDto } from './dto/update-todo.dto.js';

@UseGuards(RemotePermissionGuard)
@Controller('todos')
export class TodosController {
  constructor(private readonly todos: TodosService) {}

  @Get()
  listTodos(@CurrentOrganisation() ctx: OrganisationContextValue) {
    return this.todos.listTodos(ctx);
  }

  @Post()
  createTodo(@CurrentOrganisation() ctx: OrganisationContextValue, @Body() dto: CreateTodoDto) {
    return this.todos.createTodo(ctx, dto);
  }

  @Patch(':id')
  updateTodo(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') todoId: string, @Body() dto: UpdateTodoDto) {
    return this.todos.updateTodo(ctx, todoId, dto);
  }

  @Delete(':id')
  async deleteTodo(@CurrentOrganisation() ctx: OrganisationContextValue, @Param('id') todoId: string) {
    await this.todos.deleteTodo(ctx, todoId);
  }
}
