import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaPg } from '@prisma/adapter-pg';
import type { UnitOfWork } from '../../shared-kernel/index.js';
import { isWriteConflict } from './db-errors.js';
import { type Prisma, PrismaClient } from './generated/client.js';

export type Db = Prisma.TransactionClient;

/** Attempts at a transaction the database keeps aborting for conflicts with others. */
const ATTEMPTS = 4;

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

  get inTransaction(): boolean {
    return this.current.getStore() !== undefined;
  }

  /**
   * Runs the work in a transaction, or in the current one. If the database aborts it to
   * settle a conflict with a concurrent transaction (see `isWriteConflict`), it runs again
   * after a short random pause: by then the other one has committed, so the domain checks
   * see its writes and answer as if the requests had come one after the other.
   */
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.current.getStore()) return work();
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.client.$transaction((tx) => this.current.run(tx, work));
      } catch (error) {
        if (attempt === ATTEMPTS || !isWriteConflict(error)) throw error;
        await pause(attempt);
      }
    }
  }

  disconnect(): Promise<void> {
    return this.client.$disconnect();
  }
}

/** A few milliseconds, longer each attempt and random, so racing retries spread out. */
function pause(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.random() * 20 * attempt));
}
