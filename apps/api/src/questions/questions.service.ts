// apps/api/src/questions/questions.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import seedrandom from 'seedrandom';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Question, Topic } from '@codearena/question-schema';

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
    this.logger.log(`Daily set for ${date} seeded with ${set.length} questions`);
  }

  async getDailySet(): Promise<Question[]> {
    const date = this.todayString();
    const cached = await this.redis.getJson<Question[]>(`daily:${date}`);
    if (cached) return cached;

    // Cache miss — build and cache
    const set = this.buildDailySet(date);
    await this.redis.setJson(`daily:${date}`, set, DAILY_CACHE_TTL);
    return set;
  }

  private buildDailySet(date: string): Question[] {
    if (this.bank.length === 0) return [];
    // Use a seeded shuffle so everyone gets the same questions on the same day
    const rng = seedrandom(date);
    const shuffled = [...this.bank].sort(() => rng() - 0.5);
    return shuffled.slice(0, DAILY_SET_SIZE);
  }

  // ── Question lookup ───────────────────────────────────────────────────────

  findById(id: string): Question {
    const q = this.bank.find((q) => q.id === id);
    if (!q) throw new NotFoundException(`Question ${id} not found`);
    return q;
  }

  findByTopic(topic: Topic, count: number): Question[] {
    const filtered = this.bank.filter((q) => q.topic === topic);
    const rng = seedrandom(Date.now().toString());
    return filtered.sort(() => rng() - 0.5).slice(0, count);
  }

  findForDuel(topic: Topic | 'mixed', rounds: number): Question[] {
    const pool =
      topic === 'mixed'
        ? this.bank
        : this.bank.filter((q) => q.topic === topic);
    // Exclude coding questions from duels for v1 — too slow to execute in real-time
    const eligible = pool.filter((q) => q.type !== 'coding');
    const rng = seedrandom(Date.now().toString());
    return eligible.sort(() => rng() - 0.5).slice(0, rounds);
  }

  get bankSize(): number {
    return this.bank.length;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private todayString(): string {
    return new Date().toISOString().split('T')[0];
  }
}

  // Added for weekly competition — harder questions only (difficulty 2-3)
  findForWeeklyComp(topic: string, count: number): any[] {
    const pool = topic === 'mixed'
      ? this.bank
      : this.bank.filter((q: any) => q.topic === topic);

    const eligible = pool.filter(
      (q: any) => q.type !== 'coding' && q.difficulty >= 2,
    );

    const rng = require('seedrandom')(Date.now().toString());
    return eligible.sort(() => rng() - 0.5).slice(0, count);
  }
