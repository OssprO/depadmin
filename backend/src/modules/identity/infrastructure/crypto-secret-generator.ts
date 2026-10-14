import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SecretGenerator } from '../domain/index.js';

/** No 0/o, 1/l/i: a temporary password is read aloud or retyped from a chat. */
const READABLE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const GROUPS = 4;
const GROUP_LENGTH = 4;

@Injectable()
export class CryptoSecretGenerator implements SecretGenerator {
  /** 256 random bits. A fast hash is enough to store it: unlike a password, it can't be guessed. */
  refreshToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Like "k7m2-qx9p-…": 16 characters from 31, about 79 random bits. */
  temporaryPassword(): string {
    return Array.from({ length: GROUPS }, () =>
      Array.from(
        { length: GROUP_LENGTH },
        () => READABLE_ALPHABET[randomInt(READABLE_ALPHABET.length)],
      ).join(''),
    ).join('-');
  }
}
