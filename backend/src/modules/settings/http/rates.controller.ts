import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  type RateChangeParams,
  rateChangeParamsSchema,
  type RateChangeRequest,
  rateChangeRequestSchema,
  type RateChangeValue,
  type RatesResponse,
} from '@depadmin/shared';
import { CurrentActor } from '../../../platform/http/auth.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { type Actor, LocalDate, Money, YearMonth } from '../../../shared-kernel/index.js';
import { ChangeRate, GetRateSchedule, WithdrawRateChange } from '../application/index.js';
import type { RateChange } from '../domain/index.js';

const toChange = ({ effectiveFrom, amount, agreement }: RateChange): RateChangeValue => ({
  effectiveFrom: String(effectiveFrom),
  amount: amount.centavos,
  agreement: agreement ? { on: String(agreement.on), summary: agreement.summary } : null,
});

@Controller('rates')
export class RatesController {
  constructor(
    private readonly schedule: GetRateSchedule,
    private readonly changeRate: ChangeRate,
    private readonly withdrawRateChange: WithdrawRateChange,
  ) {}

  @Get()
  async list(@CurrentActor() actor: Actor): Promise<RatesResponse> {
    const { canChange, rates } = await this.schedule.execute(actor);
    return {
      canChange,
      rates: rates.map(({ rate, current, history, earliestMonth }) => ({
        rate,
        current: current?.centavos ?? null,
        history: history.map((change) => ({
          ...toChange(change),
          upcoming: change.upcoming,
          withdrawable: change.withdrawable,
        })),
        earliestMonth: String(earliestMonth),
      })),
    };
  }

  @Post('changes')
  async change(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(rateChangeRequestSchema)) body: RateChangeRequest,
  ): Promise<RateChangeValue> {
    const change = await this.changeRate.execute(actor, {
      rate: body.rate,
      from: YearMonth.parse(body.from),
      amount: Money.ofCentavos(body.amount),
      agreedOn: LocalDate.parse(body.agreedOn),
      agreement: body.agreement,
    });
    return toChange(change);
  }

  @Delete('changes/:rate/:from')
  @HttpCode(204)
  async withdraw(
    @CurrentActor() actor: Actor,
    @Param(new ZodValidationPipe(rateChangeParamsSchema)) params: RateChangeParams,
  ): Promise<void> {
    await this.withdrawRateChange.execute(actor, params.rate, YearMonth.parse(params.from));
  }
}
