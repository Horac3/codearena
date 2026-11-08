// apps/api/src/duel/duel.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DuelService } from './duel.service';

@ApiTags('duels')
@Controller('duels')
export class DuelController {
  constructor(private readonly duelService: DuelService) {}

  // Public: the web invite page calls this without a token. Returns only what the
  // invite page shows (creator name and avatar, topic, rounds, status, expiry).
  @Get('invite/:token')
  @ApiOperation({ summary: 'Look up a duel invite by token (for the web invite page)' })
  getInvite(@Param('token') token: string) {
    return this.duelService.findByToken(token);
  }
}
