import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import {
  EmployeesService,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from './employees.service.js';
import { StructureService, type DepartmentInput, type DesignationInput, type HolidayInput } from './structure.service.js';

export class CreateEmployeeDto {
  userId!: string;
  membershipId?: string;
  employeeNumber?: string;
  firstName!: string;
  lastName!: string;
  workEmail?: string;
  personalEmail?: string;
  phone?: string;
  avatarFileId?: string;
  departmentId?: string;
  designationId?: string;
  managerEmployeeId?: string;
  joiningDate?: string;
  employmentType?: string;
  dateOfBirth?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  salary?: unknown;
}

export class UpdateEmployeeDto {
  firstName?: string;
  lastName?: string;
  workEmail?: string;
  personalEmail?: string;
  phone?: string;
  avatarFileId?: string;
  departmentId?: string;
  designationId?: string;
  managerEmployeeId?: string;
  joiningDate?: string;
  employmentType?: string;
  status?: string;
  dateOfBirth?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  salary?: unknown;
}

export class DepartmentDto {
  name?: string;
  description?: string;
  parentId?: string;
  headEmployeeId?: string;
  isActive?: boolean;
}

export class DesignationDto {
  title?: string;
  description?: string;
  departmentId?: string;
  level?: string;
  isActive?: boolean;
}

export class HolidayDto {
  name?: string;
  date?: string;
  isRecurring?: boolean;
}

function toCtx(org: OrganisationContextValue) {
  return {
    organisationId: org.organisationId,
    actorId: org.actorId ?? '',
    correlationId: org.correlationId,
  };
}

@Controller('hrms/employees')
@UseGuards(HrmsPermissionGuard)
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions('hrms.employee.view')
  list(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.employees.list(toCtx(org), user, { departmentId, status, search });
  }

  @Post()
  @RequirePermissions('hrms.employee.create')
  create(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Body() dto: CreateEmployeeDto,
  ) {
    const input: CreateEmployeeInput = {
      ...toCtx(org),
      ...dto,
      joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : undefined,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
    };
    return this.employees.create(input);
  }

  @Get('me')
  @RequirePermissions('hrms.employee.view')
  me(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
  ) {
    return this.employees.getMe(toCtx(org), user);
  }

  @Get(':id')
  @RequirePermissions('hrms.employee.view')
  get(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
  ) {
    return this.employees.getById(toCtx(org), user, id);
  }

  @Patch(':id')
  @RequirePermissions('hrms.employee.edit')
  update(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    const input: UpdateEmployeeInput = {
      ...toCtx(org),
      ...dto,
      joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : undefined,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
    };
    return this.employees.update(toCtx(org), user, id, input);
  }

  @Delete(':id')
  @RequirePermissions('hrms.employee.delete')
  remove(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
    @Param('id') id: string,
  ) {
    return this.employees.terminate(toCtx(org), user, id);
  }
}

@Controller('hrms/departments')
@UseGuards(HrmsPermissionGuard)
export class DepartmentsController {
  constructor(private readonly structure: StructureService) {}

  @Get()
  @RequirePermissions('hrms.department.view')
  list(@CurrentOrganisation() org: OrganisationContextValue) {
    return this.structure.listDepartments(org.organisationId);
  }

  @Post()
  @RequirePermissions('hrms.department.create')
  create(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Body() dto: DepartmentDto,
  ) {
    return this.structure.createDepartment(org.organisationId, dto as DepartmentInput);
  }

  @Get(':id')
  @RequirePermissions('hrms.department.view')
  get(@CurrentOrganisation() org: OrganisationContextValue, @Param('id') id: string) {
    return this.structure.getDepartment(org.organisationId, id);
  }

  @Patch(':id')
  @RequirePermissions('hrms.department.edit')
  update(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: DepartmentDto,
  ) {
    return this.structure.updateDepartment(org.organisationId, id, dto as DepartmentInput);
  }

  @Delete(':id')
  @RequirePermissions('hrms.department.delete')
  remove(@CurrentOrganisation() org: OrganisationContextValue, @Param('id') id: string) {
    return this.structure.deleteDepartment(org.organisationId, id);
  }
}

@Controller('hrms/designations')
@UseGuards(HrmsPermissionGuard)
export class DesignationsController {
  constructor(private readonly structure: StructureService) {}

  @Get()
  @RequirePermissions('hrms.designation.view')
  list(@CurrentOrganisation() org: OrganisationContextValue) {
    return this.structure.listDesignations(org.organisationId);
  }

  @Post()
  @RequirePermissions('hrms.designation.create')
  create(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Body() dto: DesignationDto,
  ) {
    return this.structure.createDesignation(org.organisationId, dto as DesignationInput);
  }

  @Get(':id')
  @RequirePermissions('hrms.designation.view')
  get(@CurrentOrganisation() org: OrganisationContextValue, @Param('id') id: string) {
    return this.structure.getDesignation(org.organisationId, id);
  }

  @Patch(':id')
  @RequirePermissions('hrms.designation.edit')
  update(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Param('id') id: string,
    @Body() dto: DesignationDto,
  ) {
    return this.structure.updateDesignation(org.organisationId, id, dto as DesignationInput);
  }

  @Delete(':id')
  @RequirePermissions('hrms.designation.delete')
  remove(@CurrentOrganisation() org: OrganisationContextValue, @Param('id') id: string) {
    return this.structure.deleteDesignation(org.organisationId, id);
  }
}

@Controller('hrms')
@UseGuards(HrmsPermissionGuard)
export class OrgChartController {
  constructor(private readonly structure: StructureService) {}

  @Get('org-chart')
  @RequirePermissions('hrms.org-chart.view')
  orgChart(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
  ) {
    return this.structure.orgChart(toCtx(org), user);
  }

  @Get('overview')
  @RequirePermissions('hrms.access')
  overview(
    @CurrentOrganisation() org: OrganisationContextValue,
    @CurrentUser() user: AuthorizableUser,
  ) {
    return this.structure.overview(toCtx(org), user);
  }

  @Get('holidays')
  @RequirePermissions('hrms.access')
  listHolidays(@CurrentOrganisation() org: OrganisationContextValue) {
    return this.structure.listHolidays(org.organisationId);
  }

  @Post('holidays')
  @RequirePermissions('hrms.leave.manage')
  createHoliday(
    @CurrentOrganisation() org: OrganisationContextValue,
    @Body() dto: HolidayDto,
  ) {
    return this.structure.createHoliday(org.organisationId, {
      ...dto,
      date: dto.date ? new Date(dto.date) : undefined,
    } as HolidayInput);
  }
}
