import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthorizableUser } from '@teamspace-one/authorization';
import type { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { HrmsScopeService } from './scope.service.js';
import type { RequestContextInput } from './employees.service.js';

export interface DepartmentInput {
  name?: string;
  description?: string;
  parentId?: string;
  headEmployeeId?: string;
  isActive?: boolean;
}

export interface DesignationInput {
  title?: string;
  description?: string;
  departmentId?: string;
  level?: string;
  isActive?: boolean;
}

export interface HolidayInput {
  name?: string;
  date?: Date;
  isRecurring?: boolean;
}

export interface OrgChartNode {
  id: string;
  name: string;
  designation: string | null;
  department: string | null;
  children: OrgChartNode[];
}

@Injectable()
export class StructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: HrmsScopeService,
  ) {}

  // ---- Departments ----

  listDepartments(organisationId: string) {
    return this.prisma.department.findMany({
      where: { organisationId },
      orderBy: { name: 'asc' },
    });
  }

  async getDepartment(organisationId: string, id: string) {
    const department = await this.prisma.department.findFirst({
      where: { id, organisationId },
    });
    if (!department) throw new NotFoundException('Department not found');
    return department;
  }

  createDepartment(organisationId: string, input: DepartmentInput) {
    return this.prisma.department.create({
      data: {
        organisationId,
        name: input.name!,
        description: input.description,
        parentId: input.parentId,
        headEmployeeId: input.headEmployeeId,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateDepartment(organisationId: string, id: string, input: DepartmentInput) {
    await this.getDepartment(organisationId, id);
    const data: Prisma.DepartmentUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.parentId !== undefined) {
      data.parent = input.parentId ? { connect: { id: input.parentId } } : { disconnect: true };
    }
    if (input.headEmployeeId !== undefined) data.headEmployeeId = input.headEmployeeId;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    return this.prisma.department.update({ where: { id }, data });
  }

  async deleteDepartment(organisationId: string, id: string) {
    await this.getDepartment(organisationId, id);
    return this.prisma.department.delete({ where: { id } });
  }

  // ---- Designations ----

  listDesignations(organisationId: string) {
    return this.prisma.designation.findMany({
      where: { organisationId },
      orderBy: { title: 'asc' },
    });
  }

  async getDesignation(organisationId: string, id: string) {
    const designation = await this.prisma.designation.findFirst({
      where: { id, organisationId },
    });
    if (!designation) throw new NotFoundException('Designation not found');
    return designation;
  }

  createDesignation(organisationId: string, input: DesignationInput) {
    return this.prisma.designation.create({
      data: {
        organisationId,
        title: input.title!,
        description: input.description,
        departmentId: input.departmentId,
        level: input.level,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateDesignation(organisationId: string, id: string, input: DesignationInput) {
    await this.getDesignation(organisationId, id);
    const data: Prisma.DesignationUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.departmentId !== undefined) {
      data.department = input.departmentId
        ? { connect: { id: input.departmentId } }
        : { disconnect: true };
    }
    if (input.level !== undefined) data.level = input.level;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    return this.prisma.designation.update({ where: { id }, data });
  }

  async deleteDesignation(organisationId: string, id: string) {
    await this.getDesignation(organisationId, id);
    return this.prisma.designation.delete({ where: { id } });
  }

  // ---- Holidays ----

  listHolidays(organisationId: string) {
    return this.prisma.holiday.findMany({
      where: { organisationId },
      orderBy: { date: 'asc' },
    });
  }

  createHoliday(organisationId: string, input: HolidayInput) {
    return this.prisma.holiday.create({
      data: {
        organisationId,
        name: input.name!,
        date: input.date!,
        isRecurring: input.isRecurring ?? false,
      },
    });
  }

  // ---- Org chart ----

  async orgChart(ctx: RequestContextInput, user: AuthorizableUser) {
    const resolved = await this.scope.resolve(user, ctx.organisationId);
    const employees = await this.prisma.employee.findMany({
      where: {
        organisationId: ctx.organisationId,
        status: { not: 'terminated' },
        AND: [resolved.employeeWhere],
      },
      include: { department: true, designation: true },
    });

    const byManager = new Map<string, typeof employees>();
    for (const e of employees) {
      if (!e.managerEmployeeId) continue;
      const list = byManager.get(e.managerEmployeeId) ?? [];
      list.push(e);
      byManager.set(e.managerEmployeeId, list);
    }

    const employeeIds = new Set(employees.map((e) => e.id));
    // Roots: employees with no manager, or whose manager is outside this scope.
    const roots = employees.filter(
      (e) => !e.managerEmployeeId || !employeeIds.has(e.managerEmployeeId),
    );

    const toNode = (e: (typeof employees)[number]): OrgChartNode => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      designation: e.designation?.title ?? null,
      department: e.department?.name ?? null,
      children: (byManager.get(e.id) ?? []).map(toNode),
    });

    return roots.map(toNode);
  }

  // ---- Overview ----

  async overview(ctx: RequestContextInput, user: AuthorizableUser) {
    const resolved = await this.scope.resolve(user, ctx.organisationId);
    const employeeWhere: Prisma.EmployeeWhereInput = {
      organisationId: ctx.organisationId,
      AND: [resolved.employeeWhere],
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const scopedEmployees = await this.prisma.employee.findMany({
      where: { ...employeeWhere, status: { not: 'terminated' } },
      select: { id: true, departmentId: true },
    });
    const employeeIds = scopedEmployees.map((e) => e.id);

    const [departments, pendingLeaveRequests, pendingCorrections, presentToday] =
      await Promise.all([
        this.prisma.department.findMany({
          where: { organisationId: ctx.organisationId, isActive: true },
          select: { id: true, name: true },
        }),
        this.prisma.leaveRequest.count({
          where: {
            organisationId: ctx.organisationId,
            status: { in: ['pending', 'manager_approved'] },
            employeeId: { in: employeeIds },
          },
        }),
        this.prisma.attendanceCorrection.count({
          where: {
            organisationId: ctx.organisationId,
            status: 'pending',
            employeeId: { in: employeeIds },
          },
        }),
        this.prisma.attendanceRecord.count({
          where: {
            organisationId: ctx.organisationId,
            employeeId: { in: employeeIds },
            date: { gte: today, lt: tomorrow },
            status: 'present',
          },
        }),
      ]);

    const departmentNames = new Map(departments.map((d) => [d.id, d.name]));
    const byDepartment: Record<string, number> = {};
    for (const e of scopedEmployees) {
      const name = e.departmentId
        ? (departmentNames.get(e.departmentId) ?? 'Unassigned')
        : 'Unassigned';
      byDepartment[name] = (byDepartment[name] ?? 0) + 1;
    }

    return {
      totalEmployees: scopedEmployees.length,
      byDepartment,
      pendingLeaveRequests,
      pendingCorrections,
      presentToday,
    };
  }

  assertCanSee(
    scope: Awaited<ReturnType<HrmsScopeService['resolve']>>,
    employee: { id: string; departmentId: string | null; managerEmployeeId: string | null },
  ): void {
    if (!this.scope.canSeeEmployee(scope, employee)) {
      throw new ForbiddenException('Employee is outside your data scope');
    }
  }
}
