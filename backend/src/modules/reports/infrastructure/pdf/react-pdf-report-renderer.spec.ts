import { describe, expect, it } from 'vitest';
import { YearMonth } from '../../../../shared-kernel/index.js';
import { expense, payment, pesos } from '../../../cashbook/domain/testing.js';
import { admin } from '../../../shifts/application/testing.js';
import { booksFixture } from '../../application/testing.js';
import { ReactPdfReportRenderer } from './react-pdf-report-renderer.js';

const m = (text: string) => YearMonth.parse(text);
const pages = (pdf: Uint8Array) =>
  (new TextDecoder('latin1').decode(pdf).match(/\/Type \/Page\b/g) ?? []).length;

/** September with a payment and `expenses` small expenses, closed on 3 October. */
async function september(expenses: number) {
  const fx = booksFixture('2026-10-03');
  await fx.setStart.execute(admin, { month: m('2026-09'), openingBalance: pesos(50_000) });
  await fx.open.execute(admin, m('2026-09'));
  await fx.add.execute(admin, payment('2026-09-05', 401, 700));
  for (let i = 0; i < expenses; i++) {
    await fx.add.execute(admin, expense('2026-09-20', 'OTHER_EXPENSE', 10, `Insumo ${i + 1}`));
  }
  await fx.close.execute(admin, m('2026-09'));
  return fx.pdf.document(m('2026-09'));
}

describe('ReactPdfReportRenderer', () => {
  const renderer = new ReactPdfReportRenderer();

  it('renders the month as a one-page PDF', async () => {
    const pdf = await renderer.render([await september(1)]);

    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(pages(pdf)).toBe(1);
  }, 20_000);

  it('continues on more pages when the month has many rows', async () => {
    const pdf = await renderer.render([await september(60)]);

    expect(pages(pdf)).toBeGreaterThan(1);
  }, 20_000);
});
