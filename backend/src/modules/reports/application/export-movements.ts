import { Injectable } from '@nestjs/common';
import { type CashMovement, ReadCashbook } from '../../cashbook/application/index.js';
import { ValidationError, type YearMonth } from '../../../shared-kernel/index.js';

/** The longest range one export may cover: ten years of books. */
export const MAX_EXPORT_MONTHS = 120;

/**
 * The rows of a range of months, oldest first and without the removed ones, to open them
 * in a spreadsheet. Everyone may read the books, so everyone may export them.
 */
@Injectable()
export class ExportMovements {
  constructor(private readonly cashbook: ReadCashbook) {}

  execute(from: YearMonth, to: YearMonth): Promise<CashMovement[]> {
    if (from.isAfter(to) || from.monthsUntil(to) >= MAX_EXPORT_MONTHS) {
      throw new ValidationError(
        'EXPORT_RANGE_INVALID',
        `Export 1 to ${MAX_EXPORT_MONTHS} months, from ${from} to ${to}`,
      );
    }
    return this.cashbook.between(from, to);
  }
}
