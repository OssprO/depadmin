import { describe, expect, it } from 'vitest';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  PASSWORD_MIN_LENGTH,
  sessionResponseSchema,
} from './auth.js';

describe('auth contracts', () => {
  it('trims the username and requires both login fields', () => {
    expect(loginRequestSchema.parse({ username: ' 501 ', password: 'x' }).username).toBe('501');
    expect(loginRequestSchema.safeParse({ username: '', password: 'x' }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ username: '501', password: '' }).success).toBe(false);
  });

  it('asks for long passwords, not composition rules', () => {
    const change = (newPassword: string) =>
      changePasswordRequestSchema.safeParse({ currentPassword: 'old', newPassword }).success;

    expect(change('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
    expect(change('la casa del 501')).toBe(true);
  });

  it('rejects a new password equal to the current one, on the new password field', () => {
    const result = changePasswordRequestSchema.safeParse({
      currentPassword: 'la casa del 501',
      newPassword: 'la casa del 501',
    });

    expect(result.error?.issues[0]?.path).toEqual(['newPassword']);
  });

  it('accepts a session for an owner and for the superadmin', () => {
    const user = {
      id: '0b9d8f5e-7c2a-4f4e-9d6b-3f1e2a7c5b10',
      username: '501',
      role: 'OWNER',
      unit: 501,
      mustChangePassword: false,
    };
    const session = { accessToken: 'jwt', expiresInSeconds: 900, user };

    expect(sessionResponseSchema.safeParse(session).success).toBe(true);
    expect(
      sessionResponseSchema.safeParse({
        ...session,
        user: { ...user, username: 'admin', role: 'SUPERADMIN', unit: null },
      }).success,
    ).toBe(true);
  });
});
