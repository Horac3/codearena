// apps/api/src/weekly/weekly.controller.ts
import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WeeklyService } from './weekly.service';

class SubmitWeeklyDto {
  @IsObject() answers: Record<string, number>;
}

@ApiTags('weekly')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('weekly')
export class WeeklyController {
  constructor(private readonly weekly: WeeklyService) {}

  @Get('active')
  @ApiOperation({ summary: 'Get active weekly competition and its questions' })
  async getActive() {
    const competition = await this.weekly.getActiveCompetition();
    if (!competition) return { active: false };
    const data = await this.weekly.getCompetitionQuestions(competition.id);
    return { active: true, ...data };
  }

  @Post('submit')
  @ApiOperation({ summary: 'Submit answers for the active weekly competition' })
  submit(@Body() dto: SubmitWeeklyDto, @Req() req: any) {
    return this.weekly.submitWeeklyAnswers(req.user.userId, dto.answers);
  }
}
