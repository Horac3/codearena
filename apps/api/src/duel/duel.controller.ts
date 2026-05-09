// apps/api/src/duel/duel.controller.ts
import { Controller, Get, Param, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DuelService } from './duel.service';

@ApiTags('duels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('duels')
export class DuelController {
  constructor(private readonly duelService: DuelService) {}

  @Get('invite/:token')
  @ApiOperation({ summary: 'Look up a duel invite by token (for the web invite page)' })
  getInvite(@Param('token') token: string) {
    return this.duelService.findByToken(token);
  }
}
