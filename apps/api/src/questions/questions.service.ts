// apps/api/src/questions/questions.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import seedrandom from 'seedrandom';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Question, Topic, XP } from '@codearena/question-schema';
import { UsersService } from '../users/users.service';
import { RankingService } from '../ranking/ranking.service';
import { ContributionsService } from '../contributions/contributions.service';
import {
  DAILY_POINTS,
  calculateSpeedBonus,
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
    this.bank = this.readJsonFiles(questionsDir);
  }

  private readJsonFiles(dir: string): Question[] {
    const questions: Question[] = [];
    if (!fs.existsSync(dir)) {
      this.logger.warn(`Questions directory not found: ${dir}`);
      return questions;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        questions.push(...this.readJsonFiles(full));
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.json') &&
        !entry.name.includes('test')
      ) {
        try {
          const q = JSON.parse(fs.readFileSync(full, 'utf-8'));
          questions.push(q);
        } catch (e) {
          this.logger.warn(`Failed to parse ${full}: ${(e as Error).message}`);
        }
      }
    }
    return questions;
  }

  // ── Daily set ─────────────────────────────────────────────────────────────

  async submitDaily(
    userId: string,
    answers: Record<string, number>,
  ): Promise<{ score: number; total: number; pointsEarned: number; streak: number }> {
    const date = this.todayString();

    // Check for duplicate submission
    const existing = await this.prisma.dailySubmission.findUnique({
      where: { userId_date: { userId, date } },
    });
    if (existing) {
      throw new BadRequestException('You have already submitted today\'s Daily Blitz');
    }

    const set = this.buildDailySet(date);

    // Score server-side
    let score = 0;
    for (const q of set) {
      const choice = answers[q.id];
      if (choice !== undefined && 'answer' in q && (q as any).answer === choice) {
        score++;
      }
    }

    // Calculate XP
    let baseXp = score * DAILY_POINTS.CORRECT_ANSWER;
    const speedBonus = 0; // Daily blitz doesn't track per-question timing
    const perfectBonus = score === DAILY_SET_SIZE ? DAILY_POINTS.PERFECT_SCORE : 0;
    const completionBonus = DAILY_POINTS.COMPLETION_BONUS;

    // Update streak first so we have the current value
    const user = await this.users.updateStreak(userId);
    const multiplier = calculateStreakMultiplier(user?.streak ?? 1);

    const rawPoints = Math.round((baseXp + perfectBonus + completionBonus) * multiplier);
    const pointsEarned = Math.max(rawPoints, 0);

    // Persist submission
    await this.prisma.dailySubmission.create({
      data: {
        userId,
        date,
        score,
        pointsEarned,
        answers,
      },
    });

    // Award rank points via RankingService (floor protection, audit, tier calc)
    await this.ranking.awardPoints(userId, pointsEarned, 'daily_blitz', date);

    // Check streak badges
    if (user) {
      await this.ranking.checkStreakBadges(userId, user.streak);
    }

    return { score, total: DAILY_SET_SIZE, pointsEarned, streak: user?.streak ?? 1 };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async seedDailySet(): Promise<void> {
    const date = this.todayString();
    this.logger.log(`Seeding daily set for ${date}`);
    const set = this.buildDailySet(date);
    await this.prisma.dailySet.upsert({
      where: { date },
      create: { date, seed: date, questionIds: set.map((q) => q.id) },
      update: { questionIds: set.map((q) => q.id) },
    });
    await this.redis.setJson(`daily:${date}`, set, DAILY_CACHE_TTL);

    // Notify authors whose questions are used in today's set
    for (const q of set) {
      await this.contributions.notifyQuestionUsed(q.id, 'daily_blitz', 0).catch(() => {});
    }

    this.logger.log(`Daily set for ${date} seeded with ${set.length} questions`);
  }

  async getDailySet() {
    const date = this.todayString();
    const cached = await this.redis.getJson<Question[]>(`daily:${date}`);
    const set = cached ?? this.buildDailySet(date);
    if (!cached) {
      await this.redis.setJson(`daily:${date}`, set, DAILY_CACHE_TTL);
    }
    // Strip answers before sending to client
    return set.map((q) => this.stripAnswer(q));
  }

  private buildDailySet(date: string): Question[] {
    if (this.bank.length === 0) return [];
    // Use a seeded shuffle so everyone gets the same questions on the same day
    const rng = seedrandom(date);
    return this.shuffleArray(this.bank, rng).slice(0, DAILY_SET_SIZE);
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

  findByTopic(topic: Topic, count: number): Question[] {
    const filtered = this.bank.filter((q) => q.topic === topic);
    const rng = seedrandom(Date.now().toString());
    return this.shuffleArray(filtered, rng).slice(0, count);
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

  private stripAnswer(q: Question) {
    const { ...safe } = q as any;
    delete safe.answer;
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

  private todayString(): string {
    return new Date().toISOString().split('T')[0];
  }
}


