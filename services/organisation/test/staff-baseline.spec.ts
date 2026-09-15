import { DEFAULT_ROLES, expandPermissions } from '../src/organisation/authorization.service.js';

const COMMON = [
  'collaboration.access',
  'collaboration.channel.view',
  'collaboration.message.view',
  'collaboration.message.send',
  'collaboration.meeting.view',
  'collaboration.meeting.create',
  'collaboration.meeting.conduct',
  'collaboration.file.view',
  'collaboration.file.upload',
  'collaboration.project.view',
  'collaboration.task.view',
  'collaboration.ticket.view',
  'collaboration.ticket.create',
  'hrms.access',
  'hrms.attendance.view',
  'hrms.attendance.checkin',
  'hrms.attendance.checkout',
  'hrms.leave.view',
  'hrms.leave.apply',
  'hrms.payroll.view',
  'hrms.document.view',
  'hrms.onboarding.view',
  'hrms.performance.view',
  'hrms.employee.view',
  'dashboard.view',
];

describe('staff baseline permissions', () => {
  it('every internal staff role gets the common surface', () => {
    for (const role of DEFAULT_ROLES) {
      if (role.category === 'candidate' || role.category === 'guest') continue;
      const expanded = expandPermissions(role.allow, role.deny ?? []);
      const missing = COMMON.filter((p) => !expanded.has(p));
      if (missing.length) {
        throw new Error(`${role.name} missing: ${missing.join(', ')}`);
      }
    }
  });

  it('candidate and client stay excluded from the baseline', () => {
    for (const name of ['candidate', 'client']) {
      const role = DEFAULT_ROLES.find((r) => r.name === name)!;
      const expanded = expandPermissions(role.allow, role.deny ?? []);
      expect(expanded.has('collaboration.channel.view')).toBe(false);
      expect(expanded.has('hrms.leave.view')).toBe(false);
    }
  });
});
