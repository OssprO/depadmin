import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  type AccountStatement,
  type AccountSummary,
  type MonthHistory,
  type MonthlyReport,
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
  GetReportingStart,
  OpenMonth,
  ReopenMonth,
  SetReportingStart,
} from '../application/index.js';
import {
  toAccountStatement,
  toAccountSummary,
  toMonthHistory,
  toMonthlyReport,
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
