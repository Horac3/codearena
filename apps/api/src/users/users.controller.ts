// apps/api/src/users/users.controller.ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { RankingService } from '../ranking/ranking.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly ranking: RankingService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@Req() req: any) {
    return this.users.getProfile(req.user.userId);
  }

  @Get('me/rank')
  @ApiOperation({ summary: 'Get current user rank tier, points and progress to the next tier' })
  getMyRank(@Req() req: any) {
    return this.ranking.getUserRankInfo(req.user.userId);
  }
}
