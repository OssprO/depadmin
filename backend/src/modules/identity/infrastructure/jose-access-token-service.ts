import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';
import type { Env } from '../../../platform/config/env.js';
import { type Actor, CLOCK, type Clock, UnitNumber } from '../../../shared-kernel/index.js';
import {
  ACCESS_TOKEN_LIFETIME_SECONDS,
  type AccessToken,
  type AccessTokenService,
} from '../domain/index.js';

const ALGORITHM = 'HS256';
const ISSUER = 'depadmin';
const AUDIENCE = 'depadmin-web';

/**
 * Access tokens as JWTs signed with HMAC-SHA256. The API both signs and verifies them, so a
 * shared secret is enough (no key pairs). Claims: `sub` (user id), `role` and, for owners
 * and readers of a depto, `unit`.
 */
@Injectable()
export class JoseAccessTokenService implements AccessTokenService {
  private readonly secret: Uint8Array;

  constructor(
    config: ConfigService<Env, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.secret = new TextEncoder().encode(config.get('JWT_SECRET', { infer: true }));
  }

  async issue(actor: Actor): Promise<AccessToken> {
    const issuedAt = Math.floor(this.clock.now().epochMillis / 1000);
    const token = await new SignJWT({
      role: actor.role,
      ...(actor.role !== 'SUPERADMIN' && actor.unit && { unit: actor.unit.value }),
    })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(actor.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ACCESS_TOKEN_LIFETIME_SECONDS)
      .sign(this.secret);
    return { token, expiresInSeconds: ACCESS_TOKEN_LIFETIME_SECONDS };
  }

  async verify(token: string): Promise<Actor | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        audience: AUDIENCE,
        currentDate: new Date(this.clock.now().epochMillis),
        requiredClaims: ['sub', 'exp'],
      });
      const userId = payload.sub as string;
      if (payload['role'] === 'SUPERADMIN') return { role: 'SUPERADMIN', userId };
      const unit = typeof payload['unit'] === 'number' ? UnitNumber.of(payload['unit']) : null;
      if (payload['role'] === 'OWNER' && unit) return { role: 'OWNER', userId, unit };
      if (payload['role'] === 'READER') return { role: 'READER', userId, unit };
      return null;
    } catch {
      return null; // bad signature, expired, malformed, or an unknown depto
    }
  }
}
