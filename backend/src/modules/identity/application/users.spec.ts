import { beforeEach, describe, expect, it } from 'vitest';
import { withCode } from '../../../../test/support/domain-error.js';
import { type Actor, LocalDate, UnitNumber } from '../../../shared-kernel/index.js';
import { ChangeUserAccess, CreateReader, DisableUser, EnableUser } from './manage-users.js';
import { RefreshSession } from './refresh-session.js';
import { SignIn } from './sign-in.js';
import {
  fakeHasher,
  givenOwner,
  givenSuperadmin,
  identityFixture,
  immediateUnitOfWork,
} from './testing.js';

const d = (text: string) => LocalDate.parse(text);

describe('managing who can get in', () => {
  let fx: ReturnType<typeof identityFixture>;
  let admin: Actor;
  let create: CreateReader;
  let changeAccess: ChangeUserAccess;
  let disable: DisableUser;
  let enable: EnableUser;
  let signIn: SignIn;
  let refresh: RefreshSession;

  beforeEach(async () => {
    fx = identityFixture();
    admin = (await givenSuperadmin(fx.users)).actor;
    await givenOwner(fx.users, UnitNumber.of(501), 'correct horse');
    const { users, refreshTokens, secrets, unitOfWork, audit, clock, sessions } = fx;
    create = new CreateReader(users, fakeHasher, secrets, unitOfWork, audit, clock);
    changeAccess = new ChangeUserAccess(users, unitOfWork, audit, clock);
    disable = new DisableUser(users, refreshTokens, unitOfWork, audit, clock);
    enable = new EnableUser(users, unitOfWork, audit);
    signIn = new SignIn(users, fakeHasher, immediateUnitOfWork, clock, sessions);
    refresh = new RefreshSession(
      refreshTokens,
      users,
      secrets,
      immediateUnitOfWork,
      clock,
      sessions,
    );
  });

  const tenant = (expiresOn: string | null = null) =>
    create.execute(admin, {
      username: 'inquilino.302',
      unit: UnitNumber.of(302),
      expiresOn: expiresOn === null ? null : d(expiresOn),
    });

  it('creates a read-only user with a temporary password, audited', async () => {
    const { user, temporaryPassword } = await tenant('2026-12-31');

    expect(user).toMatchObject({
      role: 'READER',
      unit: UnitNumber.of(302),
      mustChangePassword: true,
    });
    const session = await signIn.execute({
      username: 'inquilino.302',
      password: temporaryPassword,
    });
    expect(session.user.actor).toEqual({
      role: 'READER',
      userId: user.id,
      unit: UnitNumber.of(302),
    });
    const created = fx.audit.entries.at(-1)!.change;
    expect(created.action).toBe('USER_CREATED');
    expect(created.changes).toContainEqual({ field: 'role', before: null, after: 'READER' });
    expect(created.changes).toContainEqual({
      field: 'expiresOn',
      before: null,
      after: '2026-12-31',
    });
  });

  it('refuses a taken username, a past expiry, and anyone but the superadmin', async () => {
    await tenant();
    await expect(tenant()).rejects.toThrow(withCode('USERNAME_TAKEN'));
    await expect(
      create.execute(admin, { username: 'otro', unit: null, expiresOn: d('2026-01-01') }),
    ).rejects.toThrow(withCode('USER_EXPIRY_PAST'));
    const owner = (await fx.users.findByUsername('501'))!.actor;
    await expect(
      create.execute(owner, { username: 'otro', unit: null, expiresOn: null }),
    ).rejects.toThrow(withCode('SUPERADMIN_ONLY'));
  });

  it('lets in a temporary user until its last day, then ends its sessions', async () => {
    const { user, temporaryPassword } = await tenant(String(fx.clock.today()));
    const session = await signIn.execute({ username: user.username, password: temporaryPassword });

    fx.clock.advanceDays(1);
    await expect(
      signIn.execute({ username: user.username, password: temporaryPassword }),
    ).rejects.toThrow(withCode('ACCESS_EXPIRED'));
    await expect(refresh.execute(session.refreshToken.token)).rejects.toThrow(
      withCode('SESSION_INVALID'),
    );
    // A wrong password still says nothing about the account.
    await expect(signIn.execute({ username: user.username, password: 'wrong' })).rejects.toThrow(
      withCode('INVALID_CREDENTIALS'),
    );
  });

  it('switches a user off and on, ending its sessions, audited', async () => {
    const owner = (await fx.users.findByUsername('501'))!;
    const session = await signIn.execute({ username: '501', password: 'correct horse' });

    await disable.execute(admin, owner.id);
    expect(fx.refreshTokens.activeSessionsOf(owner.id, fx.clock.now())).toEqual([]);
    await expect(signIn.execute({ username: '501', password: 'correct horse' })).rejects.toThrow(
      withCode('ACCESS_DISABLED'),
    );
    await expect(refresh.execute(session.refreshToken.token)).rejects.toThrow(
      withCode('SESSION_INVALID'),
    );

    await enable.execute(admin, owner.id);
    await signIn.execute({ username: '501', password: 'correct horse' });
    expect(fx.audit.actions.slice(-2)).toEqual(['USER_DISABLED', 'USER_ENABLED']);
    await expect(disable.execute(admin, admin.userId)).rejects.toThrow(
      withCode('SUPERADMIN_ACCESS_FIXED'),
    );
  });

  it("changes a reader's depto and an owner's expiry, audited", async () => {
    const { user } = await tenant();
    const moved = await changeAccess.execute(admin, user.id, {
      unit: UnitNumber.of(401),
      expiresOn: d('2027-06-30'),
    });
    expect(moved).toMatchObject({ unit: UnitNumber.of(401), expiresOn: d('2027-06-30') });
    expect(fx.audit.entries.at(-1)?.change).toMatchObject({
      action: 'USER_ACCESS_CHANGED',
      changes: [
        { field: 'unit', before: 302, after: 401 },
        { field: 'expiresOn', before: null, after: '2027-06-30' },
      ],
    });

    const owner = (await fx.users.findByUsername('501'))!;
    await expect(
      changeAccess.execute(admin, owner.id, { unit: null, expiresOn: null }),
    ).rejects.toThrow(withCode('USER_UNIT_INVALID'));
    await expect(
      changeAccess.execute(admin, 'nobody', { unit: null, expiresOn: null }),
    ).rejects.toThrow(withCode('USER_NOT_FOUND'));
  });
});
