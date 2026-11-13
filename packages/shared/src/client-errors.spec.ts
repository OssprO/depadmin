import { describe, expect, it } from 'vitest';
import { clientErrorSchema } from './client-errors.js';

describe('clientErrorSchema', () => {
  const valid = {
    kind: 'error',
    message: "TypeError: can't access property 'total', report is undefined",
    stack: 'at BookPage (https://depadmin.osspro.site/assets/BookPage-abc.js:1:200)',
    path: '/book/2026-10',
  };

  it('accepts a well-formed report, with or without a stack', () => {
    expect(clientErrorSchema.parse(valid)).toEqual(valid);
    expect(clientErrorSchema.safeParse({ ...valid, stack: undefined }).success).toBe(true);
  });

  it.each([
    ['an unknown kind', { ...valid, kind: 'warning' }],
    ['an empty message', { ...valid, message: '' }],
    ['a message too long', { ...valid, message: 'x'.repeat(501) }],
    ['a stack too long', { ...valid, stack: 'x'.repeat(4001) }],
    ['a path with a query string', { ...valid, path: '/login?user=401' }],
    ['a whole URL', { ...valid, path: 'https://depadmin.osspro.site/' }],
  ])('rejects %s', (_label, input) => {
    expect(clientErrorSchema.safeParse(input).success).toBe(false);
  });
});
