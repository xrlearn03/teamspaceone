import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { AuthorizationClientService } from './authorization.client.js';
import { HrmsPermissionGuard } from './permission.guard.js';
import { HrmsScopeService } from './scope.service.js';
import { EmployeesService } from './employees.service.js';
import { StructureService } from './structure.service.js';
import { AttendanceService } from './attendance.service.js';
import { LeaveService } from './leave.service.js';
import { PayrollService } from './payroll.service.js';
import { DocumentsService } from './documents.service.js';
import { CalendarService } from './calendar.service.js';
import { LifecycleService } from './lifecycle.service.js';
import { PerformanceService } from './performance.service.js';
import { AnalyticsService } from './analytics.service.js';
import {
  DepartmentsController,
  DesignationsController,
  EmployeesController,
  OrgChartController,
} from './employees.controller.js';
import {
  AttendanceController,
  CalendarController,
  DocumentsController,
  LeaveController,
  PayrollController,
} from './workflows.controller.js';
import {
  AnalyticsController,
  GoalsController,
  OffboardingController,
  OnboardingController,
  OnboardingTemplatesController,
  PerformanceCyclesController,
  PerformanceReviewsController,
} from './lifecycle.controller.js';

@Module({
  imports: [PrismaModule, OutboxModule],
  controllers: [
    EmployeesController,
    DepartmentsController,
    DesignationsController,
    OrgChartController,
    AttendanceController,
    LeaveController,
    PayrollController,
    DocumentsController,
    CalendarController,
    OnboardingController,
    OnboardingTemplatesController,
    OffboardingController,
    PerformanceCyclesController,
    PerformanceReviewsController,
    GoalsController,
    AnalyticsController,
  ],
  providers: [
    AuthorizationClientService,
    HrmsPermissionGuard,
    HrmsScopeService,
    EmployeesService,
    StructureService,
    AttendanceService,
    LeaveService,
    PayrollService,
    DocumentsService,
    CalendarService,
    LifecycleService,
    PerformanceService,
    AnalyticsService,
  ],
  // Exported for InterviewHiredConsumer (registered in AppModule), which turns
  // interview `application.hired` events into pending onboarding instances.
  exports: [LifecycleService],
})
export class HrmsModule {}
