import {
  can,
  filterNavigation,
  hasAnyPermission,
  hasPermission,
  permissionMatches,
  type AuthorizableUser,
} from '@teamspace-one/authorization';
import { expandPermissions } from '../src/organisation/authorization.service.js';

function user(overrides: Partial<AuthorizableUser> = {}): AuthorizableUser {
  return {
    id: 'user-1',
    organisationId: 'org-1',
    permissions: [],
    dataScopes: [],
    ...overrides,
  };
}

describe('permissionMatches', () => {
  it('matches exact and wildcard permissions', () => {
    expect(permissionMatches('hrms.employee.view', 'hrms.employee.view')).toBe(true);
    expect(permissionMatches('hrms.*', 'hrms.employee.view')).toBe(true);
    expect(permissionMatches('hrms.employee.*', 'hrms.employee.view')).toBe(true);
    expect(permissionMatches('*', 'hrms.employee.view')).toBe(true);
    expect(permissionMatches('hrms.*', 'interview.job.view')).toBe(false);
    expect(permissionMatches('hrms.employee.view', 'hrms.payroll.view')).toBe(false);
  });
});

describe('hasPermission / hasAnyPermission', () => {
  it('grants via wildcard', () => {
    const u = user({ permissions: ['*'] });
    expect(hasPermission(u, 'admin.system.settings')).toBe(true);
  });

  it('any-of semantics', () => {
    const u = user({ permissions: ['hrms.leave.approve'] });
    expect(hasAnyPermission(u, ['hrms.leave.approve', 'admin.role.manage'])).toBe(true);
    expect(hasAnyPermission(u, ['interview.decision.make', 'admin.role.manage'])).toBe(false);
  });
});

describe('can with data scopes', () => {
  it('denies cross-organisation access', () => {
    const u = user({ permissions: ['hrms.employee.view'] });
    expect(can(u, 'hrms.employee.view', { resourceOrganisationId: 'org-2' })).toBe(false);
  });

  it('own scope only matches the user themselves', () => {
    const u = user({
      permissions: ['hrms.employee.view'],
      dataScopes: [{ module: 'hrms', scope: 'own' }],
    });
    expect(can(u, 'hrms.employee.view', { actorIds: ['user-1'] })).toBe(true);
    expect(can(u, 'hrms.employee.view', { actorIds: ['user-2'] })).toBe(false);
    expect(can(u, 'hrms.employee.view')).toBe(true); // permission-only check passes without context
  });

  it('team scope requires a team member actor', () => {
    const u = user({
      permissions: ['hrms.leave.approve'],
      dataScopes: [{ module: 'hrms', scope: 'team' }],
    });
    expect(
      can(u, 'hrms.leave.approve', { actorIds: ['user-9'], teamMemberIds: ['user-9'] }),
    ).toBe(true);
    expect(
      can(u, 'hrms.leave.approve', { actorIds: ['user-9'], teamMemberIds: ['user-5'] }),
    ).toBe(false);
  });

  it('organisation scope allows unconditionally', () => {
    const u = user({
      permissions: ['hrms.employee.view'],
      dataScopes: [{ module: 'hrms', scope: 'organisation' }],
    });
    expect(can(u, 'hrms.employee.view', { actorIds: ['someone'] })).toBe(true);
  });

  it('super admin bypasses checks', () => {
    const u = user({ isSuperAdmin: true });
    expect(can(u, 'hrms.payroll.export', { resourceOrganisationId: 'org-2' })).toBe(true);
  });
});

describe('filterNavigation', () => {
  const items = [
    { id: 'dashboard', label: 'Dashboard', permission: 'dashboard.view' },
    {
      id: 'hrms',
      label: 'HRMS',
      children: [
        { id: 'employees', label: 'Employees', permission: 'hrms.employee.view' },
        { id: 'payroll', label: 'Payroll', permission: 'hrms.payroll.view' },
      ],
    },
    { id: 'payroll-top', label: 'Payroll', permission: 'hrms.payroll.view' },
  ];

  it('hides items the user cannot access, including empty parents', () => {
    const employee = user({ permissions: ['dashboard.view', 'hrms.employee.view'] });
    const filtered = filterNavigation(employee, items);
    expect(filtered.map((i) => i.id)).toEqual(['dashboard', 'hrms']);
    expect(filtered[1].children?.map((c) => c.id)).toEqual(['employees']);
  });

  it('returns nothing for a null user', () => {
    expect(filterNavigation(null, items)).toEqual([]);
  });
});

describe('expandPermissions', () => {
  it('expands allow patterns and applies deny', () => {
    const perms = expandPermissions(['hrms.*'], ['hrms.payroll.*']);
    expect(perms.has('hrms.employee.view')).toBe(true);
    expect([...perms].some((p) => p.startsWith('hrms.payroll.'))).toBe(false);
  });
});
