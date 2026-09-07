import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthorizableUser } from '@teamspace-one/authorization';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OutboxService } from '../src/outbox/outbox.service.js';
import { HrmsScopeService } from '../src/hrms/scope.service.js';
import { EmployeesService, sanitizeEmployee } from '../src/hrms/employees.service.js';
import { LeaveService } from '../src/hrms/leave.service.js';
import { PayrollService } from '../src/hrms/payroll.service.js';

const ctx = { organisationId: 'org-1', actorId: 'user-1', correlationId: 'corr-1' };

const orgScopedUser: AuthorizableUser = {
  id: 'user-1',
  organisationId: 'org-1',
  permissions: ['hrms.leave.approve', 'hrms.leave.manage', 'hrms.employee.view'],
  dataScopes: [{ module: 'hrms', scope: 'organisation' }],
};

const teamScopedUser: AuthorizableUser = {
  id: 'user-1',
  organisationId: 'org-1',
  permissions: ['hrms.employee.view'],
  dataScopes: [{ module: 'hrms', scope: 'team' }],
};

const ownScopedUser: AuthorizableUser = {
  id: 'user-2',
  organisationId: 'org-1',
  permissions: ['hrms.employee.view', 'hrms.payroll.view'],
  dataScopes: [{ module: 'hrms', scope: 'own' }],
};

const noScopeUser: AuthorizableUser = {
  id: 'user-3',
  organisationId: 'org-1',
  permissions: ['hrms.employee.view'],
  dataScopes: [],
};

function buildModule(mockPrisma: Record<string, unknown>, mockOutbox: Record<string, unknown>) {
  return Test.createTestingModule({
    providers: [
      HrmsScopeService,
      EmployeesService,
      LeaveService,
      PayrollService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: OutboxService, useValue: mockOutbox },
    ],
  }).compile();
}

describe('HrmsScopeService', () => {
  const actorEmployee = { id: 'emp-1', userId: 'user-1', departmentId: 'dep-1' };

  it('organisation scope sees all employees', async () => {
    const prisma = { employee: { findFirst: jest.fn().mockResolvedValue(actorEmployee) } };
    const module = await buildModule(prisma, {});
    const scope = module.get(HrmsScopeService);
    const resolved = await scope.resolve(orgScopedUser, 'org-1');
    expect(resolved.level).toBe('organisation');
    expect(resolved.employeeWhere).toEqual({});
  });

  it('team scope restricts to direct reports plus self', async () => {
    const prisma = { employee: { findFirst: jest.fn().mockResolvedValue(actorEmployee) } };
    const module = await buildModule(prisma, {});
    const scope = module.get(HrmsScopeService);
    const resolved = await scope.resolve(teamScopedUser, 'org-1');
    expect(resolved.level).toBe('team');
    expect(resolved.employeeWhere).toEqual({
      OR: [{ managerEmployeeId: 'emp-1' }, { id: 'emp-1' }],
    });
  });

  it('own scope restricts to the actor employee record', async () => {
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'emp-2', userId: 'user-2' }),
      },
    };
    const module = await buildModule(prisma, {});
    const scope = module.get(HrmsScopeService);
    const resolved = await scope.resolve(ownScopedUser, 'org-1');
    expect(resolved.level).toBe('own');
    expect(resolved.employeeWhere).toEqual({ id: 'emp-2' });
  });

  it('no scope falls back to own and matches nothing without a record', async () => {
    const prisma = { employee: { findFirst: jest.fn().mockResolvedValue(null) } };
    const module = await buildModule(prisma, {});
    const scope = module.get(HrmsScopeService);
    const resolved = await scope.resolve(noScopeUser, 'org-1');
    expect(resolved.level).toBe('own');
    expect(resolved.employeeWhere).toEqual({ id: '__no_scope__' });
  });
});

describe('EmployeesService', () => {
  const mockOutbox = { createEvent: jest.fn().mockResolvedValue(undefined) };

  it('strips salary when user lacks hrms.payroll.view', () => {
    const employee = { id: 'emp-1', salary: { base: 1000 }, firstName: 'A' };
    const result = sanitizeEmployee(employee, teamScopedUser);
    expect(result).not.toHaveProperty('salary');
    expect(result.firstName).toBe('A');
  });

  it('keeps salary when user has hrms.payroll.view', () => {
    const employee = { id: 'emp-1', salary: { base: 1000 } };
    const result = sanitizeEmployee(employee, ownScopedUser);
    expect(result.salary).toEqual({ base: 1000 });
  });

  it('rejects single-record access outside data scope', async () => {
    const prisma = {
      employee: {
        findFirst: jest.fn().mockImplementation((args: { where: { id?: string; userId?: string } }) => {
          if (args.where.userId === 'user-2') return Promise.resolve({ id: 'emp-2', userId: 'user-2', departmentId: null });
          return Promise.resolve({ id: 'emp-9', userId: 'other', departmentId: 'dep-9', managerEmployeeId: 'emp-99' });
        }),
      },
    };
    const module = await buildModule(prisma, mockOutbox);
    const service = module.get(EmployeesService);
    await expect(service.getById(ctx, ownScopedUser, 'emp-9')).rejects.toThrow(ForbiddenException);
  });
});

