import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthResponse } from '@depadmin/shared';
import type { Env } from '../config/env.js';
import { Public } from '../http/auth.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      version: this.config.get('APP_VERSION', { infer: true }),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
