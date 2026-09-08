import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthorizableUser } from '@teamspace-one/authorization';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OutboxService } from '../src/outbox/outbox.service.js';
import { HrmsScopeService } from '../src/hrms/scope.service.js';
import { EmployeesService, sanitizeEmployee } from '../src/hrms/employees.service.js';
import { LeaveService } from '../src/hrms/leave.service.js';
import { PayrollService } from '../src/hrms/payroll.service.js';
import { LifecycleService } from '../src/hrms/lifecycle.service.js';
import { PerformanceService } from '../src/hrms/performance.service.js';
import { AnalyticsService } from '../src/hrms/analytics.service.js';

const ctx = { organisationId: 'org-1', actorId: 'user-1', correlationId: 'corr-1' };

const orgScopedUser: AuthorizableUser = {
  id: 'user-1',
  organisationId: 'org-1',
  permissions: ['hrms.leave.approve', 'hrms.leave.manage', 'hrms.employee.view'],
  dataScopes: [{ module: 'hrms', scope: 'organisation' }],
};

const employeeEditor: AuthorizableUser = {
  id: 'user-1',
  organisationId: 'org-1',
  permissions: ['hrms.employee.view', 'hrms.employee.edit'],
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
      LifecycleService,
      PerformanceService,
      AnalyticsService,
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

  it('persists employee number updates', async () => {
    const existing = {
      id: 'emp-1',
      userId: 'user-1',
      employeeNumber: null,
      departmentId: null,
      managerEmployeeId: null,
    };
    const update = jest.fn().mockResolvedValue({ ...existing, employeeNumber: 'EMP-001' });
    const transactionClient = {
      employee: { update },
      employeeHistory: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue(existing) },
      $transaction: jest.fn((fn: (tx: typeof transactionClient) => unknown) => fn(transactionClient)),
    };
    const module = await buildModule(prisma, mockOutbox);
    const service = module.get(EmployeesService);

    await service.update(ctx, employeeEditor, 'emp-1', { ...ctx, employeeNumber: 'EMP-001' });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { employeeNumber: 'EMP-001' },
    });
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
      endDate: new Date('2024-09-04'),
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
      employee: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'user-9', firstName: 'A', lastName: 'B' }),
      },
      calendarEvent: { upsert: jest.fn().mockResolvedValue({}) },
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
      endDate: new Date('2024-09-02'),
      status: 'pending',
    };
    const balanceUpdate = jest.fn();
    const tx = {
      leaveRequest: { update: jest.fn().mockResolvedValue({ ...request, status: 'manager_approved' }) },
      leaveBalance: { findUnique: jest.fn(), update: balanceUpdate },
      employee: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'user-9', firstName: 'A', lastName: 'B' }),
      },
      calendarEvent: { upsert: jest.fn().mockResolvedValue({}) },
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
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn({})),
    };
    const module = await buildModule(prisma, { createEvent: jest.fn().mockResolvedValue(undefined) });
    const service = module.get(PayrollService);

    await expect(service.getPayslip(ctx, adminUser, 'p-1')).resolves.toEqual(payslip);
  });

  it('processPeriod generates draft payslips for salaried employees and emits an event', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const tx = {
      payrollPeriod: {
        update: jest.fn().mockResolvedValue({ id: 'pp-1', status: 'processed' }),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'emp-1', salary: { base: 5000, currency: 'EUR' } },
          { id: 'emp-2', salary: { base: 3000 } },
        ]),
      },
      payslip: { upsert },
    };
    const prisma = {
      payrollPeriod: { findFirst: jest.fn().mockResolvedValue({ id: 'pp-1', status: 'draft' }) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const outbox = { createEvent: jest.fn().mockResolvedValue(undefined) };
    const module = await buildModule(prisma, outbox);
    const service = module.get(PayrollService);

    const result = await service.processPeriod(ctx, 'pp-1');
    expect(result.payslipsGenerated).toBe(2);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          employeeId: 'emp-1',
          grossPay: 5000,
          netPay: 5000,
          currency: 'EUR',
          status: 'draft',
        }),
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ employeeId: 'emp-2', currency: 'USD' }),
      }),
    );
    expect(outbox.createEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'teamspace-one.hrms.payroll.period.processed',
      }),
      'teamspace-one.hrms.payroll.period.processed',
    );
  });

  it('processPeriod rejects an already-paid period', async () => {
    const prisma = {
      payrollPeriod: { findFirst: jest.fn().mockResolvedValue({ id: 'pp-1', status: 'paid' }) },
    };
    const module = await buildModule(prisma, {});
    const service = module.get(PayrollService);

    await expect(service.processPeriod(ctx, 'pp-1')).rejects.toThrow(BadRequestException);
  });

  it('approvePeriod requires processed status', async () => {
    const prisma = {
      payrollPeriod: { findFirst: jest.fn().mockResolvedValue({ id: 'pp-1', status: 'draft' }) },
    };
    const module = await buildModule(prisma, {});
    const service = module.get(PayrollService);

    await expect(service.approvePeriod(ctx, 'pp-1')).rejects.toThrow(BadRequestException);
  });

  it('markPaid marks all payslips paid and emits an event', async () => {
    const tx = {
      payrollPeriod: {
        update: jest.fn().mockResolvedValue({ id: 'pp-1', status: 'paid' }),
      },
      payslip: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      payrollPeriod: { findFirst: jest.fn().mockResolvedValue({ id: 'pp-1', status: 'approved' }) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const outbox = { createEvent: jest.fn().mockResolvedValue(undefined) };
    const module = await buildModule(prisma, outbox);
    const service = module.get(PayrollService);

    const result = await service.markPaid(ctx, 'pp-1');
    expect(result.status).toBe('paid');
    expect(tx.payslip.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'paid' } }),
    );
    expect(outbox.createEvent).toHaveBeenCalled();
  });

  it('markPaid rejects a period that is not approved', async () => {
    const prisma = {
      payrollPeriod: { findFirst: jest.fn().mockResolvedValue({ id: 'pp-1', status: 'processed' }) },
    };
    const module = await buildModule(prisma, {});
    const service = module.get(PayrollService);

    await expect(service.markPaid(ctx, 'pp-1')).rejects.toThrow(BadRequestException);
  });

  it('exportCsv returns a CSV and emits a payroll.exported audit event', async () => {
    const adminUser: AuthorizableUser = {
      id: 'user-1',
      organisationId: 'org-1',
      permissions: ['hrms.payroll.export', 'hrms.payroll.manage'],
      dataScopes: [{ module: 'hrms', scope: 'organisation' }],
    };
    const prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'emp-1', userId: 'user-1' }) },
      payslip: {
        findMany: jest.fn().mockResolvedValue([
          {
            employeeId: 'emp-9',
            grossPay: 5000,
            netPay: 4200,
            currency: 'USD',
            status: 'paid',
            earnings: { base: 5000 },
            deductions: { tax: 800 },
            employee: { firstName: 'Jane', lastName: 'Doe' },
          },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn({})),
    };
    const outbox = { createEvent: jest.fn().mockResolvedValue(undefined) };
    const module = await buildModule(prisma, outbox);
    const service = module.get(PayrollService);

    const csv = await service.exportCsv(ctx, adminUser, 'pp-1');
    const lines = csv.split('\n');
    expect(lines[0]).toBe('employeeId,employeeName,grossPay,netPay,currency,status,earnings,deductions');
    expect(lines[1]).toContain('emp-9');
    expect(lines[1]).toContain('"Jane Doe"');
    expect(outbox.createEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'teamspace-one.hrms.payroll.exported' }),
      'teamspace-one.hrms.payroll.exported',
    );
  });
});

