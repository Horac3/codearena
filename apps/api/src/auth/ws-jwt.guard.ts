// apps/api/src/auth/ws-jwt.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    return this.authenticate(context.switchToWs().getClient<Socket>());
  }

  /** Verify the socket's JWT and set client.data.userId / username. Returns false if invalid. */
  authenticate(client: Socket): boolean {
    // Token comes from socket handshake auth: { token: 'Bearer xxx' }
    const raw =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers?.authorization as string | undefined);
    const token = raw?.replace(/^Bearer\s+/i, '');
    if (!token) return false;

    try {
      const payload = this.jwt.verify(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      }) as { sub: string; username: string };
      client.data.userId = payload.sub;
      client.data.username = payload.username;
      return true;
    } catch {
      return false;
    }
  }
}
