import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import {
  type RenameOwnerRequest,
  renameOwnerRequestSchema,
  type SetUnitStatusRequest,
  setUnitStatusRequestSchema,
  type Unit as UnitResponse,
  type UnitNumberValue,
  unitNumberSchema,
} from '@depadmin/shared';
import { z } from 'zod';
import { CurrentActor } from '../../../platform/http/auth.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import {
  type Actor,
  CLOCK,
  type Clock,
  UnitNumber,
  YearMonth,
} from '../../../shared-kernel/index.js';
import { ListUnits, RenameUnitOwner, SetUnitStatus } from '../application/index.js';
import type { Unit } from '../domain/index.js';

@Controller('units')
export class UnitsController {
  constructor(
    private readonly listUnits: ListUnits,
    private readonly setUnitStatus: SetUnitStatus,
    private readonly renameOwner: RenameUnitOwner,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Everyone may read the deptos and their history. */
  @Get()
  async list(): Promise<UnitResponse[]> {
    const thisMonth = this.clock.today().yearMonth;
    return (await this.listUnits.execute()).map((unit) => toUnit(unit, thisMonth));
  }

  @Post(':number/status')
  @HttpCode(200)
  async setStatus(
    @CurrentActor() actor: Actor,
    @Param('number', new ZodValidationPipe(z.coerce.number().pipe(unitNumberSchema)))
    number: UnitNumberValue,
    @Body(new ZodValidationPipe(setUnitStatusRequestSchema)) body: SetUnitStatusRequest,
  ): Promise<UnitResponse> {
    const unit = await this.setUnitStatus.execute(actor, {
      unit: UnitNumber.of(number),
      active: body.active,
      from: YearMonth.parse(body.from),
    });
    return toUnit(unit, this.clock.today().yearMonth);
  }

  @Put(':number/owner')
  async setOwner(
    @CurrentActor() actor: Actor,
    @Param('number', new ZodValidationPipe(z.coerce.number().pipe(unitNumberSchema)))
    number: UnitNumberValue,
    @Body(new ZodValidationPipe(renameOwnerRequestSchema)) body: RenameOwnerRequest,
  ): Promise<UnitResponse> {
    const unit = await this.renameOwner.execute(actor, UnitNumber.of(number), body.ownerName);
    return toUnit(unit, this.clock.today().yearMonth);
  }
}

function toUnit(unit: Unit, thisMonth: YearMonth): UnitResponse {
  return {
    number: unit.number.value as UnitNumberValue,
    ownerName: unit.ownerName,
    activeNow: unit.isActiveIn(thisMonth),
    inactivePeriods: unit.inactivePeriods.map((period) => ({
      from: String(period.from),
      to: period.to && String(period.to),
    })),
  };
}
