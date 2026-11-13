import { type ClientError, CLIENT_ERROR_LIMITS } from '@depadmin/shared';
import { ApiError } from './api-error';

/** At most this many reports per page load: a screen that fails in a loop sends a handful. */
export const MAX_REPORTS_PER_PAGE = 5;

/**
 * Sends the errors that happen in this browser to the API's log (ADR-0030), which otherwise
 * only the phone's console would see. An `ApiError` is not reported: the API answered it, so
 * its log already has it. Reporting never throws and never reports its own failures.
 */
export class ErrorReporter {
  private readonly sent = new Set<string>();
  private readonly path: () => string;

  constructor(path: () => string = () => window.location.pathname) {
    this.path = path;
  }

  report(kind: ClientError['kind'], error: unknown): void {
    if (error instanceof ApiError || this.sent.size >= MAX_REPORTS_PER_PAGE) return;
    const message = describe(error).slice(0, CLIENT_ERROR_LIMITS.message);
    if (this.sent.has(message)) return;
    this.sent.add(message);

    const stack =
      error instanceof Error ? error.stack?.slice(0, CLIENT_ERROR_LIMITS.stack) : undefined;
    const report: ClientError = {
      kind,
      message,
      ...(stack && { stack }),
      path: this.path().slice(0, CLIENT_ERROR_LIMITS.path),
    };
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      // Still delivered when the error makes the neighbour leave or reload the page.
      keepalive: true,
    }).catch(() => undefined);
  }

  /** Listens for the errors nothing caught: thrown ones and rejected promises. */
  listen(target: Window): void {
    target.addEventListener('error', (event) => this.report('error', event.error ?? event.message));
    target.addEventListener('unhandledrejection', (event) =>
      this.report('unhandledrejection', event.reason),
    );
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error) || 'Unknown error';
}

export const errorReporter = new ErrorReporter();
