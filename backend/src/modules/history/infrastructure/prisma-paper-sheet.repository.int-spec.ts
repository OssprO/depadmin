import { describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { useTestDatabase } from '../../../../test/support/database.js';
import { m, note, pesos, sheet } from '../domain/testing.js';
import { PrismaPaperSheetRepository } from './prisma-paper-sheet.repository.js';

const ctx = useTestDatabase();
const repository = () => new PrismaPaperSheetRepository(ctx.database);

describe('PrismaPaperSheetRepository', () => {
  it('round-trips sheets with their figures, remarks and lines', async () => {
    const may = sheet('2022-05', 712.25, null, {
      alerts: ['Cuota de $600'],
      lines: [
        { ...note(202, 'ADELANTÓ JUNIO 2022'), ownerName: 'NOMBRE', current: pesos(600) },
        { ...note(301, ''), other: pesos(1200) },
      ],
    });
    const second = sheet('2023-02', 8259.05, 1617.05, { fromDay: 11 });
    await repository().saveSheets([second, may, sheet('2023-02', 6022.05, 8259.05)]);

    expect((await repository().findSheet(may.id))!.details).toEqual(may.details);
    expect((await repository().findSheets(m('2023-02'))).map((s) => s.details.fromDay)).toEqual([
      1, 11,
    ]);
    expect(await repository().findSheets()).toHaveLength(3);

    may.revise({ ...may.details, source: 'foto 55' });
    await repository().saveSheets([may]);
    expect((await repository().findSheet(may.id))!.details.source).toBe('foto 55');
    await repository().removeSheet(may.id);
    expect(await repository().findSheet(may.id)).toBeNull();
  });

  it('allows one sheet per starting day in the database itself', async () => {
    await repository().saveSheets([sheet('2023-02', null, null)]);
    await expect(repository().saveSheets([sheet('2023-02', null, null)])).rejects.toThrow(
      withCode('SHEET_DUPLICATED'),
    );
  });
});
