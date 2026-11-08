// apps/api/src/questions/questions.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import seedrandom from 'seedrandom';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Question, Topic, questionsFromFile, validateQuestion } from '@codearena/question-schema';
import { Prisma } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { RankingService } from '../ranking/ranking.service';
import { ContributionsService } from '../contributions/contributions.service';
import {
  DAILY_POINTS,
  calculateStreakMultiplier,
} from '../ranking/ranking.constants';

const DAILY_SET_SIZE = 5;
const DAILY_CACHE_TTL = 60 * 60 * 25; // 25 hours — overlap so midnight transitions are smooth

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);
  private bank: Question[] = [];

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService,
    private users: UsersService,
    private ranking: RankingService,
    private contributions: ContributionsService,
  ) {}

  // ── Startup ──────────────────────────────────────────────────────────────

  async onModuleInit() {
    await this.loadBank();
    this.logger.log(`Question bank loaded: ${this.bank.length} questions`);
  }

  // ── Bank loading ─────────────────────────────────────────────────────────

  private async loadBank(): Promise<void> {
    const questionsDir = this.config.get<string>(
      'QUESTIONS_DIR',
      path.join(__dirname, '../../../../questions'),
    );
    const { questions, errors } = loadQuestionBank(questionsDir);
    if (errors.length > 0) {
      for (const err of errors) this.logger.error(err);
      // A bad bank silently breaks the daily set, duels and the weekly competition, so refuse to start.
      throw new Error(`Question bank has ${errors.length} invalid entr${errors.length === 1 ? 'y' : 'ies'} (see log)`);
    }
    if (questions.length === 0) this.logger.warn(`No questions found in ${questionsDir}`);
    this.bank = questions;
  }

  /** Replace the in-memory bank (tests). */
  setBank(questions: Question[]) {
    this.bank = questions;
  }

  // ── Daily set ─────────────────────────────────────────────────────────────

  async submitDaily(
    userId: string,
    answers: Record<string, number>,
  ): Promise<{
    score: number;
    total: number;
    pointsEarned: number;
    streak: number;
    results: Array<{ questionId: string; choice: number | null; correct: boolean; answer: number | null; explanation: string }>;
  }> {
    const date = this.todayString();
    // Score against the set that was served today, not a fresh rebuild from the current bank.
    const set = await this.getStoredDailySet(date);
    if (set.length === 0) throw new BadRequestException('No Daily Blitz is available today');

    const results = set.map((q) => {
      const raw = answers[q.id];
      const choice = Number.isInteger(raw) ? raw : null;
      const answer = 'answer' in q ? (q as { answer: number }).answer : null;
      return {
        questionId: q.id,
        choice,
        correct: choice !== null && answer === choice,
        answer,
        explanation: q.explanation,
      };
    });
    const score = results.filter((r) => r.correct).length;
    const total = set.length;
    // Only keep answers to questions in the set, so a client can't store arbitrary JSON.
    const storedAnswers = Object.fromEntries(results.map((r) => [r.questionId, r.choice]));

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Insert first: the unique (userId, date) key makes a second submit fail here,
        // before the streak or points are touched.
        const submission = await tx.dailySubmission.create({
          data: { userId, date, score, pointsEarned: 0, answers: storedAnswers },
        });

        const user = await this.users.updateStreak(userId, tx);
        const streak = user?.streak ?? 1;
        const multiplier = calculateStreakMultiplier(streak);
        const baseXp = score * DAILY_POINTS.CORRECT_ANSWER;
        const perfectBonus = score === total ? DAILY_POINTS.PERFECT_SCORE : 0;
        const pointsEarned = Math.max(
          Math.round((baseXp + perfectBonus + DAILY_POINTS.COMPLETION_BONUS) * multiplier),
          0,
        );

        await tx.dailySubmission.update({ where: { id: submission.id }, data: { pointsEarned } });
        await this.ranking.awardPoints(userId, pointsEarned, 'daily_blitz', date, { tx, xp: pointsEarned });
        if (user) await this.ranking.checkStreakBadges(userId, streak, tx);

        return { score, total, pointsEarned, streak, results };
      }, { timeout: 15_000 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('You have already submitted today\'s Daily Blitz');
      }
      throw e;
    } finally {
      await this.redis.del('leaderboard:weekly').catch(() => undefined);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'UTC' })
  async seedDailySet(): Promise<void> {
    const date = this.todayString();
    // One instance seeds; the others skip (crons run on every replica).
    if (!(await this.redis.acquireLock(`cron:daily-seed:${date}`, 300))) return;
    this.logger.log(`Seeding daily set for ${date}`);
    const set = await this.getStoredDailySet(date);

    // Notify authors whose questions are used in today's set
    for (const q of set) {
      await this.contributions.notifyQuestionUsed(q.id, 'daily_blitz', 0, date).catch(() => {});
    }

    this.logger.log(`Daily set for ${date} seeded with ${set.length} questions`);
  }

  async getDailySet() {
    const date = this.todayString();
    const set = await this.getStoredDailySet(date);
    // Strip answers before sending to client
    return set.map((q) => this.stripAnswer(q));
  }

  /**
   * Today's set as stored in the DB (created on first use). Every instance and every
   * request for the day resolves the same question IDs, even if the bank changes mid-day.
   */
  private async getStoredDailySet(date: string): Promise<Question[]> {
    let ids = await this.redis.getJson<string[]>(`daily:${date}:ids`);
    if (!ids) {
      const stored = await this.prisma.dailySet.findUnique({ where: { date } });
      if (stored) {
        ids = stored.questionIds;
      } else {
        const built = this.buildDailySet(date).map((q) => q.id);
        if (built.length === 0) return [];
        const created = await this.prisma.dailySet.upsert({
          where: { date },
          create: { date, seed: date, questionIds: built },
          update: {}, // another request won the race; keep its set
        });
        ids = created.questionIds;
      }
      await this.redis.setJson(`daily:${date}:ids`, ids, DAILY_CACHE_TTL);
    }
    return ids
      .map((id) => this.bank.find((q) => q.id === id))
      .filter((q): q is Question => !!q);
  }

  private buildDailySet(date: string): Question[] {
    // Coding questions need the editor and execution flow, so the blitz uses multiple-choice types.
    const pool = this.bank.filter((q) => q.type !== 'coding');
    if (pool.length === 0) return [];
    // Use a seeded shuffle so everyone gets the same questions on the same day
    const rng = seedrandom(date);
    return this.shuffleArray(pool, rng).slice(0, DAILY_SET_SIZE);
  }

  // ── Question lookup ───────────────────────────────────────────────────────

  findById(id: string): Question {
    const q = this.bank.find((q) => q.id === id);
    if (!q) throw new NotFoundException(`Question ${id} not found`);
    return q;
  }

  findByIdSafe(id: string): Omit<Question, 'answer'> {
    const q = this.findById(id);
    return this.stripAnswer(q);
  }

  isValidTopic(topic: string): topic is Topic | 'mixed' {
    return topic === 'mixed' || TOPICS.includes(topic as Topic);
  }

  findForDuel(topic: Topic | 'mixed', rounds: number): Question[] {
    const pool =
      topic === 'mixed'
        ? this.bank
        : this.bank.filter((q) => q.topic === topic);
    // Exclude coding questions from duels for v1 — too slow to execute in real-time
    const eligible = pool.filter((q) => q.type !== 'coding');
    const rng = seedrandom(Date.now().toString());
    return this.shuffleArray(eligible, rng).slice(0, rounds);
  }

  // ── Weekly competition ──────────────────────────────────────────────────

  findForWeeklyComp(topic: string, count: number): Question[] {
    const pool = topic === 'mixed'
      ? this.bank
      : this.bank.filter((q) => q.topic === topic as Topic);

    const eligible = pool.filter(
      (q) => q.type !== 'coding' && q.difficulty >= 2,
    );

    const rng = seedrandom(Date.now().toString());
    return this.shuffleArray(eligible, rng).slice(0, count);
  }

  /**
   * A copy of the question safe to send before it is answered: no answer key, and no
   * explanation or fixed code (both usually give the answer away). Daily Blitz returns
   * explanations with the results after submitting.
   */
  stripAnswer(q: Question): Omit<Question, 'answer'> {
    const { ...safe } = q as any;
    delete safe.answer;
    delete safe.explanation;
    delete safe.fixedCode;
    return safe;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private shuffleArray<T>(arr: T[], rng: () => number): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  todayString(): string {
    return new Date().toISOString().split('T')[0];
  }
}

