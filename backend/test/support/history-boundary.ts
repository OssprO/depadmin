import type { HistoryBoundary, YearMonth } from '../../src/shared-kernel/index.js';

/** No history unless a spec says where it ends. */
export class FakeHistoryBoundary implements HistoryBoundary {
  private last: YearMonth | null = null;

  endsIn(month: YearMonth | null): this {
    this.last = month;
    return this;
  }

  lastMonth(): Promise<YearMonth | null> {
    return Promise.resolve(this.last);
  }
}
