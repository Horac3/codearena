// apps/api/src/execution/execution.controller.ts
import { Controller, Post, Get, Param, Body, Req, Res, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExecutionService } from './execution.service';
import { ExecutionQueue } from '../jobs/execution.queue';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(
    private readonly execution: ExecutionService,
    private readonly queue: ExecutionQueue,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Submit code for a coding challenge — returns jobId (202) for polling' })
  async submit(@Body() dto: SubmitDto, @Req() req: any, @Res() res: Response) {
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
    const jobId = await this.queue.enqueue({
      jobDbId: jobDb.id,
      userId: req.user.userId,
      questionId: dto.questionId,
      language: dto.language,
      code: dto.code,
    });

    res.status(202).json({ jobId: jobDb.id, bullJobId: jobId });
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Poll execution result by job ID' })
  async getResult(@Param('jobId') jobId: string) {
    const job = await this.prisma.executionJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status === 'pending' || job.status === 'queued' || job.status === 'running') {
      return { status: job.status, completed: false };
    }
    return { status: job.status, completed: true, result: job.result };
  }
}
