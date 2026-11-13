import { Global, Module } from '@nestjs/common';
import { JobRunner } from './job-runner.js';

/** The scheduled jobs' runner, for every module's jobs/ folder. */
@Global()
@Module({ providers: [JobRunner], exports: [JobRunner] })
export class JobsModule {}
