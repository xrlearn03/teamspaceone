import { PrismaClient } from '#prisma';
import { reconcileRbac } from './rbac-reconcile.js';

const prisma = new PrismaClient();

async function main() {
  const result = await reconcileRbac(prisma);
  console.log(
    `Done. Orgs: ${result.organisations}, permissions: ${result.permissions}, ` +
      `roles created: ${result.rolesCreated}, roles backfilled: ${result.rolesBackfilled}, ` +
      `memberships backfilled: ${result.membershipsBackfilled}`,
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
