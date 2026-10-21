import { expect } from 'vitest';

/** Matcher for `toThrow`: the thrown error is a DomainError with this code. */
export const withCode = (code: string) => expect.objectContaining({ code }) as unknown;
