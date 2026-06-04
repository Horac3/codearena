// apps/api/src/auth/auth.controller.ts
import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private config: ConfigService,
  ) {}

  @Get('github')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Redirect to GitHub OAuth' })
  githubLogin() {
    // Passport handles the redirect
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback — redirects to VS Code with token' })
  async githubCallback(@Req() req: any, @Res() res: any) {
    const user = req.user;
    const token = this.auth.signToken(user.id, user.username);
    const webUrl = this.config.get<string>('WEB_URL', 'https://codearena.never9to5ive.com');
    // Deep-link back into VS Code with the JWT
    res.redirect(`vscode://codearena.codearena/auth?token=${token}`);
  }

  @Get('github/callback/web')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback for web (non-extension) flow' })
  async githubCallbackWeb(@Req() req: any, @Res() res: any) {
    const user = req.user;
    const token = this.auth.signToken(user.id, user.username);
    const webUrl = this.config.get<string>('WEB_URL', 'https://codearena.never9to5ive.com');
    res.redirect(`${webUrl}/auth/success?token=${token}`);
  }
}
