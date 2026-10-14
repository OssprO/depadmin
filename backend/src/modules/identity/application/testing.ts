// In-memory adapters for the identity use case specs. Excluded from the build.
import {
  type Actor,
  type Clock,
  Instant,
  LocalDate,
  type UnitNumber,
  type UnitOfWork,
} from '../../../shared-kernel/index.js';
import {
  type AccessToken,
  type AccessTokenService,
  normalizeUsername,
  type PasswordHasher,
  RefreshToken,
  type RefreshTokenRepository,
  type SecretGenerator,
  User,
  type UserRepository,
} from '../domain/index.js';
import { SessionIssuer } from './session-issuer.js';

export class InMemoryUserRepository implements UserRepository {
  readonly rows = new Map<string, User>();

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.copy(this.rows.get(id)));
  }

  findByUsername(username: string): Promise<User | null> {
    const name = normalizeUsername(username);
    return Promise.resolve(this.copy([...this.rows.values()].find((u) => u.username === name)));
  }

  findAll(): Promise<User[]> {
    return Promise.resolve([...this.rows.values()].map((user) => this.copy(user) as User));
  }

  save(user: User): Promise<void> {
    this.rows.set(user.id, this.copy(user) as User);
    return Promise.resolve();
  }

  /** Stored copies, so a use case that forgets to save is caught. */
  private copy(user: User | undefined): User | null {
    if (!user) return null;
    const { id, username, role, unit, passwordHash, mustChangePassword } = user;
    return User.restore({ id, username, role, unit, passwordHash, mustChangePassword });
  }
}

export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  readonly rows = new Map<string, RefreshToken>();

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return Promise.resolve([...this.rows.values()].find((t) => t.tokenHash === tokenHash) ?? null);
  }

  add(token: RefreshToken): Promise<void> {
    this.rows.set(token.id, token);
    return Promise.resolve();
  }

  rotate(rotated: RefreshToken, next: RefreshToken): Promise<boolean> {
    const stored = this.rows.get(rotated.id);
    if (!stored || stored.rotatedAt || stored.revokedAt) return Promise.resolve(false);
    this.rows.set(rotated.id, rotated);
    this.rows.set(next.id, next);
    return Promise.resolve(true);
  }

  revokeSession(sessionId: string, at: Instant): Promise<void> {
    return this.revokeWhere((t) => t.sessionId === sessionId, at);
  }

  revokeAllOf(userId: string, at: Instant): Promise<void> {
    return this.revokeWhere((t) => t.userId === userId, at);
  }

  activeSessionsOf(userId: string, now: Instant): string[] {
    return [...this.rows.values()]
      .filter((t) => t.userId === userId && t.stateAt(now) === 'ACTIVE')
      .map((t) => t.sessionId);
  }

  private revokeWhere(match: (token: RefreshToken) => boolean, at: Instant): Promise<void> {
    for (const token of this.rows.values()) {
      if (match(token) && !token.revokedAt) {
        this.rows.set(token.id, RefreshToken.restore({ ...propsOf(token), revokedAt: at }));
      }
    }
    return Promise.resolve();
  }
}

function propsOf(token: RefreshToken) {
  const { id, sessionId, userId, tokenHash, expiresAt, rotatedAt, revokedAt } = token;
  return { id, sessionId, userId, tokenHash, expiresAt, rotatedAt, revokedAt };
}

/** Readable, reversible "hashes", so specs can tell which password was stored. */
export const fakeHasher: PasswordHasher = {
  hash: (password) => Promise.resolve(`hashed:${password}`),
  verify: (hash, password) => Promise.resolve(hash === `hashed:${password}`),
};

export class FakeSecrets implements SecretGenerator {
  private count = 0;

  refreshToken(): { token: string; tokenHash: string } {
    const token = `refresh-${++this.count}`;
    return { token, tokenHash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return `sha:${token}`;
  }

  temporaryPassword(): string {
    return `temporary-${++this.count}`;
  }
}

export const fakeAccessTokens: AccessTokenService = {
  issue: (actor: Actor): Promise<AccessToken> =>
    Promise.resolve({ token: `access-for-${actor.userId}`, expiresInSeconds: 900 }),
  verify: () => Promise.resolve(null),
};

export class FixedClock implements Clock {
  constructor(public instant = Instant.ofEpochMillis(Date.parse('2026-10-13T12:00:00Z'))) {}

  today(): LocalDate {
    return LocalDate.parse(this.instant.toString().slice(0, 10));
  }

  now(): Instant {
    return this.instant;
  }

  advanceDays(days: number): void {
    this.instant = this.instant.plusDays(days);
  }
}

export const immediateUnitOfWork: UnitOfWork = { run: (work) => work() };

/** Everything a use case spec needs, wired like the Nest module does. */
export function identityFixture() {
  const users = new InMemoryUserRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const secrets = new FakeSecrets();
  const clock = new FixedClock();
  const sessions = new SessionIssuer(fakeAccessTokens, secrets, refreshTokens, clock);
  return { users, refreshTokens, secrets, clock, sessions };
}

export async function givenOwner(
  users: InMemoryUserRepository,
  unit: UnitNumber,
  password: string | null,
): Promise<User> {
  const user = User.createOwner(`u-${unit.value}`, unit);
  if (password) user.changePassword(await fakeHasher.hash(password));
  await users.save(user);
  return user;
}

export async function givenSuperadmin(users: InMemoryUserRepository): Promise<User> {
  const user = User.createSuperadmin('u-admin', 'admin', await fakeHasher.hash('admin-password'));
  await users.save(user);
  return user;
}
