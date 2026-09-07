import { Injectable } from '@nestjs/common';
import { can, type AuthorizableUser } from '@teamspace-one/authorization';
import type { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';

export type ResolvedScope = 'organisation' | 'department' | 'team' | 'own';

export interface ScopeResolution {
  level: ResolvedScope;
  /** The actor's own Employee record (matched by userId), if any. */
  actorEmployee: { id: string; departmentId: string | null } | null;
  /** Prisma where-fragment restricting employee queries to the actor's scope. */
  employeeWhere: Prisma.EmployeeWhereInput;
}

const NO_MATCH: Prisma.EmployeeWhereInput = { id: '__no_scope__' };

/**
 * Translates a user's HRMS data scopes into Prisma filters over employees.
 *
 * - organisation → all employees in the org
 * - department   → employees in the actor's department (or scopeValue)
 * - team         → direct reports of the actor plus the actor themself
 * - own / none   → only the actor's own employee record
 */
@Injectable()
export class HrmsScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async getActorEmployee(organisationId: string, actorId: string) {
    return this.prisma.employee.findFirst({
      where: { organisationId, userId: actorId },
    });
  }

  resolveScopeLevel(user: AuthorizableUser): ResolvedScope {
    if (user.isSuperAdmin) return 'organisation';
    const scopes = (user.dataScopes ?? []).filter(
      (s) => s.module === 'hrms' || s.module === '*',
    );
    if (scopes.some((s) => s.scope === 'organisation')) return 'organisation';
    if (scopes.some((s) => s.scope === 'department')) return 'department';
    if (scopes.some((s) => s.scope === 'team')) return 'team';
    return 'own';
  }

  async resolve(
    user: AuthorizableUser,
    organisationId: string,
  ): Promise<ScopeResolution> {
    const level = this.resolveScopeLevel(user);
    const actorEmployee = await this.getActorEmployee(organisationId, user.id);

    switch (level) {
      case 'organisation':
        return { level, actorEmployee, employeeWhere: {} };
      case 'department': {
        const departmentId =
          (user.dataScopes ?? []).find(
            (s) => (s.module === 'hrms' || s.module === '*') && s.scope === 'department',
          )?.scopeValue ?? actorEmployee?.departmentId;
        if (!departmentId) {
          // No department context — degrade to own record only.
          return {
            level: 'own',
            actorEmployee,
            employeeWhere: actorEmployee ? { id: actorEmployee.id } : NO_MATCH,
          };
        }
        return { level, actorEmployee, employeeWhere: { departmentId } };
      }
      case 'team':
        if (!actorEmployee) {
          return { level, actorEmployee, employeeWhere: NO_MATCH };
        }
        return {
          level,
          actorEmployee,
          employeeWhere: {
            OR: [{ managerEmployeeId: actorEmployee.id }, { id: actorEmployee.id }],
          },
        };
      case 'own':
      default:
        return {
          level: 'own',
          actorEmployee,
          employeeWhere: actorEmployee ? { id: actorEmployee.id } : NO_MATCH,
        };
    }
  }

  /**
   * Returns true when the given employee record is visible inside the
   * resolved scope.
   */
  canSeeEmployee(
    scope: ScopeResolution,
    employee: { id: string; departmentId: string | null; managerEmployeeId: string | null },
  ): boolean {
    switch (scope.level) {
      case 'organisation':
        return true;
      case 'department':
        return (
          !!employee.departmentId &&
          (scope.employeeWhere.departmentId === employee.departmentId ||
            employee.id === scope.actorEmployee?.id)
        );
      case 'team':
        return (
          employee.id === scope.actorEmployee?.id ||
          employee.managerEmployeeId === scope.actorEmployee?.id
        );
      case 'own':
      default:
        return employee.id === scope.actorEmployee?.id;
    }
  }

  /**
   * Payslips: `hrms.payroll.manage` sees all; `hrms.payroll.view` sees own.
   */
  payslipWhere(
    user: AuthorizableUser,
    scope: ScopeResolution,
  ): Prisma.PayslipWhereInput {
    if (can(user, 'hrms.payroll.manage')) return {};
    return scope.actorEmployee ? { employeeId: scope.actorEmployee.id } : { id: '__no_scope__' };
  }
}