describe('LifecycleService', () => {
  const mockOutbox = { createEvent: jest.fn().mockResolvedValue(undefined) };

  it('completing the last pending onboarding task finalises the instance', async () => {
    const instance = {
      id: 'onb-1',
      organisationId: 'org-1',
      employeeId: 'emp-1',
      status: 'in_progress',
      tasks: [{ id: 'ot-1', assigneeUserId: null, status: 'pending' }],
    };
    const tx = {
      onboardingTask: {
        update: jest.fn().mockResolvedValue({ id: 'ot-1', status: 'completed' }),
        count: jest.fn().mockResolvedValue(0),
      },
      onboardingInstance: {
        update: jest.fn().mockResolvedValue({ ...instance, status: 'completed' }),
      },
    };
    const prisma = {
      onboardingInstance: { findFirst: jest.fn().mockResolvedValue(instance) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const module = await buildModule(prisma, mockOutbox);
    const service = module.get(LifecycleService);
    const user: AuthorizableUser = {
      id: 'user-1',
      organisationId: 'org-1',
      permissions: ['hrms.onboarding.manage'],
      dataScopes: [{ module: 'hrms', scope: 'organisation' }],
    };

    const result = await service.completeTask(ctx, user, 'onb-1', 'ot-1');
    expect(result.status).toBe('completed');
    expect(tx.onboardingInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'completed' }),
      }),
    );
    expect(mockOutbox.createEvent).toHaveBeenCalled();
  });

  it('completing an offboarding case terminates the employee', async () => {
    const case_ = {
      id: 'off-1',
      organisationId: 'org-1',
      employeeId: 'emp-9',
      status: 'in_progress',
      type: 'resignation',
      tasks: [],
    };
    const employee = { id: 'emp-9', organisationId: 'org-1', status: 'active', userId: 'user-9' };
    const tx = {
      employee: { update: jest.fn().mockResolvedValue({ ...employee, status: 'terminated' }) },
      employeeHistory: { create: jest.fn().mockResolvedValue({}) },
      offboardingCase: { update: jest.fn().mockResolvedValue({ ...case_, status: 'completed' }) },
    };
    const prisma = {
      offboardingCase: { findFirst: jest.fn().mockResolvedValue(case_) },
      employee: { findFirst: jest.fn().mockResolvedValue(employee) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const module = await buildModule(prisma, mockOutbox);
    const service = module.get(LifecycleService);
    const user: AuthorizableUser = orgScopedUser;

    const result = await service.completeCase(ctx, user, 'off-1');
    expect(result.status).toBe('completed');
    expect(tx.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'terminated' }),
      }),
    );
    expect(mockOutbox.createEvent).toHaveBeenCalled();
  });

  it('forbids task completion by a user who is not assignee, employee, or manager', async () => {
    const instance = {
      id: 'onb-1',
      organisationId: 'org-1',
      employeeId: 'emp-9',
      status: 'in_progress',
      tasks: [{ id: 'ot-1', assigneeUserId: 'user-7', status: 'pending' }],
    };
    const prisma = {
      onboardingInstance: { findFirst: jest.fn().mockResolvedValue(instance) },
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'emp-2', userId: 'user-2' }) },
    };
    const module = await buildModule(prisma, mockOutbox);
    const service = module.get(LifecycleService);
    const user: AuthorizableUser = {
      id: 'user-2',
      organisationId: 'org-1',
      permissions: ['hrms.onboarding.view'],
      dataScopes: [{ module: 'hrms', scope: 'own' }],
    };

    await expect(service.completeTask(ctx, user, 'onb-1', 'ot-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('convertToEmployee rejects instances that are not pending', async () => {
    const prisma = {
      onboardingInstance: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'onb-1',
          organisationId: 'org-1',
          status: 'in_progress',
        }),
      },
    };
    const module = await buildModule(prisma, mockOutbox);
    const service = module.get(LifecycleService);

    await expect(
      service.convertToEmployee(ctx, orgScopedUser, 'onb-1', {
        firstName: 'A',
        lastName: 'B',
        userId: 'user-9',
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('initiate creates the default offboarding tasks and emits an event', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 4 });
    const tx = {
      offboardingCase: { create: jest.fn().mockResolvedValue({ id: 'off-1' }) },
      offboardingTask: { createMany },
    };
    const case_ = { id: 'off-1', organisationId: 'org-1', status: 'in_progress', tasks: [] };
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'emp-9', organisationId: 'org-1' }),
      },
      offboardingCase: { findFirst: jest.fn().mockResolvedValue(case_) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const module = await buildModule(prisma, mockOutbox);
    const service = module.get(LifecycleService);

    await service.initiate(ctx, { employeeId: 'emp-9', type: 'resignation' });
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ category: 'access' }),
          expect.objectContaining({ category: 'settlement' }),
        ]),
      }),
    );
    expect(mockOutbox.createEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'teamspace-one.hrms.offboarding.initiated',
      }),
      'teamspace-one.hrms.offboarding.initiated',
    );
  });

  it('cancelOnboarding rejects a completed instance', async () => {
    const prisma = {
      onboardingInstance: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'onb-1',
          organisationId: 'org-1',
          status: 'completed',
        }),
      },
    };
    const module = await buildModule(prisma, mockOutbox);
    const service = module.get(LifecycleService);

    await expect(service.cancelOnboarding(ctx, 'onb-1')).rejects.toThrow(BadRequestException);
  });
});