const TOPICS: Topic[] = ['dsa', 'systems', 'cs-fundamentals', 'networking'];

/**
 * Read every question JSON under `dir`. A file holds one question or an array of them.
 * Returns the flattened, validated questions plus one error string per problem
 * (invalid JSON, schema errors, duplicate IDs).
 */
export function loadQuestionBank(dir: string): { questions: Question[]; errors: string[] } {
  const questions: Question[] = [];
  const errors: string[] = [];
  const seen = new Map<string, string>();

  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'solutions') continue; // reference solutions are never served
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.includes('test')) continue;

      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(full, 'utf-8'));
      } catch (e) {
        errors.push(`${full}: invalid JSON (${(e as Error).message})`);
        continue;
      }
      questionsFromFile(raw).forEach((q, i) => {
        const where = Array.isArray(raw) ? `${full}[${i}]` : full;
        const problems = validateQuestion(q, full);
        if (problems.length > 0) {
          errors.push(`${where}: ${problems.join('; ')}`);
          return;
        }
        const question = q as Question;
        const previous = seen.get(question.id);
        if (previous) {
          errors.push(`${where}: duplicate id "${question.id}" (also in ${previous})`);
          return;
        }
        seen.set(question.id, where);
        questions.push(question);
      });
    }
  };

  if (!fs.existsSync(dir)) return { questions, errors: [`Questions directory not found: ${dir}`] };
  walk(dir);
  return { questions, errors };
}


