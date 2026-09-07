import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '#prisma';
import { ALL_PERMISSIONS, permissionParts, permissionKey } from '@teamspace-one/authorization';
import { DEFAULT_ROLES, expandPermissions } from '../organisation/authorization.service.js';

const prisma = new PrismaClient();

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
            isSystem: template.isSystem,
            isDefault: template.isDefault ?? false,
            permissions: [],
          },
        });
        rolesCreated += 1;
      }

      const existingRolePermissions = await prisma.rolePermission.count({
        where: { roleId: role.id },
      });
      if (existingRolePermissions === 0 && permissionIds.length > 0) {
        await prisma.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            id: randomUUID(),
            roleId: role.id,
            permissionId,
          })),
          skipDuplicates: true,
        });
        rolesBackfilled += 1;
      }

      const existingRoleScopes = await prisma.roleScope.count({
        where: { roleId: role.id },
      });
      if (existingRoleScopes === 0 && template.scopes.length > 0) {
        await prisma.roleScope.createMany({
          data: template.scopes.map((s) => ({
            id: randomUUID(),
            roleId: role.id,
            module: s.module,
            scope: s.scope,
            scopeValue: s.scopeValue ?? null,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  // 3. Membership data scopes.
  const memberships = await prisma.organisationMembership.findMany({
    select: {
      id: true,
      roleId: true,
      dataScopes: { select: { id: true } },
    },
  });
  let membershipsBackfilled = 0;

  for (const membership of memberships) {
    if (membership.dataScopes.length > 0 || !membership.roleId) continue;
    const roleScopes = await prisma.roleScope.findMany({
      where: { roleId: membership.roleId },
    });
    if (roleScopes.length === 0) continue;
    await prisma.dataScope.createMany({
      data: roleScopes.map((s) => ({
        id: randomUUID(),
        membershipId: membership.id,
        module: s.module,
        scope: s.scope,
        scopeValue: s.scopeValue,
      })),
      skipDuplicates: true,
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
