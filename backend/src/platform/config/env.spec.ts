import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

const DATABASE_URL = 'postgresql://depadmin:depadmin@localhost:5433/depadmin';
const JWT_SECRET = 'a-test-secret-that-is-long-enough-for-hs256';
const required = { DATABASE_URL, JWT_SECRET };

describe('validateEnv', () => {
  it('applies defaults when optional variables are missing', () => {
    expect(validateEnv(required)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      APP_VERSION: 'dev',
      DATABASE_URL,
      JWT_SECRET,
    });
  });

  it('coerces PORT from string', () => {
    expect(validateEnv({ ...required, PORT: '8080' }).PORT).toBe(8080);
  });

  it('requires a PostgreSQL DATABASE_URL', () => {
    expect(() => validateEnv({ JWT_SECRET })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ JWT_SECRET, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
    expect(validateEnv({ JWT_SECRET, DATABASE_URL: 'postgres://x@db/app' }).DATABASE_URL).toBe(
      'postgres://x@db/app',
    );
  });

  it('requires a JWT secret long enough for HS256', () => {
    expect(() => validateEnv({ DATABASE_URL })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ DATABASE_URL, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('reports every invalid variable at once', () => {
    expect(() => validateEnv({ PORT: 'abc', LOG_LEVEL: 'loud' })).toThrow(/PORT[\s\S]*LOG_LEVEL/);
  });
});
