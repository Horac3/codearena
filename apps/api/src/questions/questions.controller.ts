// apps/api/src/questions/questions.controller.ts
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QuestionsService } from './questions.service';

@ApiTags('questions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get('daily')
  @ApiOperation({ summary: 'Get today\'s daily blitz set (5 questions)' })
  getDaily() {
    return this.questions.getDailySet();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single question by ID' })
  getOne(@Param('id') id: string) {
    return this.questions.findById(id);
  }
}
