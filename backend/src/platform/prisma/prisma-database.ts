import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaPg } from '@prisma/adapter-pg';
import type { UnitOfWork } from '../../shared-kernel/index.js';
import { type Prisma, PrismaClient } from './generated/client.js';

export type Db = Prisma.TransactionClient;

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

/**
 * The single entry point repositories use to reach the database. Inside `transaction` it
 * hands out the transaction client, so repositories join the current unit of work without
 * receiving a client as a parameter.
 */
export class PrismaDatabase implements UnitOfWork {
  private readonly current = new AsyncLocalStorage<Db>();

  constructor(readonly client: PrismaClient) {}

  /** The transaction client if one is active, otherwise the shared client. */
  get db(): Db {
    return this.current.getStore() ?? this.client;
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.current.getStore()) return work();
    return this.client.$transaction((tx) => this.current.run(tx, work));
  }

  disconnect(): Promise<void> {
    return this.client.$disconnect();
  }
}
