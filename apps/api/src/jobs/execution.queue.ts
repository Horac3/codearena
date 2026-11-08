// apps/api/src/jobs/execution.queue.ts
// BullMQ job queue for code execution — keeps Judge0 from saturating the CPU.
// The API enqueues jobs and returns a jobId immediately.
// A worker processes jobs two at a time; the extension polls GET /execute/:jobId for results.

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job, UnrecoverableError } from 'bullmq';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { RankingService } from '../ranking/ranking.service';
import { Judge0LanguageService } from '../judge0/judge0-language.service';
import { QuestionsService } from '../questions/questions.service';
import { CodingQuestion, XP } from '@codearena/question-schema';
import { Prisma } from '@prisma/client';
import {
  HarnessError,
  buildJsProgram,
  expectedTestNames,
  hasHarness,
  parseHarnessOutput,
  solutionName,
  toJavaScript,
} from './code-harness';

export interface ExecutionJobData {
  jobDbId:    string;
  userId:     string;
  questionId: string;
  language:   string;
  code:       string;
}

@Injectable()
export class ExecutionQueue implements OnModuleDestroy {
  private readonly logger = new Logger(ExecutionQueue.name);
  private queue: Queue;
  private worker: Worker;

  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
    private ranking: RankingService,
    private config: ConfigService,
    private judge0: Judge0LanguageService,
    private questions: QuestionsService,
  ) {
    // Same REDIS_URL as the rest of the API (the old REDIS_HOST/REDIS_PORT pair pointed
    // at the Docker hostname even when running outside Docker).
    const connection = this.redis.bullConnection();

    this.queue = new Queue('code-execution', { connection });

    // Worker — concurrency of 2 means at most 2 Judge0 calls at once
    // This is safe on a 2-core VPS: Judge0 gets ~0.8 cores per job
    this.worker = new Worker(
      'code-execution',
      (job) => this.processJob(job),
      { connection, concurrency: 2 },
    );

    this.worker.on('completed', (job) =>
      this.logger.log(`Job ${job.id} completed`),
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Job ${job?.id} failed: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.worker.close();
    await this.queue.close();
  }

  // ── Enqueue ───────────────────────────────────────────────────────────

  async enqueue(data: ExecutionJobData) {
    const job = await this.queue.add('execute', data, {
      // Retries are for infrastructure hiccups (Judge0 unreachable). Results of the user's
      // own code (wrong answer, crash, timeout) are final and never retried.
      attempts:    3,
      backoff:     { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail:     { count: 50 },
    });

    // Update DB record with BullMQ job id
    await this.prisma.executionJob.update({
      where: { id: data.jobDbId },
      data:  { bullJobId: job.id, status: 'queued' },
    });

    return job.id;
  }

  // ── Process ───────────────────────────────────────────────────────────

  private async processJob(job: Job<ExecutionJobData>) {
    const { jobDbId, userId, questionId, language, code } = job.data;

    await this.prisma.executionJob.update({
      where: { id: jobDbId },
      data:  { status: 'running' },
    });

    try {
      const question = this.questions.findById(questionId);
      if (question.type !== 'coding') throw new HarnessError('Only coding questions can be executed');
      if (!hasHarness(language)) throw new HarnessError(`${language} submissions are not supported yet`);

      const codingQ = question as CodingQuestion;
      const fnName = solutionName(codingQ.functionSignature[language]);
      if (!fnName) throw new HarnessError(`This question has no ${language} signature`);

      const timeLimit = codingQ.timeLimit ?? 5000;
      const testSource = this.loadTestFile(codingQ.testFile);
      const expected = expectedTestNames(testSource);
      const marker = `@@CA-${randomBytes(16).toString('hex')}@@`;
      const program = buildJsProgram(toJavaScript(code, language), fnName, testSource);

      const started = Date.now();
      const data = await this.callJudge0(program, marker, timeLimit);
      const executionMs = Date.now() - started;

      const stdout: string = data.stdout ?? '';
      if (data.status?.id !== 3) {
        // Compile error, runtime error, time limit… — the user's result, not a job failure.
        const detail = (data.stderr || data.compile_output || '').toString().slice(0, 1000);
        throw new HarnessError(`${data.status?.description ?? 'Execution failed'}${detail ? `: ${detail}` : ''}`);
      }

      const results = parseHarnessOutput(stdout, marker, expected);
      const passed  = results.filter(r => r.passed).length;
      const allPassed = results.length > 0 && passed === results.length;

      // XP once per question: on the first submission that passes every test.
      let xpAwarded = 0;
      if (allPassed) {
        const xp = results.length * XP.CODING_PER_TEST;
        const award = await this.ranking.awardPoints(userId, xp, 'coding_challenge', questionId, { xp });
        if (!award.duplicate) {
          xpAwarded = xp;
          await this.redis.del('leaderboard:weekly');
        }
      }

      const result = {
        questionId,
        passed,
        failed: results.length - passed,
        total:  results.length,
        results,
        executionMs,
        xpAwarded,
      };

      await this.prisma.executionJob.update({
        where: { id: jobDbId },
        data:  { status: 'completed', result: result as unknown as Prisma.InputJsonValue, completedAt: new Date() },
      });
    } catch (err: any) {
      const userFacing = err instanceof HarnessError;
      const finalAttempt = userFacing || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (finalAttempt) {
        await this.prisma.executionJob.update({
          where: { id: jobDbId },
          data:  {
            status: 'failed',
            result: { error: userFacing ? err.message : 'The code runner is unavailable. Try again shortly.' },
            completedAt: new Date(),
          },
        });
      }
      if (userFacing) throw new UnrecoverableError(err.message); // don't retry the user's own result
      throw err;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async callJudge0(source: string, stdin: string, timeLimitMs: number): Promise<any> {
    const judge0Url = this.config.get('JUDGE0_URL', 'http://judge0:2358');
    const judge0Token = this.config.get('JUDGE0_AUTH_TOKEN');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (judge0Token) headers['Authorization'] = `Bearer ${judge0Token}`;

    const response = await fetch(`${judge0Url}/submissions?wait=true`, {
      method:  'POST',
      headers,
      body: JSON.stringify({
        source_code: source,
        language_id: this.judge0.resolve('javascript'), // TypeScript is transpiled to JS first
        stdin,
        cpu_time_limit: Math.ceil(timeLimitMs / 1000),
        memory_limit: 128000,
      }),
      signal: AbortSignal.timeout(timeLimitMs + 8000),
    });

    if (!response.ok) throw new Error(`Judge0 error: ${response.status} ${response.statusText}`);
    return response.json();
  }

  private loadTestFile(testFile: string): string {
    const questionsDir = this.config.get<string>(
      'QUESTIONS_DIR',
      path.join(__dirname, '../../../../questions'),
    );
    const testsDir = path.join(questionsDir, 'coding', 'tests');
    const candidate = path.resolve(testsDir, testFile);
    if (!candidate.startsWith(path.resolve(testsDir) + path.sep) || !fs.existsSync(candidate)) {
      throw new HarnessError('Test file not found for question');
    }
    return fs.readFileSync(candidate, 'utf-8');
  }
}
