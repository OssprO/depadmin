import { Global, Module } from '@nestjs/common';
import { CLOCK } from '../../shared-kernel/index.js';
import { SystemClock } from './system-clock.js';

@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: new SystemClock() }],
  exports: [CLOCK],
})
export class ClockModule {}
