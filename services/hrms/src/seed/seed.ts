import { PrismaClient } from '#prisma';

const prisma = new PrismaClient();

/**
 * Development seed for the HRMS module.
 *
 * Creates baseline reference data for one organisation:
 *   - Leave types + balances are created lazily per employee, so only the
 *     leave-type catalogue is seeded here.
 *   - Departments, designations, holidays.
 *   - Optionally, employees when SEED_EMPLOYEES is provided as JSON:
 *       [{ "userId": "...", "firstName": "Ada", "lastName": "Lovelace",
 *          "workEmail": "ada@example.com", "department": "Engineering",
 *          "designation": "Software Engineer", "managerUserId": "..." }]
 *     userId must reference a real user/membership — employees cannot be
 *     invented without a backing user account.
 *
 * Usage:
 *   SEED_ORGANISATION_ID=<org-id> [SEED_EMPLOYEES='[...]'] \
 *     pnpm --filter @teamspace-one/hrms-service db:seed
 *
 * Safe to re-run: everything is findFirst + create.
 */

const LEAVE_TYPES = [
  { name: 'Annual Leave', code: 'AL', annualQuota: 20, isPaid: true },
  { name: 'Sick Leave', code: 'SL', annualQuota: 12, isPaid: true },
  { name: 'Casual Leave', code: 'CL', annualQuota: 8, isPaid: true },
  { name: 'Unpaid Leave', code: 'UL', annualQuota: 0, isPaid: false },
];

const DEPARTMENTS = [
  { name: 'Engineering', description: 'Product engineering and platform' },
  { name: 'People', description: 'HR, recruiting, and people operations' },
  { name: 'Sales', description: 'Revenue and customer growth' },
  { name: 'Finance', description: 'Payroll, accounting, and planning' },
];

const DESIGNATIONS = [
  { title: 'Software Engineer', department: 'Engineering', level: 'L2' },
  { title: 'Senior Software Engineer', department: 'Engineering', level: 'L3' },
  { title: 'Engineering Manager', department: 'Engineering', level: 'M1' },
  { title: 'HR Generalist', department: 'People', level: 'L2' },
  { title: 'Recruiter', department: 'People', level: 'L2' },
  { title: 'Account Executive', department: 'Sales', level: 'L2' },
  { title: 'Payroll Specialist', department: 'Finance', level: 'L2' },
];

const HOLIDAYS = [
  { name: "New Year's Day", month: 1, day: 1 },
  { name: 'Independence Day', month: 7, day: 4 },
  { name: 'Christmas Day', month: 12, day: 25 },
];

interface SeedEmployee {
  userId: string;
  firstName: string;
  lastName: string;
  workEmail?: string;
  department?: string;
  designation?: string;
  managerUserId?: string;
}

async function main() {
  const organisationId = process.env.SEED_ORGANISATION_ID;
  if (!organisationId) {
    throw new Error('SEED_ORGANISATION_ID environment variable is required');
  }

  const year = new Date().getFullYear();

  for (const lt of LEAVE_TYPES) {
    const existing = await prisma.leaveType.findFirst({
      where: { organisationId, code: lt.code },
    });
    if (!existing) {
      await prisma.leaveType.create({ data: { organisationId, ...lt } });
    }
  }
  console.log(`Leave types: ${LEAVE_TYPES.length} ensured`);

  const departmentIds = new Map<string, string>();
  for (const dept of DEPARTMENTS) {
    let row = await prisma.department.findFirst({
      where: { organisationId, name: dept.name },
    });
    if (!row) {
      row = await prisma.department.create({ data: { organisationId, ...dept } });
    }
    departmentIds.set(dept.name, row.id);
  }
  console.log(`Departments: ${DEPARTMENTS.length} ensured`);

  const designationIds = new Map<string, string>();
  for (const des of DESIGNATIONS) {
    let row = await prisma.designation.findFirst({
      where: { organisationId, title: des.title },
    });
    if (!row) {
      row = await prisma.designation.create({
        data: {
          organisationId,
          title: des.title,
          level: des.level,
          departmentId: departmentIds.get(des.department) ?? null,
        },
      });
    }
    designationIds.set(des.title, row.id);
  }
  console.log(`Designations: ${DESIGNATIONS.length} ensured`);

  for (const h of HOLIDAYS) {
    const date = new Date(Date.UTC(year, h.month - 1, h.day));
    const existing = await prisma.holiday.findFirst({
      where: { organisationId, name: h.name, date },
    });
    if (!existing) {
      await prisma.holiday.create({
        data: { organisationId, name: h.name, date, isRecurring: true },
      });
    }
  }
  console.log(`Holidays: ${HOLIDAYS.length} ensured for ${year}`);

  const seedEmployees = process.env.SEED_EMPLOYEES
    ? (JSON.parse(process.env.SEED_EMPLOYEES) as SeedEmployee[])
    : [];

  // Two passes so managerUserId can reference employees seeded earlier.
  const employeeByUser = new Map<string, string>();
  for (const e of seedEmployees) {
    let row = await prisma.employee.findFirst({
      where: { organisationId, userId: e.userId },
    });
    if (!row) {
      row = await prisma.employee.create({
        data: {
          organisationId,
          userId: e.userId,
          firstName: e.firstName,
          lastName: e.lastName,
          workEmail: e.workEmail,
          departmentId: e.department ? departmentIds.get(e.department) : undefined,
          designationId: e.designation ? designationIds.get(e.designation) : undefined,
          joiningDate: new Date(),
        },
      });
    }
    employeeByUser.set(e.userId, row.id);
  }

  for (const e of seedEmployees) {
    if (!e.managerUserId) continue;
    const employeeId = employeeByUser.get(e.userId);
    const managerId = employeeByUser.get(e.managerUserId);
    if (employeeId && managerId) {
      await prisma.employee.update({
        where: { id: employeeId },
        data: { managerEmployeeId: managerId },
      });
    }
  }
  console.log(`Employees: ${seedEmployees.length} ensured`);

  const existingTemplate = await prisma.onboardingTemplate.findFirst({
    where: { organisationId, name: 'Standard onboarding' },
  });
  if (!existingTemplate) {
    const template = await prisma.onboardingTemplate.create({
      data: {
        organisationId,
        name: 'Standard onboarding',
        description: 'Default onboarding checklist for new hires',
      },
    });
    const defaultTasks = [
      { title: 'Set up accounts', category: 'accounts', dueDaysOffset: 0, sortOrder: 0 },
      { title: 'Collect documents', category: 'documents', dueDaysOffset: 1, sortOrder: 1 },
      { title: 'Provision workspace access', category: 'access', dueDaysOffset: 0, sortOrder: 2 },
      { title: 'Intro meeting with manager', category: 'meetings', dueDaysOffset: 1, sortOrder: 3 },
      { title: 'Issue equipment', category: 'equipment', dueDaysOffset: 2, sortOrder: 4 },
      { title: '30-day check-in', category: 'review', dueDaysOffset: 30, sortOrder: 5 },
    ];
    for (const t of defaultTasks) {
      await prisma.onboardingTemplateTask.create({
        data: {
          organisationId,
          templateId: template.id,
          ...t,
        },
      });
    }
    console.log('Onboarding template: Standard onboarding created');
  } else {
    console.log('Onboarding template: Standard onboarding already exists');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