describe('PerformanceService', () => {
  it('limits reviews to the actors own employee record', async () => {
    const actor = { id: 'emp-2', userId: 'user-2' };
    const reviews = [
      { id: 'pr-1', employeeId: 'emp-2', cycleId: null },
      { id: 'pr-2', employeeId: 'emp-9', cycleId: null },
    ];
    const findMany = jest.fn().mockResolvedValue(reviews.filter((r) => r.employeeId === actor.id));
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue(actor),
        findMany: jest.fn().mockResolvedValue([actor]),
      },
      performanceReview: { findMany },
    };
    const module = await buildModule(prisma, {});
    const service = module.get(PerformanceService);

    const result = await service.listReviews(ctx, ownScopedUser, {});
    expect(result.length).toBe(1);
    expect(result[0].employeeId).toBe('emp-2');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ employee: { id: 'emp-2' } }),
      }),
    );
  });

  it('rejects review updates from users who are neither reviewer nor manager', async () => {
    const review = {
      id: 'pr-1',
      organisationId: 'org-1',
      reviewerId: 'user-9',
      employeeId: 'emp-9',
      employee: { userId: 'user-8' },
    };
    const prisma = {
      performanceReview: { findFirst: jest.fn().mockResolvedValue(review) },
    };
    const module = await buildModule(prisma, {});
    const service = module.get(PerformanceService);

    await expect(
      service.updateReview(ctx, ownScopedUser, 'pr-1', { overallRating: 4 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets the assigned reviewer submit a review', async () => {
    const review = {
      id: 'pr-1',
      organisationId: 'org-1',
      reviewerId: 'user-2',
      employeeId: 'emp-9',
      employee: { userId: 'user-8' },
    };
    const update = jest.fn().mockResolvedValue({ ...review, status: 'submitted' });
    const prisma = {
      performanceReview: { findFirst: jest.fn().mockResolvedValue(review), update },
    };
    const module = await buildModule(prisma, {});
    const service = module.get(PerformanceService);

    const result = await service.updateReview(ctx, ownScopedUser, 'pr-1', { overallRating: 4 });
    expect(result.status).toBe('submitted');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'submitted', overallRating: 4 }),
      }),
    );
  });

  it('rejects acknowledgement by anyone other than the reviewee', async () => {
    const review = {
      id: 'pr-1',
      organisationId: 'org-1',
      employeeId: 'emp-9',
      employee: { userId: 'user-8' },
    };
    const prisma = {
      performanceReview: { findFirst: jest.fn().mockResolvedValue(review) },
    };
    const module = await buildModule(prisma, {});
    const service = module.get(PerformanceService);

    await expect(service.acknowledgeReview(ctx, ownScopedUser, 'pr-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects goal updates from non-owners without manage permission', async () => {
    const goal = {
      id: 'goal-1',
      organisationId: 'org-1',
      employeeId: 'emp-9',
      employee: { userId: 'user-8' },
    };
    const prisma = {
      goal: { findFirst: jest.fn().mockResolvedValue(goal) },
    };
    const module = await buildModule(prisma, {});
    const service = module.get(PerformanceService);

    await expect(
      service.updateGoal(ctx, ownScopedUser, 'goal-1', { progress: 50 }),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('AnalyticsService', () => {
  it('returns the expected shape and gates payroll totals when payroll.view is missing', async () => {
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'emp-2', userId: 'user-2' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'emp-2', departmentId: null, status: 'active', joiningDate: new Date(), updatedAt: new Date() }]),
      },
      department: { findMany: jest.fn().mockResolvedValue([]) },
      attendanceRecord: {
        count: jest.fn().mockResolvedValue(1),
        aggregate: jest.fn().mockResolvedValue({ _avg: { workMinutes: 120 } }),
      },
      attendanceCorrection: { count: jest.fn().mockResolvedValue(0) },
      leaveRequest: { count: jest.fn().mockResolvedValue(0) },
      leaveType: { findMany: jest.fn().mockResolvedValue([]) },
      leaveBalance: { findMany: jest.fn().mockResolvedValue([]) },
      payrollPeriod: { findFirst: jest.fn().mockResolvedValue({ id: 'pp-1', status: 'approved' }) },
      payslip: { aggregate: jest.fn() },
      onboardingInstance: { count: jest.fn().mockResolvedValue(0) },
      offboardingCase: { count: jest.fn().mockResolvedValue(0) },
      performanceReview: { count: jest.fn().mockResolvedValue(0) },
      goal: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const module = await buildModule(prisma, {});
    const service = module.get(AnalyticsService);
    const user: AuthorizableUser = {
      id: 'user-2',
      organisationId: 'org-1',
      permissions: ['hrms.analytics.view'],
      dataScopes: [{ module: 'hrms', scope: 'own' }],
    };

    const result = await service.getAnalytics(ctx, user);
    expect(result).toHaveProperty('headcount');
    expect(result).toHaveProperty('byDepartment');
    expect(result).toHaveProperty('payroll');
    expect(result.payroll.lastPeriodStatus).toBe('approved');
    expect(result.payroll.totalNetLastPeriod).toBe(0);
    expect(prisma.payslip.aggregate).not.toHaveBeenCalled();
  });
});
