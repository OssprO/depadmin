import { Body, Controller, Delete, HttpCode, Param, Post, Put } from '@nestjs/common';
import { type MovementRequest, movementRequestSchema } from '@depadmin/shared';
import { z } from 'zod';
import { CurrentActor } from '../../../platform/http/auth.js';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { type Actor, LocalDate, Money, UnitNumber } from '../../../shared-kernel/index.js';
import { AddMovement, RemoveMovement, ReviseMovement } from '../application/index.js';
import type { MovementDetails } from '../domain/index.js';

/** Rows of the monthly cashbook. Reading them is the month's report (`GET /api/months/:month`). */
@Controller('movements')
export class MovementsController {
  constructor(
    private readonly addMovement: AddMovement,
    private readonly reviseMovement: ReviseMovement,
    private readonly removeMovement: RemoveMovement,
  ) {}

  @Post()
  async add(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(movementRequestSchema)) body: MovementRequest,
  ): Promise<{ id: string }> {
    const movement = await this.addMovement.execute(actor, toDetails(body));
    return { id: movement.id };
  }

  /** Replaces the row's fields; the audit log records only those that changed. */
  @Put(':id')
  @HttpCode(204)
  async revise(
    @CurrentActor() actor: Actor,
    @Param('id', new ZodValidationPipe(z.uuid())) id: string,
    @Body(new ZodValidationPipe(movementRequestSchema)) body: MovementRequest,
  ): Promise<void> {
    await this.reviseMovement.execute(actor, id, toDetails(body));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentActor() actor: Actor,
    @Param('id', new ZodValidationPipe(z.uuid())) id: string,
  ): Promise<void> {
    await this.removeMovement.execute(actor, id);
  }
}

function toDetails(body: MovementRequest): MovementDetails {
  return {
    date: LocalDate.parse(body.date),
    category: body.category,
    amount: Money.ofCentavos(body.amount),
    unit: body.unit === null ? null : UnitNumber.of(body.unit),
    description: body.description,
  };
}
