import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  type CreateDelegationRequest,
  createDelegationRequestSchema,
  type CurrentShiftResponse,
  type ShiftCalendarQuery,
  shiftCalendarQuerySchema,
  type ShiftDelegation,
  type ShiftMonth,
} from '@depadmin/shared';
import { z } from 'zod';
import { CurrentActor } from '../../../platform/http/auth.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { type Actor, UnitNumber, YearMonth } from '../../../shared-kernel/index.js';
import { CancelDelegation, DelegateShift, GetShiftCalendar } from '../application/index.js';
import { toCurrentShift, toDelegation, toShiftMonth } from './presenters.js';

@Controller('shifts')
export class ShiftsController {
  constructor(
    private readonly calendar: GetShiftCalendar,
    private readonly delegateShift: DelegateShift,
    private readonly cancelDelegation: CancelDelegation,
  ) {}

  @Get('calendar')
  async list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(shiftCalendarQuerySchema)) query: ShiftCalendarQuery,
  ): Promise<ShiftMonth[]> {
    const months = await this.calendar.execute(
      actor,
      YearMonth.parse(query.from),
      YearMonth.parse(query.to),
    );
    return months.map(toShiftMonth);
  }

  @Get('current')
  async current(@CurrentActor() actor: Actor): Promise<CurrentShiftResponse> {
    return toCurrentShift(await this.calendar.current(actor));
  }

  @Post('delegations')
  async delegate(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createDelegationRequestSchema)) body: CreateDelegationRequest,
  ): Promise<ShiftDelegation> {
    const delegation = await this.delegateShift.execute(actor, {
      from: YearMonth.parse(body.from),
      to: YearMonth.parse(body.to),
      delegateUnit: UnitNumber.of(body.delegateUnit),
      reason: body.reason,
    });
    return toDelegation(delegation);
  }

  @Post('delegations/:id/cancel')
  @HttpCode(200)
  async cancel(
    @CurrentActor() actor: Actor,
    @Param('id', new ZodValidationPipe(z.uuid())) id: string,
  ): Promise<ShiftDelegation> {
    return toDelegation(await this.cancelDelegation.execute(actor, id));
  }
}
