// apps/api/src/contributions/ci-token.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/**
 * Guards the CI webhook routes: the caller must send `X-CI-Token: <CI_WEBHOOK_SECRET>`.
 * With no secret configured the routes are closed.
 */
@Injectable()
export class CiTokenGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('CI_WEBHOOK_SECRET');
    const req = context.switchToHttp().getRequest();
    const sent = req.headers?.['x-ci-token'];
    if (!secret || typeof sent !== 'string') throw new UnauthorizedException();
    const a = Buffer.from(sent);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    return true;
  }
}
