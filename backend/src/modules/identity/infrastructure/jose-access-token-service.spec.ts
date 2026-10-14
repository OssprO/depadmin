import type { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../../platform/config/env.js';
import { type Actor, UnitNumber } from '../../../shared-kernel/index.js';
import { FixedClock } from '../../../../test/support/clock.js';
import { ACCESS_TOKEN_LIFETIME_SECONDS } from '../domain/index.js';
import { JoseAccessTokenService } from './jose-access-token-service.js';

const SECRET = 'a-test-secret-that-is-long-enough-for-hs256';
const configWith = (secret: string) =>
  ({ get: () => secret }) as unknown as ConfigService<Env, true>;

const owner: Actor = { role: 'OWNER', userId: 'u-501', unit: UnitNumber.of(501) };
const superadmin: Actor = { role: 'SUPERADMIN', userId: 'u-admin' };

function setup() {
  const clock = new FixedClock();
  return { clock, service: new JoseAccessTokenService(configWith(SECRET), clock) };
}

describe('JoseAccessTokenService', () => {
  it.each([owner, superadmin])('round-trips the actor ($role)', async (actor) => {
    const { service } = setup();
    const { token, expiresInSeconds } = await service.issue(actor);

    expect(expiresInSeconds).toBe(ACCESS_TOKEN_LIFETIME_SECONDS);
    expect(await service.verify(token)).toEqual(actor);
  });

  it('rejects the token once it expires', async () => {
    const { service, clock } = setup();
    const { token } = await service.issue(owner);

    clock.instant = clock.instant.plusSeconds(ACCESS_TOKEN_LIFETIME_SECONDS - 1);
    expect(await service.verify(token)).toEqual(owner);
    clock.instant = clock.instant.plusSeconds(1);
    expect(await service.verify(token)).toBeNull();
  });

  it('rejects tokens signed with another secret, tampered with, or malformed', async () => {
    const { service, clock } = setup();
    const other = new JoseAccessTokenService(configWith(`${SECRET}-other`), clock);
    const { token } = await other.issue(owner);
    const [header, , signature] = (await service.issue(owner)).token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ role: 'SUPERADMIN', sub: 'u-501' }),
    ).toString('base64url');

    expect(await service.verify(token)).toBeNull();
    expect(await service.verify(`${header}.${forgedPayload}.${signature}`)).toBeNull();
    expect(await service.verify('not-a-jwt')).toBeNull();
  });

  it('rejects validly signed tokens with unexpected claims', async () => {
    const { service, clock } = setup();
    const signed = (claims: Record<string, unknown>) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('u-501')
        .setIssuer('depadmin')
        .setAudience('depadmin-web')
        .setExpirationTime(Math.floor(clock.now().epochMillis / 1000) + 60)
        .sign(new TextEncoder().encode(SECRET));

    expect(await service.verify(await signed({ role: 'OWNER' }))).toBeNull();
    expect(await service.verify(await signed({ role: 'OWNER', unit: 503 }))).toBeNull();
    expect(await service.verify(await signed({ role: 'ROOT' }))).toBeNull();
  });
});
