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
  ],
})
export class HrmsModule {}
