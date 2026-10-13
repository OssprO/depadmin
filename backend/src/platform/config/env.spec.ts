import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

const DATABASE_URL = 'postgresql://depadmin:depadmin@localhost:5433/depadmin';

describe('validateEnv', () => {
  it('applies defaults when optional variables are missing', () => {
    expect(validateEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      APP_VERSION: 'dev',
      DATABASE_URL,
    });
  });

  it('coerces PORT from string', () => {
    expect(validateEnv({ DATABASE_URL, PORT: '8080' }).PORT).toBe(8080);
  });

  it('requires a PostgreSQL DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
    expect(validateEnv({ DATABASE_URL: 'postgres://x@db/app' }).DATABASE_URL).toBe(
      'postgres://x@db/app',
    );
  });

  it('reports every invalid variable at once', () => {
    expect(() => validateEnv({ PORT: 'abc', LOG_LEVEL: 'loud' })).toThrow(/PORT[\s\S]*LOG_LEVEL/);
  });
});
