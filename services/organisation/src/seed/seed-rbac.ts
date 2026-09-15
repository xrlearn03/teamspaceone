import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '#prisma';
import { ALL_PERMISSIONS, permissionParts, permissionKey } from '@teamspace-one/authorization';
import { DEFAULT_ROLES, expandPermissions } from '../organisation/authorization.service.js';

const prisma = new PrismaClient();

const scopeKey = (s: { module: string; scope: string; scopeValue: string | null }) =>
  `${s.module}|${s.scope}|${s.scopeValue ?? ''}`;

/**
 * Full RBAC seed + backfill:
 *  1. Upserts the global permission registry.
 *  2. Ensures every organisation has the system role templates (with
 *     role_permissions and role_scopes), backfilling any that predate RBAC.
 *  3. Copies role scopes onto memberships that have no data_scopes yet.
 *
 * Safe to re-run: everything is keyed and uses skipDuplicates/upserts.
 */
async function main() {
  // 1. Permission registry.
  const permissionOps: Prisma.PrismaPromise<unknown>[] = [];
  for (const permission of ALL_PERMISSIONS) {
    const { module, resource, action } = permissionParts(permission);
    if (!module || !resource || !action) {
      console.warn(`Skipping malformed permission: ${permission}`);
      continue;
    }
    permissionOps.push(
      prisma.permission.upsert({
        where: { module_resource_action: { module, resource, action } },
        update: {},
        create: { id: randomUUID(), module, resource, action, description: null },
      }),
    );
  }
  await prisma.$transaction(permissionOps);

  const allPermissions = await prisma.permission.findMany();
  const permissionMap = new Map(
    allPermissions.map((p) => [permissionKey(p.module, p.resource, p.action), p.id]),
  );
  console.log(`Permission registry: ${allPermissions.length} permissions`);

  // 2. Roles per organisation.
  const organisations = await prisma.organisation.findMany({ select: { id: true, slug: true } });
  let rolesCreated = 0;
  let rolesBackfilled = 0;

  for (const org of organisations) {
    for (const template of DEFAULT_ROLES) {
      const concrete = expandPermissions(template.allow, template.deny ?? []);
      const permissionIds = [...concrete]
        .map((p) => permissionMap.get(p))
        .filter((id): id is string => Boolean(id));

      let role = await prisma.role.findFirst({
        where: { organisationId: org.id, name: template.name },
      });

      if (!role) {
        role = await prisma.role.create({
          data: {
            id: randomUUID(),
            organisationId: org.id,
            name: template.name,
            description: template.label,
            roleCategory: template.category,
            isSystem: template.isSystem,
            isDefault: template.isDefault ?? false,
            permissions: [],
          },
        });
        rolesCreated += 1;
      } else if (role.roleCategory !== template.category || role.description !== template.label) {
        await prisma.role.update({
          where: { id: role.id },
          data: { roleCategory: template.category, description: template.label },
        });
      }

      const existingRolePermissions = await prisma.rolePermission.findMany({
        where: { roleId: role.id },
        select: { permissionId: true },
      });
      const existingIds = new Set(existingRolePermissions.map((rp) => rp.permissionId));
      const missingIds = permissionIds.filter((id) => !existingIds.has(id));
      // New roles always get the full template. Existing roles are only topped
      // up when they are system-managed — that is what lets a re-run pick up
      // permissions added to the catalogue after the role was created.
      if (missingIds.length > 0 && (role.isSystem || existingRolePermissions.length === 0)) {
        await prisma.rolePermission.createMany({
          data: missingIds.map((permissionId) => ({
            id: randomUUID(),
            roleId: role.id,
            permissionId,
          })),
          skipDuplicates: true,
        });
        rolesBackfilled += 1;
      }

      const existingRoleScopes = await prisma.roleScope.findMany({
        where: { roleId: role.id },
        select: { module: true, scope: true, scopeValue: true },
      });
      const existingScopeKeys = new Set(existingRoleScopes.map(scopeKey));
      const missingScopes = template.scopes.filter(
        (s) => !existingScopeKeys.has(scopeKey({ ...s, scopeValue: s.scopeValue ?? null })),
      );
      // Same top-up rule as permissions: system-managed roles pick up scopes
      // added to the template after the role was created.
      if (missingScopes.length > 0 && (role.isSystem || existingRoleScopes.length === 0)) {
        await prisma.roleScope.createMany({
          data: missingScopes.map((s) => ({
            id: randomUUID(),
            roleId: role.id,
            module: s.module,
            scope: s.scope,
            scopeValue: s.scopeValue ?? null,
          })),
        });
      }
    }
  }

  // 3. Membership data scopes — top up memberships missing scopes their
  // role grants (covers both unscoped memberships and roles that gained
  // scopes after the membership was created).
  const memberships = await prisma.organisationMembership.findMany({
    select: {
      id: true,
      roleId: true,
      dataScopes: { select: { module: true, scope: true, scopeValue: true } },
    },
  });
  let membershipsBackfilled = 0;

  for (const membership of memberships) {
    if (!membership.roleId) continue;
    const roleScopes = await prisma.roleScope.findMany({
      where: { roleId: membership.roleId },
    });
    if (roleScopes.length === 0) continue;
    const existingKeys = new Set(membership.dataScopes.map(scopeKey));
    const missing = roleScopes.filter((s) => !existingKeys.has(scopeKey(s)));
    if (missing.length === 0) continue;
    await prisma.dataScope.createMany({
      data: missing.map((s) => ({
        id: randomUUID(),
        membershipId: membership.id,
        module: s.module,
        scope: s.scope,
        scopeValue: s.scopeValue,
      })),
    });
    membershipsBackfilled += 1;
  }

  console.log(
    `Done. Orgs: ${organisations.length}, roles created: ${rolesCreated}, ` +
      `roles backfilled: ${rolesBackfilled}, memberships backfilled: ${membershipsBackfilled}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
