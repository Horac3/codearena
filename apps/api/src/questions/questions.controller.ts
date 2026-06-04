// apps/api/src/questions/questions.controller.ts
import {
  Controller, Get, Post, Body, Param, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, IsObject } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QuestionsService } from './questions.service';

class SubmitDailyDto {
  @IsObject() answers: Record<string, number>;
}

@ApiTags('questions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get('daily')
  @ApiOperation({ summary: 'Get today\'s daily blitz set (5 questions) — answers stripped' })
  getDaily() {
    return this.questions.getDailySet();
  }

  @Post('daily/submit')
  @ApiOperation({ summary: 'Submit today\'s daily blitz answers — server-side scoring' })
  submitDaily(@Body() dto: SubmitDailyDto, @Req() req: any) {
    return this.questions.submitDaily(req.user.userId, dto.answers);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single question by ID (answer stripped)' })
  getOne(@Param('id') id: string) {
    return this.questions.findByIdSafe(id);
  }
}
