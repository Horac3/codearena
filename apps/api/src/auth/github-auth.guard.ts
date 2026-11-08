// apps/api/src/auth/github-auth.guard.ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** OAuth `state` values the clients generate: 32–128 hex chars. */
export const OAUTH_STATE_RE = /^[a-f0-9]{32,128}$/;

/**
 * GitHub OAuth guard that forwards the client's `state` to GitHub. GitHub echoes it back on
 * the callback, and the client (the VS Code extension) only accepts a token whose state
 * matches the one it generated — so a web page can't sign a user into someone else's
 * account by opening the vscode:// auth link (login CSRF).
 */
@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const state = req.query?.state;
    return typeof state === 'string' && OAUTH_STATE_RE.test(state) ? { state } : {};
  }
}
