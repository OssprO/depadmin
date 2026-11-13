import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthResponse } from '@depadmin/shared';
import type { Env } from '../config/env.js';
import { Public } from '../http/auth.js';
import { PrismaDatabase } from '../prisma/prisma-database.js';

/** How long the database has to answer before the API counts it as down. */
export const READY_TIMEOUT_MS = 3000;

/**
 * `GET /api/health` says the process is up (Docker's healthcheck: restarting the API does
 * not fix a database that is down). `GET /api/health/ready` also asks the database, for the
 * external monitor: it answers 503 when the app cannot serve anything useful.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly database: PrismaDatabase,
  ) {}

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      version: this.config.get('APP_VERSION', { infer: true }),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready(): Promise<HealthResponse> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), READY_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.database.client.$queryRaw`SELECT 1`, timeout]);
    } catch {
      throw new ServiceUnavailableException('The database does not answer');
    } finally {
      clearTimeout(timer);
    }
    return this.check();
  }
}
