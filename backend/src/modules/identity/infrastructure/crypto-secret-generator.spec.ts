import { describe, expect, it } from 'vitest';
import { CryptoSecretGenerator } from './crypto-secret-generator.js';

const secrets = new CryptoSecretGenerator();

describe('CryptoSecretGenerator', () => {
  it('creates 256-bit refresh tokens stored as their SHA-256', () => {
    const { token, tokenHash } = secrets.refreshToken();

    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(secrets.hashRefreshToken(token)).toBe(tokenHash);
    expect(secrets.refreshToken().token).not.toBe(token);
  });

  it('creates readable temporary passwords without look-alike characters', () => {
    const passwords = Array.from({ length: 50 }, () => secrets.temporaryPassword());

    for (const password of passwords) {
      expect(password).toMatch(/^[a-km-np-z2-9]{4}(-[a-km-np-z2-9]{4}){3}$/);
    }
    expect(new Set(passwords).size).toBe(passwords.length);
  });
});
