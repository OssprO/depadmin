import { Inject, Injectable } from '@nestjs/common';
import type { HistoryBoundary, YearMonth } from '../../../shared-kernel/index.js';
import { HISTORY_REPOSITORY, type HistoryRepository } from '../domain/index.js';

/** Answers the reports module's question: where the history ends. */
@Injectable()
export class PastHistoryBoundary implements HistoryBoundary {
  constructor(@Inject(HISTORY_REPOSITORY) private readonly history: HistoryRepository) {}

  async lastMonth(): Promise<YearMonth | null> {
    return (await this.history.loadBooks())?.lastMonth ?? null;
  }
}
