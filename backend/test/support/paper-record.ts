import type { PaperPage, PaperRecord, YearMonth } from '../../src/shared-kernel/index.js';

/** Months have no paper unless given some. */
export class FakePaperRecord implements PaperRecord {
  private readonly pages = new Map<string, PaperPage[]>();

  set(month: YearMonth | string, pages: PaperPage[]): this {
    this.pages.set(String(month), pages);
    return this;
  }

  pagesOf(month: YearMonth): Promise<PaperPage[]> {
    return Promise.resolve(this.pages.get(String(month)) ?? []);
  }
}
