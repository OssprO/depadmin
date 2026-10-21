import { describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';

const hasher = new Argon2PasswordHasher();

describe('Argon2PasswordHasher', () => {
  it('hashes with argon2id and OWASP parameters, salted', async () => {
    const first = await hasher.hash('la casa del 501');
    const second = await hasher.hash('la casa del 501');

    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(first).not.toBe(second);
  });

  it('verifies the right password only', async () => {
    const hash = await hasher.hash('la casa del 501');

    expect(await hasher.verify(hash, 'la casa del 501')).toBe(true);
    expect(await hasher.verify(hash, 'la casa del 502')).toBe(false);
  });

  it('never matches a malformed hash', async () => {
    expect(await hasher.verify('not-a-hash', 'anything')).toBe(false);
  });
});
