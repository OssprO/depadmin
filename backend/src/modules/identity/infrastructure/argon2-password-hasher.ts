import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '../domain/index.js';

/**
 * argon2id with OWASP's minimum parameters (19 MiB, 2 passes, 1 lane), which are also the
 * library defaults: about 50 ms per hash, cheap for us and expensive for a cracker. The
 * parameters travel inside each hash string, so raising them later keeps old hashes valid.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false; // a malformed hash never matches
    }
  }
}
