import { PrismaClient, Prisma } from '#prisma';
import { ALL_PERMISSIONS, permissionParts } from '@teamspace-one/authorization';

const prisma = new PrismaClient();

async function main() {
  const operations: Prisma.PrismaPromise<unknown>[] = [];

  for (const permission of ALL_PERMISSIONS) {
    const { module, resource, action } = permissionParts(permission);
    if (!module || !resource || !action) {
      console.warn(`Skipping malformed permission: ${permission}`);
      continue;
    }

    operations.push(
      prisma.permission.upsert({
        where: {
          module_resource_action: {
            module,
            resource,
            action,
          },
        },
        update: {},
        create: {
          module,
          resource,
          action,
          description: null,
        },
      }),
    );
  }

  const results = await prisma.$transaction(operations);
  console.log(`Seeded ${results.length} permissions`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
