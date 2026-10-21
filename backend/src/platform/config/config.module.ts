import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import type { Env } from './env.js';
import { validateEnv } from './env.js';

/** Typed accessor: `config.get('PORT', { infer: true })` returns a number. */
export type AppConfig = ConfigService<Env, true>;

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      validate: validateEnv,
      cache: true,
    }),
  ],
  exports: [NestConfigModule],
})
export class ConfigModule {}
