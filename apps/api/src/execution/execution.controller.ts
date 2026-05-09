// apps/api/src/execution/execution.controller.ts
import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExecutionService } from './execution.service';

class SubmitDto {
  @IsString() questionId: string;
  @IsString() @IsIn(['javascript', 'typescript', 'python', 'go']) language: string;
  @IsString() code: string;
}

@ApiTags('execution')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('execute')
export class ExecutionController {
  constructor(private readonly execution: ExecutionService) {}

  @Post()
  @ApiOperation({ summary: 'Submit code for a coding challenge — runs against test suite' })
  submit(@Body() dto: SubmitDto, @Req() req: any) {
    return this.execution.execute(dto.questionId, dto.language, dto.code, req.user.userId);
  }
}
