// apps/api/src/execution/execution.controller.ts
import { Controller, Post, Get, Param, Body, Req, UseGuards, NotFoundException, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsIn, MaxLength, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExecutionService } from './execution.service';
import { ExecutionQueue } from '../jobs/execution.queue';
import { PrismaService } from '../prisma/prisma.service';

const MAX_CODE_CHARS = 20_000;

class SubmitDto {
  @IsString() @Matches(/^[a-z0-9-]+$/) @MaxLength(100) questionId!: string;
  @IsString() @IsIn(['javascript', 'typescript', 'python', 'go']) language!: string;
  @IsString() @MaxLength(MAX_CODE_CHARS) code!: string;
}

@ApiTags('execution')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('execute')
export class ExecutionController {
  constructor(
    private readonly execution: ExecutionService,
    private readonly queue: ExecutionQueue,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @HttpCode(202)
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // each run costs a Judge0 slot
  @ApiOperation({ summary: 'Submit code for a coding challenge — returns jobId (202) for polling' })
  async submit(@Body() dto: SubmitDto, @Req() req: any) {
    this.execution.assertRunnable(dto.questionId, dto.language);

    // Create job record before enqueuing
    const jobDb = await this.prisma.executionJob.create({
      data: {
        userId: req.user.userId,
        questionId: dto.questionId,
        language: dto.language,
        status: 'pending',
      },
    });

    // Enqueue via BullMQ for async execution
    await this.queue.enqueue({
      jobDbId: jobDb.id,
      userId: req.user.userId,
      questionId: dto.questionId,
      language: dto.language,
      code: dto.code,
    });

    return { jobId: jobDb.id };
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Poll execution result by job ID (your own jobs only)' })
  async getResult(@Param('jobId') jobId: string, @Req() req: any) {
    const job = await this.prisma.executionJob.findFirst({
      where: { id: jobId, userId: req.user.userId },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status === 'pending' || job.status === 'queued' || job.status === 'running') {
      return { status: job.status, completed: false };
    }
    return { status: job.status, completed: true, result: job.result };
  }
}
