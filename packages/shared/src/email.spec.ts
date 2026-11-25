import { describe, expect, it } from 'vitest';
import {
  changeEmailRequestSchema,
  completeRecoveryRequestSchema,
  userEmailRequestSchema,
} from './email.js';

describe('email contracts', () => {
  it('stores addresses lowercase and without spaces around', () => {
    expect(changeEmailRequestSchema.parse({ email: '  Vecina.502@Ejemplo.MX ' }).email).toBe(
      'vecina.502@ejemplo.mx',
    );
  });

  it('refuses what is not an address', () => {
    for (const email of ['', 'vecina', 'vecina@', '@ejemplo.mx', 'vecina @ejemplo.mx']) {
      expect(changeEmailRequestSchema.safeParse({ email }).success, email).toBe(false);
    }
  });

  it('lets the superadmin remove an address with null', () => {
    expect(userEmailRequestSchema.parse({ email: null }).email).toBeNull();
  });

  it('asks a recovered password the same length as any other', () => {
    expect(
      completeRecoveryRequestSchema.safeParse({ token: 'x', newPassword: 'corta' }).success,
    ).toBe(false);
    expect(
      completeRecoveryRequestSchema.safeParse({ token: 'x', newPassword: 'la casa del 501' })
        .success,
    ).toBe(true);
  });
});
