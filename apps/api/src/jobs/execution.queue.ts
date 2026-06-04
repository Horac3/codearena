// apps/api/src/jobs/execution.queue.ts
// BullMQ job queue for code execution — keeps Judge0 from saturating the CPU.
// The API enqueues jobs and returns a jobId immediately.
// A separate worker processes jobs one or two at a time.
// The extension polls GET /execute/:jobId for results.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { RankingService } from '../ranking/ranking.service';
import { Judge0LanguageService } from '../judge0/judge0-language.service';
import { QuestionsService } from '../questions/questions.service';
import { CodingQuestion, XP } from '@codearena/question-schema';
import * as fs from 'fs';
import * as path from 'path';

export interface ExecutionJobData {
  jobDbId:    string;
  userId:     string;
  questionId: string;
  language:   string;
  code:       string;
}

@Injectable()
export class ExecutionQueue {
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
    const connection = {
      host: this.config.get('REDIS_HOST', 'codearena-redis'),
      port: this.config.get<number>('REDIS_PORT', 6379),
    };

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
      this.logger.error(`Job ${job?.id} failed: ${err.message}`),
    );
  }

  // ── Enqueue ───────────────────────────────────────────────────────────

  async enqueue(data: ExecutionJobData) {
    const job = await this.queue.add('execute', data, {
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
      if (question.type !== 'coding') {
        throw new Error('Only coding questions can be executed');
      }
      const codingQ = question as CodingQuestion;
      const timeLimit = codingQ.timeLimit ?? 5000;

      // Load test source from disk
      const testSource = this.loadTestFile(codingQ.testFile, language);

      const judge0Url = this.config.get('JUDGE0_URL', 'http://judge0:2358');
      const judge0Token = this.config.get('JUDGE0_AUTH_TOKEN');
      const fullSource = this.buildRunnable(code, testSource, language);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (judge0Token) {
        headers['Authorization'] = `Bearer ${judge0Token}`;
      }

      const response = await fetch(`${judge0Url}/submissions?wait=true`, {
        method:  'POST',
        headers,
        body: JSON.stringify({
          source_code: fullSource,
          language_id: this.judge0.resolve(language),
          stdin: '',
          cpu_time_limit: Math.ceil(timeLimit / 1000),
          memory_limit: 128000,
        }),
        signal: AbortSignal.timeout(timeLimit + 8000),
      });

      if (!response.ok) throw new Error(`Judge0 error: ${response.statusText}`);

      const data   = await response.json() as any;

      const stdout = data.stdout ?? '';
      const stderr = data.stderr ?? data.compile_output ?? '';

      if (data.status?.id !== 3) {
        throw new Error(`Execution failed: ${data.status?.description || 'Unknown error'}`);
      }

      const results = this.parseOutput(stdout, stderr);
      const passed  = results.filter(r => r.passed).length;
      const xp      = passed * XP.CODING_PER_TEST;

      const result = {
        questionId,
        passed,
        failed: results.length - passed,
        total:  results.length,
        results,
        executionMs: Date.now(),
        xpAwarded: xp,
      };

      await this.prisma.executionJob.update({
        where: { id: jobDbId },
        data:  { status: 'completed', result, completedAt: new Date() },
      });

      // Award XP for passing tests
      if (xp > 0) {
        await this.ranking.awardPoints(userId, xp, 'coding_challenge', questionId);
        await this.prisma.user.update({
          where: { id: userId },
          data:  { weeklyXp: { increment: xp } },
        });
        await this.redis.del('leaderboard:weekly');
      }

      // Cache result in Redis for 1 hour — the extension polls GET /execute/:jobId
      await this.redis.setJson(`exec:result:${jobDbId}`, result, 3600);

    } catch (err: any) {
      await this.prisma.executionJob.update({
        where: { id: jobDbId },
        data:  { status: 'failed', result: { error: err.message } },
      });
      throw err;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private loadTestFile(testFile: string, language: string): string {
    const questionsDir = this.config.get<string>(
      'QUESTIONS_DIR',
      path.join(__dirname, '../../../../questions'),
    );
    const candidates = [
      path.join(questionsDir, 'coding', 'tests', testFile.replace('.test.js', `.test.${this.ext(language)}`)),
      path.join(questionsDir, 'coding', 'tests', testFile),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, 'utf-8');
      }
    }
    throw new Error(`Test file not found for question`);
  }

  private ext(language: string): string {
    return { javascript: 'js', typescript: 'ts', python: 'py', go: 'go' }[language] ?? 'js';
  }

  private buildRunnable(userCode: string, testSource: string, lang: string): string {
    if (lang === 'javascript' || lang === 'typescript') {
      return [userCode, '', INLINE_JS_HARNESS, '', testSource, '', 'runTests();'].join('\n');
    }
    if (lang === 'python') {
      return [userCode, '', INLINE_PY_HARNESS, '', testSource, '', 'run_tests()'].join('\n');
    }
    return userCode + '\n' + testSource;
  }

  private parseOutput(stdout: string, stderr: string) {
    const lines = stdout.trim().split('\n');
    const last  = lines[lines.length - 1];
    try {
      return JSON.parse(last) as Array<{ name: string; passed: boolean; error?: string }>;
    } catch {
      return [{ name: 'Execution', passed: false, error: stderr || stdout || 'Unknown error' }];
    }
  }

}

// ── Inline test harnesses (no Jest dependency in Piston sandbox) ──────────

const INLINE_JS_HARNESS = `
const __tests=[];const __results=[];
function test(name,fn){__tests.push({name,fn});}
function describe(_,fn){fn();}
function expect(actual){return{toEqual(e){if(JSON.stringify(actual)!==JSON.stringify(e))throw new Error('Expected '+JSON.stringify(e)+', got '+JSON.stringify(actual));},toBe(e){if(actual!==e)throw new Error('Expected '+e+', got '+actual);},toBeGreaterThan(n){if(actual<=n)throw new Error('Expected >'+n+', got '+actual);},toBeLessThan(n){if(actual>=n)throw new Error('Expected <'+n+', got '+actual);}}}
function runTests(){for(const t of __tests){try{t.fn();__results.push({name:t.name,passed:true});}catch(e){__results.push({name:t.name,passed:false,error:e.message});}}console.log(JSON.stringify(__results));}
`.trim();

const INLINE_PY_HARNESS = `
import json as __json
__tests=[];__results=[]
def test(name):
  def d(fn):__tests.append((name,fn));return fn
  return d
class __E:
  def __init__(self,a):self.a=a
  def to_equal(self,e):
    if self.a!=e:raise AssertionError(f'Expected {e}, got {self.a}')
  def to_be(self,e):
    if self.a!=e:raise AssertionError(f'Expected {e}, got {self.a}')
def expect(v):return __E(v)
def run_tests():
  for name,fn in __tests:
    try:fn();__results.append({'name':name,'passed':True})
    except Exception as e:__results.append({'name':name,'passed':False,'error':str(e)})
  print(__json.dumps(__results))
`.trim();
