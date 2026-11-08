// apps/api/src/throttler.guard.ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Rate limiting for HTTP routes. WebSocket messages are validated per message instead. */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return context.getType() !== 'http' || super.shouldSkip(context);
  }

  // Throttle signed-in users by account rather than IP (many users can share an office NAT).
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.userId ?? req.ips?.[0] ?? req.ip;
  }
}
