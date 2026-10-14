import type {
  Actor,
  AuditedChange,
  AuditTrail,
  UnitOfWork,
} from '../../src/shared-kernel/index.js';

/**
 * A unit of work for use case specs that behaves like a transaction for what is written
 * through `onCommit`: it is applied only if the outermost `run` succeeds.
 */
export class FakeUnitOfWork implements UnitOfWork {
  private pending: (() => void)[] | null = null;

  get active(): boolean {
    return this.pending !== null;
  }

  onCommit(apply: () => void): void {
    if (!this.pending) throw new Error('Not inside a unit of work');
    this.pending.push(apply);
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.pending) return work();
    this.pending = [];
    try {
      const result = await work();
      for (const apply of this.pending) apply();
      return result;
    } finally {
      this.pending = null;
    }
  }
}

/**
 * The audit trail for use case specs. Like the Prisma adapter, it refuses entries written
 * outside a unit of work, and like a transaction it drops them if the work fails.
 */
export class RecordingAuditTrail implements AuditTrail {
  readonly entries: { actor: Actor; change: AuditedChange }[] = [];

  constructor(private readonly unitOfWork: FakeUnitOfWork) {}

  record(actor: Actor, change: AuditedChange): Promise<void> {
    this.unitOfWork.onCommit(() => this.entries.push({ actor, change }));
    return Promise.resolve();
  }

  get actions(): string[] {
    return this.entries.map((entry) => entry.change.action);
  }
}
