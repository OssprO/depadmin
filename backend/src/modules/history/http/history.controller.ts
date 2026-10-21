import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  type AddSheetRequest,
  addSheetRequestSchema,
  type HistoryFile as HistoryFileRequest,
  historyFileSchema,
  type HistoryPreview,
  type HistorySummary,
  type PaperMonth,
  type SheetRequest,
  sheetRequestSchema,
  yearMonthSchema,
} from '@depadmin/shared';
import { z } from 'zod';
import { CurrentActor } from '../../../platform/http/auth.js';
import { toMovementDetails } from '../../../platform/http/movement-request.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import {
  type Actor,
  LocalDate,
  Money,
  UnitNumber,
  YearMonth,
} from '../../../shared-kernel/index.js';
import {
  AddPaperSheet,
  GetHistory,
  GetPaperMonth,
  type HistoryFile,
  ImportHistory,
  PreviewHistoryImport,
  RemovePaperSheet,
  RevisePaperSheet,
} from '../application/index.js';
import type { SheetDetails } from '../domain/index.js';
import { toHistoryPreview, toHistorySummary, toPaperMonth } from './presenters.js';

const monthParam = new ZodValidationPipe(yearMonthSchema.transform((m) => YearMonth.parse(m)));
const idParam = new ZodValidationPipe(z.uuid());

/**
 * The building's history (ADR-0023): starting the books with it, and its paper sheets. Its
 * rows are written through the cashbook, like any month's.
 */
@Controller('history')
export class HistoryController {
  constructor(
    private readonly getHistory: GetHistory,
    private readonly getMonth: GetPaperMonth,
    private readonly previewImport: PreviewHistoryImport,
    private readonly importHistory: ImportHistory,
    private readonly addSheet: AddPaperSheet,
    private readonly reviseSheet: RevisePaperSheet,
    private readonly removeSheet: RemovePaperSheet,
  ) {}

  @Get()
  async history(@CurrentActor() actor: Actor): Promise<{ history: HistorySummary | null }> {
    const review = await this.getHistory.execute(actor);
    return { history: review && toHistorySummary(review) };
  }

  /** Checks the file and adds it up; saves nothing. */
  @Post('preview')
  @HttpCode(200)
  async preview(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(historyFileSchema)) body: HistoryFileRequest,
  ): Promise<HistoryPreview> {
    return toHistoryPreview(await this.previewImport.execute(actor, toHistoryFile(body)));
  }

  @Post()
  @HttpCode(204)
  async import(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(historyFileSchema)) body: HistoryFileRequest,
  ): Promise<void> {
    await this.importHistory.execute(actor, toHistoryFile(body));
  }

  @Get('months/:month')
  async month(
    @CurrentActor() actor: Actor,
    @Param('month', monthParam) month: YearMonth,
  ): Promise<PaperMonth> {
    const { review, canEdit } = await this.getMonth.execute(actor, month);
    return toPaperMonth(review, canEdit);
  }

  @Post('sheets')
  async addPaperSheet(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(addSheetRequestSchema)) body: AddSheetRequest,
  ): Promise<{ id: string }> {
    const sheet = await this.addSheet.execute(actor, {
      ...toSheetDetails(body),
      month: YearMonth.parse(body.month),
    });
    return { id: sheet.id };
  }

  @Put('sheets/:id')
  @HttpCode(204)
  async revisePaperSheet(
    @CurrentActor() actor: Actor,
    @Param('id', idParam) id: string,
    @Body(new ZodValidationPipe(sheetRequestSchema)) body: SheetRequest,
  ): Promise<void> {
    await this.reviseSheet.execute(actor, id, toSheetDetails(body));
  }

  @Delete('sheets/:id')
  @HttpCode(204)
  async removePaperSheet(
    @CurrentActor() actor: Actor,
    @Param('id', idParam) id: string,
  ): Promise<void> {
    await this.removeSheet.execute(actor, id);
  }
}

const money = (centavos: number | null) => (centavos === null ? null : Money.ofCentavos(centavos));

function toSheetDetails(body: SheetRequest): Omit<SheetDetails, 'month'> {
  return {
    fromDay: body.fromDay,
    source: body.source,
    responsible: body.responsible,
    figures: {
      opening: money(body.opening),
      income: money(body.income),
      expense: money(body.expense),
      closing: money(body.closing),
    },
    alerts: body.alerts,
    lines: body.lines.map((line) => ({
      unit: UnitNumber.of(line.unit),
      ownerName: line.ownerName,
      current: money(line.current),
      other: money(line.other),
      text: line.text,
    })),
  };
}

function toHistoryFile(body: HistoryFileRequest): HistoryFile {
  return {
    openingBalance: Money.ofCentavos(body.openingBalance),
    months: body.months.map((entry) => ({
      month: YearMonth.parse(entry.month),
      sheets: entry.sheets.map((sheet) => ({
        ...toSheetDetails(sheet),
        movements: sheet.movements.map(toMovementDetails),
      })),
      movements: entry.movements.map(toMovementDetails),
    })),
    owners: body.owners.map((owner) => ({ unit: UnitNumber.of(owner.unit), name: owner.name })),
    rates: body.rates.map((rate) => ({
      rate: rate.rate,
      effectiveFrom: LocalDate.parse(rate.effectiveFrom),
      amount: Money.ofCentavos(rate.amount),
    })),
  };
}
