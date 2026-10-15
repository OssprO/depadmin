import { Inject, Injectable } from '@nestjs/common';
import { type Actor, NotFoundError, WriteAccessPolicy } from '../../../shared-kernel/index.js';
import {
  type HistoricalBooks,
  HISTORY_REPOSITORY,
  type HistoryRepository,
} from '../domain/index.js';

/**
 * The checks every history use case starts with. While it is in review only the superadmin
 * sees it (it is half-corrected) and changes it; nothing about it goes to the audit log
 * (ADR-0022).
 */
@Injectable()
export class HistoryAccess {
  private readonly policy = new WriteAccessPolicy();

  constructor(@Inject(HISTORY_REPOSITORY) private readonly history: HistoryRepository) {}

  /** The history, or null if none has been imported. */
  async find(actor: Actor): Promise<HistoricalBooks | null> {
    this.policy.assertCanAdminister(actor);
    return this.history.loadBooks();
  }

  async forReading(actor: Actor): Promise<HistoricalBooks> {
    const books = await this.find(actor);
    if (!books) throw new NotFoundError('HISTORY_NOT_IMPORTED', 'No history has been imported');
    return books;
  }

  async forWriting(actor: Actor): Promise<HistoricalBooks> {
    const books = await this.forReading(actor);
    books.assertInReview();
    return books;
  }
}
