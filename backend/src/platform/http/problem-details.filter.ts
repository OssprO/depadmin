import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ProblemDetails } from '@depadmin/shared';
import type { Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { DomainError, type DomainErrorKind } from '../../shared-kernel/index.js';
import { RequestValidationError } from './zod-validation.pipe.js';

const STATUS_BY_KIND: Record<DomainErrorKind, number> = {
  validation: HttpStatus.UNPROCESSABLE_ENTITY,
  conflict: HttpStatus.CONFLICT,
  unauthenticated: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
};

/** Codes for errors Nest or Express raise themselves (unknown route, rate limit, bad JSON…). */
const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
};

/**
 * Turns every error into RFC 9457 Problem Details with a stable `code`. Domain errors keep
 * their own code; anything unexpected becomes a 500 whose details stay in the logs.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const problem = this.toProblem(exception);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(problem.status)
      .type('application/problem+json')
      .json(problem);
  }

  private toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof DomainError) {
      return problem(STATUS_BY_KIND[exception.kind], exception.code, exception.message);
    }
    if (exception instanceof RequestValidationError) {
      return {
        ...problem(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', exception.message),
        errors: [...exception.errors],
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) this.logger.error(exception);
      return problem(status, CODE_BY_STATUS[status] ?? `HTTP_${status}`, exception.message);
    }
    this.logger.error(exception);
    return problem(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
  }
}

function problem(status: number, code: string, detail?: string): ProblemDetails {
  return {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    code,
    ...(detail && { detail }),
  };
}
