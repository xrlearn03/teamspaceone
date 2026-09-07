import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentOrganisation,
  type OrganisationContextValue,
} from '@teamspace-one/organisation-context';
import type { AuthorizableUser } from '@teamspace-one/authorization';
import {
  CurrentUser,
  HrmsPermissionGuard,
  RequirePermissions,
} from './permission.guard.js';
import { AttendanceService } from './attendance.service.js';
import { LeaveService } from './leave.service.js';
import { PayrollService } from './payroll.service.js';
import { DocumentsService } from './documents.service.js';
import { CalendarService } from './calendar.service.js';

function toCtx(org: OrganisationContextValue) {
  return {
    organisationId: org.organisationId,
    actorId: org.actorId ?? '',
    correlationId: org.correlationId,
  };
}

export class CorrectionDto {
  attendanceId!: string;
  requestedCheckInAt?: string;
  requestedCheckOutAt?: string;
  reason!: string;
}

export class ReviewDto {
  reviewNote?: string;
}

export class LeaveTypeDto {
  name!: string;
  code!: string;
  annualQuota?: number;
  isPaid?: boolean;
}

export class LeaveRequestDto {
  leaveTypeId!: string;
  startDate!: string;
  endDate!: string;
  days!: number;
  reason?: string;
}

export class PayrollPeriodDto {
  name!: string;
  startDate!: string;
  endDate!: string;
}

export class DocumentDto {
  employeeId!: string;
  fileId!: string;
  category!: string;
  name?: string;
}

export class CalendarEventDto {
  title!: string;
  description?: string;
  startAt!: string;
  endAt!: string;
  allDay?: boolean;
  visibility?: string;
}

@Controller('hrms/attendance')
@UseGuards(HrmsPermissionGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('checkin')
  @RequirePermissions('hrms.attendance.checkin')
  checkIn(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
  ) {
    return this.attendance.checkIn(toCtx(org), user);
  }

  @Post('checkout')
  @RequirePermissions('hrms.attendance.checkout')
  checkOut(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
  ) {
    return this.attendance.checkOut(toCtx(org), user);
  }

  @Get()
  @RequirePermissions('hrms.attendance.view')
  list(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendance.list(toCtx(org), user, {
      employeeId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Post('corrections')
  @RequirePermissions('hrms.attendance.checkin')
  requestCorrection(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Body() dto: CorrectionDto,
  ) {
    return this.attendance.requestCorrection(toCtx(org), user, {
      attendanceId: dto.attendanceId,
      requestedCheckInAt: dto.requestedCheckInAt ? new Date(dto.requestedCheckInAt) : undefined,
      requestedCheckOutAt: dto.requestedCheckOutAt ? new Date(dto.requestedCheckOutAt) : undefined,
      reason: dto.reason,
    });
  }

  @Post('corrections/:id/approve')
  @RequirePermissions('hrms.attendance.approve')
  approveCorrection(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.attendance.reviewCorrection(toCtx(org), user, id, 'approved', dto?.reviewNote);
  }

  @Post('corrections/:id/reject')
  @RequirePermissions('hrms.attendance.approve')
  rejectCorrection(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.attendance.reviewCorrection(toCtx(org), user, id, 'rejected', dto?.reviewNote);
  }
}

@Controller('hrms/leave')
@UseGuards(HrmsPermissionGuard)
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('types')
  @RequirePermissions('hrms.leave.view')
  listTypes(@CurrentOrganisation() org: OrganisationContextValue) {
    return this.leave.listTypes(org.organisationId);
  }

  @Post('types')
  @RequirePermissions('hrms.leave.manage')
  createType(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Body() dto: LeaveTypeDto,
  ) {
    return this.leave.createType(org.organisationId, dto);
  }

  @Get('balances')
  @RequirePermissions('hrms.leave.view')
  balances(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Query('employeeId') employeeId?: string,
    @Query('year') year?: string,
  ) {
    return this.leave.listBalances(
      toCtx(org),
      user,
      employeeId,
      year ? Number(year) : undefined,
    );
  }

  @Post('requests')
  @RequirePermissions('hrms.leave.apply')
  apply(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Body() dto: LeaveRequestDto,
  ) {
    return this.leave.apply(toCtx(org), user, {
      leaveTypeId: dto.leaveTypeId,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      days: dto.days,
      reason: dto.reason,
    });
  }

  @Get('requests')
  @RequirePermissions('hrms.leave.view')
  listRequests(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Query('status') status?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.leave.listRequests(toCtx(org), user, { status, employeeId });
  }

  @Post('requests/:id/approve')
  @RequirePermissions('hrms.leave.approve')
  approve(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.leave.approve(toCtx(org), user, id, dto?.reviewNote);
  }

  @Post('requests/:id/reject')
  @RequirePermissions('hrms.leave.reject')
  reject(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.leave.reject(toCtx(org), user, id, dto?.reviewNote);
  }

  @Post('requests/:id/cancel')
  @RequirePermissions('hrms.leave.apply')
  cancel(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
  ) {
    return this.leave.cancel(toCtx(org), user, id);
  }
}

@Controller('hrms/payroll')
@UseGuards(HrmsPermissionGuard)
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('periods')
  @RequirePermissions('hrms.payroll.view')
  listPeriods(@CurrentOrganisation() org: OrganisationContextValue) {
    return this.payroll.listPeriods(org.organisationId);
  }

  @Post('periods')
  @RequirePermissions('hrms.payroll.manage')
  createPeriod(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Body() dto: PayrollPeriodDto,
  ) {
    return this.payroll.createPeriod(org.organisationId, {
      name: dto.name,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
    });
  }

  @Post('periods/:id/process')
  @RequirePermissions('hrms.payroll.process')
  process(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Param('id') id: string,
  ) {
    return this.payroll.processPeriod(toCtx(org), id);
  }

  @Get('payslips')
  @RequirePermissions('hrms.payroll.view')
  listPayslips(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Query('employeeId') employeeId?: string,
    @Query('periodId') periodId?: string,
  ) {
    return this.payroll.listPayslips(toCtx(org), user, { employeeId, periodId });
  }

  @Get('payslips/:id')
  @RequirePermissions('hrms.payroll.view')
  getPayslip(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
  ) {
    return this.payroll.getPayslip(toCtx(org), user, id);
  }
}

@Controller('hrms/calendar')
@UseGuards(HrmsPermissionGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @RequirePermissions('hrms.access')
  list(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.calendar.list(toCtx(org), user, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Post('events')
  @RequirePermissions('hrms.access')
  create(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Body() dto: CalendarEventDto,
  ) {
    return this.calendar.create(toCtx(org), user, {
      title: dto.title,
      description: dto.description,
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
      allDay: dto.allDay,
      visibility: dto.visibility,
    });
  }
}

@Controller('hrms/documents')
@UseGuards(HrmsPermissionGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermissions('hrms.document.view')
  list(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.documents.list(toCtx(org), user, employeeId);
  }

  @Post()
  @RequirePermissions(['hrms.document.upload', 'hrms.document.view'], false)
  upload(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Body() dto: DocumentDto,
  ) {
    return this.documents.upload(toCtx(org), user, dto);
  }

  @Delete(':id')
  @RequirePermissions(['hrms.document.delete', 'hrms.document.view'], false)
  remove(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
  ) {
    return this.documents.remove(toCtx(org), user, id);
  }
}
