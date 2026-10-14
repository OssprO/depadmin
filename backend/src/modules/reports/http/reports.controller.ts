import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  StreamableFile,
} from '@nestjs/common';
import {
  type AccountStatement,
  type AccountSummary,
  type MonthHistory,
  type MonthlyReport,
  type OpeningBalance as OpeningBalanceResponse,
  type OpeningBalanceRequest,
  openingBalanceRequestSchema,
  type OpeningBalances,
  type ReportingStart,
  reportingStartSchema,
  type UnitNumberValue,
  unitNumberSchema,
  yearMonthSchema,
} from '@depadmin/shared';
import { z } from 'zod';
import { CurrentActor } from '../../../platform/http/auth.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { type Actor, Money, UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import {
  CloseMonth,
  GetAccounts,
  GetMonthHistory,
  GetMonthlyReport,
  GetOpeningBalances,
  GetReportingStart,
  OpenMonth,
  RenderMonthlyReport,
  ReopenMonth,
  SetOpeningBalance,
  SetReportingStart,
} from '../application/index.js';
import {
  toAccountStatement,
  toAccountSummary,
  toMonthHistory,
  toMonthlyReport,
  toOpeningBalance,
} from './presenters.js';

const monthParam = new ZodValidationPipe(yearMonthSchema.transform((m) => YearMonth.parse(m)));

@Controller()
export class ReportsController {
  constructor(
    private readonly getStart: GetReportingStart,
    private readonly setStart: SetReportingStart,
    private readonly openMonth: OpenMonth,
    private readonly closeMonth: CloseMonth,
    private readonly reopenMonth: ReopenMonth,
    private readonly monthlyReport: GetMonthlyReport,
    private readonly history: GetMonthHistory,
    private readonly pdf: RenderMonthlyReport,
    private readonly getOpening: GetOpeningBalances,
    private readonly setOpening: SetOpeningBalance,
    private readonly accounts: GetAccounts,
  ) {}

  @Get('reporting-start')
  async start(): Promise<{ start: ReportingStart | null }> {
    const start = await this.getStart.execute();
    return {
      start: start && {
        month: String(start.month),
        openingBalance: start.openingBalance.centavos,
      },
    };
  }

  @Put('reporting-start')
  @HttpCode(204)
  async setReportingStart(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(reportingStartSchema)) body: ReportingStart,
  ): Promise<void> {
    await this.setStart.execute(actor, {
      month: YearMonth.parse(body.month),
      openingBalance: Money.ofCentavos(body.openingBalance),
    });
  }

  /** Every opened month, newest first. */
  @Get('months')
  async months(@CurrentActor() actor: Actor): Promise<MonthHistory> {
    return toMonthHistory(await this.history.execute(actor));
  }

  @Get('months/:month')
  async month(
    @CurrentActor() actor: Actor,
    @Param('month', monthParam) month: YearMonth,
  ): Promise<MonthlyReport> {
    return toMonthlyReport(await this.monthlyReport.execute(actor, month));
  }

  @Post('months/:month/open')
  @HttpCode(200)
  async open(
    @CurrentActor() actor: Actor,
    @Param('month', monthParam) month: YearMonth,
  ): Promise<{ opened: string[] }> {
    const opened = await this.openMonth.execute(actor, month);
    return { opened: opened.map((report) => String(report.month)) };
  }

  /** The month's report as a PDF: frozen once closed, a draft while open. */
  @Get('months/:month/report.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Cache-Control', 'private, no-store')
  async report(@Param('month', monthParam) month: YearMonth): Promise<StreamableFile> {
    return new StreamableFile(await this.pdf.execute(month), {
      disposition: `attachment; filename="reporte-${String(month)}.pdf"`,
    });
  }

  @Post('months/:month/close')
  @HttpCode(204)
  async close(
    @CurrentActor() actor: Actor,
    @Param('month', monthParam) month: YearMonth,
  ): Promise<void> {
    await this.closeMonth.execute(actor, month);
  }

  @Post('months/:month/reopen')
  @HttpCode(204)
  async reopen(
    @CurrentActor() actor: Actor,
    @Param('month', monthParam) month: YearMonth,
  ): Promise<void> {
    await this.reopenMonth.execute(actor, month);
  }

  /** The initial load: what each depto carried into the books. Everyone may read it. */
  @Get('opening-balances')
  async openingBalances(): Promise<OpeningBalances> {
    const { start, locked, balances } = await this.getOpening.execute();
    return { start: String(start), locked, balances: balances.map(toOpeningBalance) };
  }

  @Put('opening-balances/:unit')
  async setOpeningBalance(
    @CurrentActor() actor: Actor,
    @Param('unit', new ZodValidationPipe(z.coerce.number().pipe(unitNumberSchema)))
    unit: UnitNumberValue,
    @Body(new ZodValidationPipe(openingBalanceRequestSchema)) body: OpeningBalanceRequest,
  ): Promise<OpeningBalanceResponse> {
    const balance = await this.setOpening.execute(
      actor,
      UnitNumber.of(unit),
      body.debts.map((debt) => ({
        month: YearMonth.parse(debt.month),
        type: debt.type,
        amount: Money.ofCentavos(debt.amount),
      })),
      Money.ofCentavos(body.credit),
    );
    return toOpeningBalance(balance);
  }

  /** Everyone's adeudo and adelanto. */
  @Get('accounts')
  async list(): Promise<AccountSummary[]> {
    return (await this.accounts.all()).map(toAccountSummary);
  }

  @Get('accounts/:unit')
  async account(
    @Param('unit', new ZodValidationPipe(z.coerce.number().pipe(unitNumberSchema)))
    unit: UnitNumberValue,
  ): Promise<AccountStatement> {
    return toAccountStatement(await this.accounts.of(UnitNumber.of(unit)));
  }
}
