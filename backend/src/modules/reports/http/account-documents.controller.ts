import { Controller, Get, Header, Inject, Param, Query, StreamableFile } from '@nestjs/common';
import {
  type MovementsExportQuery,
  movementsExportQuerySchema,
  type StatementQuery,
  statementQuerySchema,
  type UnitNumberValue,
  unitNumberSchema,
} from '@depadmin/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { CLOCK, type Clock, UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import { ExportMovements, RenderAccountDocuments } from '../application/index.js';
import { movementsCsv } from './movements-csv.js';

const unitParam = new ZodValidationPipe(z.coerce.number().pipe(unitNumberSchema));

/** Documents for the neighbors: a payment's receipt, a depto's statement, the rows as CSV. */
@Controller()
export class AccountDocumentsController {
  constructor(
    private readonly documents: RenderAccountDocuments,
    private readonly exportMovements: ExportMovements,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get('movements/:id/receipt.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Cache-Control', 'private, no-store')
  async receipt(@Param('id', new ZodValidationPipe(z.uuid())) id: string): Promise<StreamableFile> {
    const { folio, pdf } = await this.documents.receipt(id);
    return new StreamableFile(pdf, {
      disposition: `attachment; filename="recibo-${String(folio).padStart(4, '0')}.pdf"`,
    });
  }

  @Get('accounts/:unit/statement.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Cache-Control', 'private, no-store')
  async statement(
    @Param('unit', unitParam) unit: UnitNumberValue,
    @Query(new ZodValidationPipe(statementQuerySchema)) query: StatementQuery,
  ): Promise<StreamableFile> {
    const through = query.through ? YearMonth.parse(query.through) : undefined;
    const pdf = await this.documents.statement(UnitNumber.of(unit), through);
    const day = query.through ?? String(this.clock.today());
    return new StreamableFile(pdf, {
      disposition: `attachment; filename="estado-de-cuenta-${unit}-${day}.pdf"`,
    });
  }

  @Get('movements.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'private, no-store')
  async csv(
    @Query(new ZodValidationPipe(movementsExportQuerySchema)) query: MovementsExportQuery,
  ): Promise<StreamableFile> {
    const rows = await this.exportMovements.execute(
      YearMonth.parse(query.from),
      YearMonth.parse(query.to),
    );
    return new StreamableFile(Buffer.from(movementsCsv(rows), 'utf8'), {
      disposition: `attachment; filename="movimientos-${query.from}-a-${query.to}.csv"`,
    });
  }
}
