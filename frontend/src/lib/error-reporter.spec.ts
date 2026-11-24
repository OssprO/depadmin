import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeApi } from '@/test/fake-api';
import { ApiError } from './api-error';
import { ErrorReporter, MAX_REPORTS_PER_PAGE } from './error-reporter';

describe('ErrorReporter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const reporterAt = (path: string) => new ErrorReporter(() => path);

  it('sends an error with its stack and the path, without the query string', () => {
    const api = fakeApi({ 'POST /api/client-errors': () => new Response(null, { status: 204 }) });
    const error = new TypeError("can't access property 'total', report is undefined");

    reporterAt('/book/2026-10').report('render', error);

    expect(api.callsTo('POST /api/client-errors').map((call) => call.body)).toEqual([
      {
        kind: 'render',
        message: "TypeError: can't access property 'total', report is undefined",
        stack: error.stack,
        path: '/book/2026-10',
      },
    ]);
    expect(api.fetchMock.mock.calls[0]?.[1]).toMatchObject({ keepalive: true });
  });

  it('leaves out what the API already answered, repeats and anything past the limit', () => {
    const api = fakeApi({});
    const reporter = reporterAt('/');

    reporter.report('unhandledrejection', new ApiError(500, 'INTERNAL', 'boom'));
    reporter.report('error', new Error('same'));
    reporter.report('error', new Error('same'));
    for (let n = 0; n < MAX_REPORTS_PER_PAGE + 3; n++) reporter.report('error', `error ${n}`);

    const messages = api.calls.map((call) => (call.body as { message: string }).message);
    expect(messages).toEqual([
      'Error: same',
      ...Array.from({ length: MAX_REPORTS_PER_PAGE - 1 }, (_, n) => `error ${n}`),
    ]);
  });

  it('cuts what is too long to fit the contract', () => {
    const api = fakeApi({});
    reporterAt(`/${'x'.repeat(300)}`).report('error', new Error('y'.repeat(600)));
    const [report] = api.calls.map((call) => call.body as { message: string; path: string });
    expect(report?.message).toHaveLength(500);
    expect(report?.path).toHaveLength(200);
  });

  // Vitest fails the run on an unhandled rejection, so this test fails if one escapes.
  it('swallows its own failures', async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError('offline')));
    vi.stubGlobal('fetch', fetch);

    expect(() => reporterAt('/').report('error', new Error('boom'))).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('listens for errors and rejections that nothing caught', () => {
    const reporter = reporterAt('/');
    const report = vi.spyOn(reporter, 'report').mockImplementation(() => undefined);
    const target = new EventTarget() as unknown as Window;
    reporter.listen(target);

    const thrown = new Error('thrown');
    target.dispatchEvent(Object.assign(new Event('error'), { error: thrown }));
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'rejected' }));

    expect(report.mock.calls).toEqual([
      ['error', thrown],
      ['unhandledrejection', 'rejected'],
    ]);
  });
});
