/// <reference types="jest" />

export class PrismaClient {
  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
  async $queryRaw(): Promise<unknown> { return undefined; }
  async $queryRawUnsafe<T = unknown>(): Promise<T> { return [] as unknown as T; }
  async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return fn(this);
  }

  searchDocument = {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findFirst: jest.fn(),
  };

  inboxEvent = {
    findUnique: jest.fn(),
    create: jest.fn(),
  };

  outboxEvent = {
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  };
}

export const Prisma = {};
