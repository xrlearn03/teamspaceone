import { randomUUID } from 'node:crypto';
import { PrismaClient } from '#prisma';
import { permissionParts, permissionKey } from '@teamspace-one/authorization';

const prisma = new PrismaClient();

export const PLATFORM_ROLE_NAME = 'platform_super_admin';

/**
 * Permissions held by the platform super admin: the platform-only
 * `admin.system.settings` grant plus a minimal staff baseline so platform
 * staff get a usable app shell (home, channels, meetings, files, tickets).
 */
const PLATFORM_ROLE_PERMISSIONS = [
  'admin.system.settings',
  'dashboard.view',
  'collaboration.access',
  'collaboration.message.*',
  'collaboration.channel.view',
  'collaboration.file.view',
  'collaboration.meeting.view',
  'collaboration.meeting.create',
  'collaboration.ticket.view',
  'collaboration.ticket.create',
];

/**
 * Platform administration seed:
 *  1. Ensures the permission registry contains the platform permissions.
 *  2. Ensures the platform organisation (PLATFORM_ORGANISATION_SLUG) has the
 *     reserved `platform_super_admin` system role with those permissions.
 *  3. Optionally attaches the role to PLATFORM_ADMIN_USER_ID — as an extra
 *     user_role when a membership already exists, otherwise as a new
 *     membership's primary role.
 *
 * Safe to re-run. Platform staff are onboarded afterwards through the normal
 * member-invite flow by selecting the platform_super_admin role.
 */
async function main() {
  const slug = process.env.PLATFORM_ORGANISATION_SLUG;
  if (!slug) {
    throw new Error('PLATFORM_ORGANISATION_SLUG is required');
  }

  const organisation = await prisma.organisation.findUnique({ where: { slug } });
  if (!organisation) {
    throw new Error(
      `No organisation found with slug "${slug}". Register it through the normal signup flow first, then re-run this seed.`,
    );
  }

  // 1. Permission registry rows.
  const permissionIds: string[] = [];
  for (const permission of PLATFORM_ROLE_PERMISSIONS) {
    const { module, resource, action } = permissionParts(permission);
    if (!module || !resource || !action) {
      console.warn(`Skipping malformed permission: ${permission}`);
      continue;
    }
    const row = await prisma.permission.upsert({
      where: { module_resource_action: { module, resource, action } },
      update: {},
      create: { id: randomUUID(), module, resource, action, description: null },
    });
    permissionIds.push(row.id);
  }

  // 2. platform_super_admin role.
  let role = await prisma.role.findFirst({
    where: { organisationId: organisation.id, name: PLATFORM_ROLE_NAME },
  });
  if (!role) {
    role = await prisma.role.create({
      data: {
        id: randomUUID(),
        organisationId: organisation.id,
        name: PLATFORM_ROLE_NAME,
        description: 'Platform Super Admin',
        roleCategory: 'administrative',
        isSystem: true,
        isDefault: false,
        permissions: [],
      },
    });
    console.log(`Created role ${PLATFORM_ROLE_NAME} in ${organisation.name} (${organisation.slug})`);
  }

  const existing = await prisma.rolePermission.findMany({
    where: { roleId: role.id },
    select: { permissionId: true },
  });
  const existingIds = new Set(existing.map((rp) => rp.permissionId));
  const missing = permissionIds.filter((id) => !existingIds.has(id));
  if (missing.length > 0) {
    await prisma.rolePermission.createMany({
      data: missing.map((permissionId) => ({ id: randomUUID(), roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
    console.log(`Granted ${missing.length} permission(s) to ${PLATFORM_ROLE_NAME}`);
  }

  // Org-wide data scope so the role is not scope-limited inside the platform org.
  const scope = await prisma.roleScope.findFirst({
    where: { roleId: role.id, module: '*', scope: 'organisation' },
  });
  if (!scope) {
    await prisma.roleScope.create({
      data: { id: randomUUID(), roleId: role.id, module: '*', scope: 'organisation', scopeValue: null },
    });
  }

  // 3. Optional bootstrap admin.
  const adminUserId = process.env.PLATFORM_ADMIN_USER_ID;
  if (adminUserId) {
    const membership = await prisma.organisationMembership.findUnique({
      where: { userId_organisationId: { userId: adminUserId, organisationId: organisation.id } },
    });
    if (membership) {
      await prisma.userRole.upsert({
        where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } },
        update: {},
        create: { id: randomUUID(), membershipId: membership.id, roleId: role.id },
      });
      console.log(`Attached ${PLATFORM_ROLE_NAME} to existing membership of ${adminUserId}`);
    } else {
      const created = await prisma.organisationMembership.create({
        data: {
          id: randomUUID(),
          userId: adminUserId,
          organisationId: organisation.id,
          roleId: role.id,
        },
      });
      await prisma.dataScope.create({
        data: { id: randomUUID(), membershipId: created.id, module: '*', scope: 'organisation', scopeValue: null },
      });
      console.log(`Created platform membership for ${adminUserId} with ${PLATFORM_ROLE_NAME}`);
    }
  }

  console.log('Platform seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