describe('LeaveService.approve', () => {
  const mockOutbox = { createEvent: jest.fn().mockResolvedValue(undefined) };

  it('increments LeaveBalance.used inside a transaction on approval', async () => {
    const request = {
      id: 'lr-1',
      organisationId: 'org-1',
      employeeId: 'emp-9',
      leaveTypeId: 'lt-1',
      days: 3,
      startDate: new Date('2024-09-01'),
      status: 'pending',
    };
    const balance = { id: 'lb-1', entitled: 10, used: 2 };
    const balanceUpdate = jest.fn().mockResolvedValue({ ...balance, used: 5 });

    const tx = {
      leaveRequest: {
        update: jest.fn().mockResolvedValue({ ...request, status: 'approved' }),
      },
      leaveBalance: {
        findUnique: jest.fn().mockResolvedValue(balance),
        update: balanceUpdate,
      },
    };
    const prisma = {
      leaveRequest: { findFirst: jest.fn().mockResolvedValue(request) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };

    const module = await buildModule(prisma, mockOutbox);
    const service = module.get(LeaveService);
    const result = await service.approve(ctx, orgScopedUser, 'lr-1');

    expect(result.status).toBe('approved');
    expect(balanceUpdate).toHaveBeenCalledWith({
      where: { id: 'lb-1' },
      data: { used: { increment: 3 } },
    });
    expect(mockOutbox.createEvent).toHaveBeenCalled();
  });

  it('manager-only approval yields manager_approved without touching the balance', async () => {
    const managerUser: AuthorizableUser = {
      id: 'user-1',
      organisationId: 'org-1',
      permissions: ['hrms.leave.approve'],
      dataScopes: [{ module: 'hrms', scope: 'team' }],
    };
    const request = {
      id: 'lr-2',
      organisationId: 'org-1',
      employeeId: 'emp-9',
      leaveTypeId: 'lt-1',
      days: 1,
      startDate: new Date('2024-09-01'),
      status: 'pending',
    };
    const balanceUpdate = jest.fn();
    const tx = {
      leaveRequest: { update: jest.fn().mockResolvedValue({ ...request, status: 'manager_approved' }) },
      leaveBalance: { findUnique: jest.fn(), update: balanceUpdate },
    };
    const prisma = {
      leaveRequest: { findFirst: jest.fn().mockResolvedValue(request) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };

    const module = await buildModule(prisma, mockOutbox);
    const service = module.get(LeaveService);
    const result = await service.approve(ctx, managerUser, 'lr-2');

    expect(result.status).toBe('manager_approved');
    expect(balanceUpdate).not.toHaveBeenCalled();
  });
});

describe('PayrollService', () => {
  it('restricts payslip listing to own employee record without manage permission', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      payslip: { findMany },
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'emp-2', userId: 'user-2' }) },
    };
    const module = await buildModule(prisma, {});
    const service = module.get(PayrollService);

    await service.listPayslips(ctx, ownScopedUser, {});
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [{ employeeId: 'emp-2' }],
        }),
      }),
    );
  });

  it('rejects viewing another employee\'s payslip', async () => {
    const prisma = {
      payslip: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p-1', employeeId: 'emp-9', organisationId: 'org-1' }),
      },
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'emp-2', userId: 'user-2' }) },
    };
    const module = await buildModule(prisma, {});
    const service = module.get(PayrollService);

    await expect(service.getPayslip(ctx, ownScopedUser, 'p-1')).rejects.toThrow(ForbiddenException);
  });

  it('allows viewing any payslip with hrms.payroll.manage', async () => {
    const adminUser: AuthorizableUser = {
      id: 'user-1',
      organisationId: 'org-1',
      permissions: ['hrms.payroll.manage', 'hrms.payroll.view'],
      dataScopes: [{ module: 'hrms', scope: 'organisation' }],
    };
    const payslip = { id: 'p-1', employeeId: 'emp-9', organisationId: 'org-1' };
    const prisma = {
      payslip: { findFirst: jest.fn().mockResolvedValue(payslip) },
      employee: { findFirst: jest.fn() },
    };
    const module = await buildModule(prisma, {});
    const service = module.get(PayrollService);

    await expect(service.getPayslip(ctx, adminUser, 'p-1')).resolves.toEqual(payslip);
  });
});
