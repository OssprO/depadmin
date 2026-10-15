import type { MonthLedger, MonthStatus, YearMonth } from '../../src/shared-kernel/index.js';

/** Months are NOT_OPENED unless set otherwise. */
export class FakeMonthLedger implements MonthLedger {
  private readonly statuses = new Map<string, MonthStatus>();
  private firstLiveMonth: YearMonth | null = null;

  /** The months before `month` become the history (no audit for their rows). */
  cutoverIn(month: YearMonth | null): this {
    this.firstLiveMonth = month;
    return this;
  }

  set(month: YearMonth | string, status: MonthStatus): this {
    this.statuses.set(String(month), status);
    return this;
  }

  /** Months the use cases held open, in order. */
  readonly held: string[] = [];

  holdOpen(month: YearMonth): Promise<void> {
    this.held.push(String(month));
    return Promise.resolve();
  }

  cutover(): Promise<YearMonth | null> {
    return Promise.resolve(this.firstLiveMonth);
  }

  statusOf(month: YearMonth): Promise<MonthStatus> {
    return Promise.resolve(this.statuses.get(String(month)) ?? 'NOT_OPENED');
  }
}
