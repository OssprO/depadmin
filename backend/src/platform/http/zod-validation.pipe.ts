import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

export interface FieldError {
  readonly path: string;
  readonly message: string;
}

/** A request that does not match its contract; reported as 400 `VALIDATION_FAILED`. */
export class RequestValidationError extends Error {
  constructor(readonly errors: readonly FieldError[]) {
    super('The request does not match its contract');
    this.name = 'RequestValidationError';
  }
}

/**
 * Validates and parses a request part (`@Body`, `@Param`, `@Query`) with a shared Zod
 * schema, so the API and the frontend forms apply the very same rules.
 */
export class ZodValidationPipe<Schema extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.infer<Schema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new RequestValidationError(
        result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
