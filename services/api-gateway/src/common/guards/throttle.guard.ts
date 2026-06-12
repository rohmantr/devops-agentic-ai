import { Injectable } from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerException,
  ThrottlerRequest,
} from '@nestjs/throttler';
import { Request, Response } from 'express';

@Injectable()
export class TenantThrottleGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const ips = req.ips as string[] | undefined;
    const ip = req.ip as string;
    return Promise.resolve(ips && ips.length > 0 ? ips[0] : ip);
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context, ttl, throttler } = requestProps;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { tier?: string } }>();
    const tier = req.user?.tier || 'free';

    const TIER_LIMITS: Record<string, number> = {
      free: 100,
      pro: 1000,
      enterprise: 5000,
    };
    const dynamicLimit = TIER_LIMITS[tier] || TIER_LIMITS.free;

    const tracker = await this.getTracker(
      req as unknown as Record<string, unknown>,
    );
    const throttlerName = throttler.name || 'default';
    const key = this.generateKey(context, tracker, throttlerName);

    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(
        key,
        ttl,
        dynamicLimit,
        ttl,
        throttlerName,
      );

    const res = context.switchToHttp().getResponse<Response>();
    res.header('X-RateLimit-Limit', dynamicLimit.toString());
    res.header(
      'X-RateLimit-Remaining',
      Math.max(0, dynamicLimit - totalHits).toString(),
    );

    // Normalize reset time to relative seconds (ceil)
    const resetTimeMs = isBlocked ? timeToBlockExpire : timeToExpire;
    const resetTimeSec = Math.ceil(resetTimeMs / 1000);
    res.header('X-RateLimit-Reset', resetTimeSec.toString());

    if (isBlocked || totalHits > dynamicLimit) {
      throw new ThrottlerException(
        'Rate limit exceeded. Please try again later.',
      );
    }

    return true;
  }
}
