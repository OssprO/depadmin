import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limits attempts per client IP *and* username. Neighbours on the building's Wi-Fi share one
 * public IP, so an IP-only limit would let one person lock everybody out.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(request: Record<string, unknown>): Promise<string> {
    const body = request['body'] as { username?: unknown } | undefined;
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
    return Promise.resolve(`${String(request['ip'])}:${username}`);
  }
}
