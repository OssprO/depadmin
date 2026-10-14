import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { API_PORT, SUPERADMIN, WEB_PORT } from './accounts.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const backend = `${root}backend`;
const frontend = `${root}frontend`;

/**
 * The whole system as it runs in production: PostgreSQL 18 with the real migrations and
 * seed, the compiled API, and the built SPA served by `vite preview` (which proxies /api,
 * as Caddy will). Returns a function that tears it all down.
 */
export async function startStack(): Promise<() => Promise<void>> {
  for (const build of [`${backend}/dist/main.js`, `${frontend}/dist/index.html`]) {
    if (!existsSync(build)) throw new Error(`Missing ${build}: run "pnpm build" first.`);
  }

  const database = await new PostgreSqlContainer('postgres:18-alpine').start();
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    LOG_LEVEL: 'warn',
    PORT: String(API_PORT),
    DATABASE_URL: database.getConnectionUri(),
    JWT_SECRET: 'browser-tests-secret-that-is-at-least-32-chars',
    SUPERADMIN_USERNAME: SUPERADMIN.username,
    SUPERADMIN_PASSWORD: SUPERADMIN.password,
    API_URL: `http://localhost:${API_PORT}`,
  };
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: backend,
    env,
    stdio: 'pipe',
  });
  execFileSync('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], { cwd: backend, env, stdio: 'pipe' });

  const processes = [
    spawn('node', ['dist/main.js'], { cwd: backend, env, stdio: 'inherit' }),
    spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(WEB_PORT), '--strictPort'], {
      cwd: frontend,
      env,
      stdio: 'ignore',
    }),
  ];

  const stop = async () => {
    for (const child of processes) child.kill();
    await Promise.all(processes.map(exited));
    await database.stop();
  };
  try {
    await waitFor(`http://localhost:${API_PORT}/api/health`);
    await waitFor(`http://localhost:${WEB_PORT}/`);
  } catch (error) {
    await stop();
    throw error;
  }
  return stop;
}

async function waitFor(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not respond within ${timeoutMs} ms`);
}

function exited(child: ChildProcess): Promise<void> {
  return child.exitCode !== null
    ? Promise.resolve()
    : new Promise((resolve) => child.once('exit', () => resolve()));
}
