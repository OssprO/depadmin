import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APP_VERSION: z.string().min(1).default('dev'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Signs access tokens. Generate one with `openssl rand -base64 48`. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  /** Login attempts allowed per minute for each IP and username. */
  LOGIN_ATTEMPTS_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(5),
  /** Scheduled jobs (opening the month when nobody did). Tests turn them off. */
  JOBS_ENABLED: z.stringbool().default(true),
  /**
   * The reverse proxies in front of the API, as Express' `trust proxy` list (addresses,
   * subnets or `loopback`, `linklocal`, `uniquelocal`), comma separated. The client's IP is
   * then the last address in X-Forwarded-For that none of them owns, which the login limit
   * counts. Empty (the default) trusts nobody: the IP is the socket's.
   */
  TRUST_PROXY: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Fails fast at boot with every invalid variable listed, instead of
 * surfacing a misconfiguration later as an obscure runtime error.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
