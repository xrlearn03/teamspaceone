import { ForbiddenException, Injectable } from '@nestjs/common';
import { can, type AuthorizableUser } from '@teamspace-one/authorization';
import { PrismaService } from '../prisma/prisma.service.js';
import { HrmsScopeService } from './scope.service.js';
import type { RequestContextInput } from './employees.service.js';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: HrmsScopeService,
  ) {}

  async getAnalytics(ctx: RequestContextInput, user: AuthorizableUser) {
    if (!can(user, 'hrms.analytics.view')) {
      throw new ForbiddenException('Missing hrms.analytics.view');
    }

    const resolved = await this.scope.resolve(user, ctx.organisationId);
    const scopedEmployees = await this.prisma.employee.findMany({
      where: { organisationId: ctx.organisationId, AND: [resolved.employeeWhere] },
      select: {
        id: true,
        departmentId: true,
        status: true,
        joiningDate: true,
        updatedAt: true,
      },
    });
    const employeeIds = scopedEmployees.map((e) => e.id);

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    const headcount = scopedEmployees.filter((e) => e.status !== 'terminated').length;

    const departments = await this.prisma.department.findMany({
      where: { organisationId: ctx.organisationId },
    });
    const byDepartment = departments
      .map((d) => ({
        id: d.id,
        name: d.name,
        count: scopedEmployees.filter((e) => e.departmentId === d.id).length,
      }))
      .filter((d) => d.count > 0);

    const byStatus: Record<string, number> = {};
    for (const e of scopedEmployees) {
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    }

    const recentHires = scopedEmployees.filter(
      (e) => e.joiningDate && e.joiningDate >= ninetyDaysAgo,
    ).length;
    const terminations = scopedEmployees.filter(
      (e) => e.status === 'terminated' && e.updatedAt >= ninetyDaysAgo,
    ).length;

    const presentToday = await this.prisma.attendanceRecord.count({
      where: {
        organisationId: ctx.organisationId,
        date: today,
        checkInAt: { not: null },
      },
    });
    const avgAgg = await this.prisma.attendanceRecord.aggregate({
      where: {
        organisationId: ctx.organisationId,
        employeeId: { in: employeeIds },
        date: { gte: thirtyDaysAgo },
      },
      _avg: { workMinutes: true },
    });
    const avgWorkMinutes30d = avgAgg._avg.workMinutes ?? 0;
    const pendingCorrections = await this.prisma.attendanceCorrection.count({
      where: { organisationId: ctx.organisationId, status: 'pending' },
    });

    const pendingRequests = await this.prisma.leaveRequest.count({
      where: {
        organisationId: ctx.organisationId,
        employeeId: { in: employeeIds },
        status: 'pending',
      },
    });
    const approvedThisMonth = await this.prisma.leaveRequest.count({
      where: {
        organisationId: ctx.organisationId,
        employeeId: { in: employeeIds },
        status: 'approved',
        reviewedAt: { gte: startOfMonth },
      },
    });

    const leaveTypes = await this.prisma.leaveType.findMany({
      where: { organisationId: ctx.organisationId },
    });
    const balances = await this.prisma.leaveBalance.findMany({
      where: {
        organisationId: ctx.organisationId,
        employeeId: { in: employeeIds },
        year: now.getFullYear(),
      },
      include: { leaveType: true },
    });
    const usageByType = leaveTypes.map((lt) => {
      const used = balances
        .filter((b) => b.leaveTypeId === lt.id)
        .reduce((sum, b) => sum + b.used, 0);
      const entitled = balances
        .filter((b) => b.leaveTypeId === lt.id)
        .reduce((sum, b) => sum + b.entitled, 0);
      return { name: lt.name, used, entitled };
    });

    const lastPeriod = await this.prisma.payrollPeriod.findFirst({
      where: { organisationId: ctx.organisationId },
      orderBy: { endDate: 'desc' },
    });

    let payroll: { lastPeriodStatus: string; totalNetLastPeriod: number } = {
      lastPeriodStatus: lastPeriod?.status ?? 'N/A',
      totalNetLastPeriod: 0,
    };

    if (lastPeriod && can(user, 'hrms.payroll.view')) {
      const net = await this.prisma.payslip.aggregate({
        where: { payrollPeriodId: lastPeriod.id },
        _sum: { netPay: true },
      });
      payroll = {
        lastPeriodStatus: lastPeriod.status,
        totalNetLastPeriod: net._sum.netPay ?? 0,
      };
    }

    const activeOnboarding = await this.prisma.onboardingInstance.count({
      where: { organisationId: ctx.organisationId, status: 'in_progress' },
    });
    const pendingOnboarding = await this.prisma.onboardingInstance.count({
      where: { organisationId: ctx.organisationId, status: 'pending' },
    });
    const activeOffboarding = await this.prisma.offboardingCase.count({
      where: { organisationId: ctx.organisationId, status: 'initiated' },
    });
    const upcomingReviews = await this.prisma.performanceReview.count({
      where: {
        organisationId: ctx.organisationId,
        status: { in: ['pending', 'in_progress'] },
      },
    });

    const goalGroups = await this.prisma.goal.groupBy({
      by: ['status'],
      where: { employeeId: { in: employeeIds } },
      _count: { id: true },
    });
    const goalByStatus = (status: string) =>
      goalGroups.find((g) => g.status === status)?._count.id ?? 0;

    return {
      headcount,
      byDepartment,
      byStatus,
      recentHires,
      terminations,
      attendance: {
        presentToday,
        avgWorkMinutes30d,
        pendingCorrections,
      },
      leave: {
        pendingRequests,
        approvedThisMonth,
        usageByType,
      },
      payroll,
      lifecycle: {
        activeOnboarding,
        pendingOnboarding,
        activeOffboarding,
        upcomingReviews,
      },
      goals: {
        onTrack: goalByStatus('on_track'),
        atRisk: goalByStatus('at_risk'),
      },
    };
  }
}
