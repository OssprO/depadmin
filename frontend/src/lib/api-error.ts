import { problemDetailsSchema } from '@depadmin/shared';

export interface FieldError {
  readonly path: string;
  readonly message: string;
}

/** An API failure, carrying the stable `code` of its Problem Details (see `error-messages`). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: readonly FieldError[];

  constructor(status: number, code: string, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

/** The server could not be reached at all (offline, DNS, server down). */
export const networkError = () => new ApiError(0, 'NETWORK_ERROR', 'Network request failed');

export async function readApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const problem = problemDetailsSchema.safeParse(body);
  if (!problem.success) {
    return new ApiError(response.status, `HTTP_${response.status}`, response.statusText);
  }
  const { status, code, detail, title, errors } = problem.data;
  return new ApiError(status, code, detail ?? title, errors);
}
