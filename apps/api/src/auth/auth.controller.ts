// apps/api/src/auth/auth.controller.ts
import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { GithubAuthGuard, OAUTH_STATE_RE } from './github-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private config: ConfigService,
  ) {}

  @Get('github')
  @UseGuards(GithubAuthGuard)
  @ApiOperation({ summary: 'Redirect to GitHub OAuth (pass ?state=<random hex> from the client)' })
  githubLogin() {
    // Passport handles the redirect
  }

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  @ApiOperation({ summary: 'GitHub OAuth callback — redirects to VS Code with token and state' })
  async githubCallback(@Req() req: any, @Res() res: any) {
    const user = req.user;
    const token = this.auth.signToken(user.id, user.username);
    // Deep-link back into VS Code with the JWT and the state the extension generated
    res.redirect(`vscode://codearena.codearena/auth?${authQuery(token, req.query?.state)}`);
  }

  @Get('github/callback/web')
  @UseGuards(GithubAuthGuard)
  @ApiOperation({ summary: 'GitHub OAuth callback for web (non-extension) flow' })
  async githubCallbackWeb(@Req() req: any, @Res() res: any) {
    const user = req.user;
    const token = this.auth.signToken(user.id, user.username);
    const webUrl = this.config.get<string>('WEB_URL', 'https://codearena.never9to5ive.com');
    res.redirect(`${webUrl}/auth/success?${authQuery(token, req.query?.state)}`);
  }
}

function authQuery(token: string, state: unknown): string {
  const q = new URLSearchParams({ token });
  if (typeof state === 'string' && OAUTH_STATE_RE.test(state)) q.set('state', state);
  return q.toString();
}
