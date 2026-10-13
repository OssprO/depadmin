import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UNIT_OF_WORK } from '../../shared-kernel/index.js';
import type { Env } from '../config/env.js';
import { createPrismaClient, PrismaDatabase } from './prisma-database.js';

/**
 * Provides `PrismaDatabase` to every repository and exposes it as the `UnitOfWork` port.
 * The client connects lazily on the first query, so the app boots without a database.
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaDatabase,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new PrismaDatabase(createPrismaClient(config.get('DATABASE_URL', { infer: true }))),
    },
    { provide: UNIT_OF_WORK, useExisting: PrismaDatabase },
  ],
  exports: [PrismaDatabase, UNIT_OF_WORK],
})
export class PrismaModule implements OnApplicationShutdown {
  constructor(@Inject(PrismaDatabase) private readonly database: PrismaDatabase) {}

  onApplicationShutdown(): Promise<void> {
    return this.database.disconnect();
  }
}
