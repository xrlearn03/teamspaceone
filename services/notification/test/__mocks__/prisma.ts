export { Prisma } from '@prisma/client';

export class PrismaClient {
  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
  async $queryRaw(): Promise<unknown> { return undefined; }
}
