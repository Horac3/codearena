// apps/api/src/weekly/weekly.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { QuestionsService } from '../questions/questions.service';
import { RankingService } from '../ranking/ranking.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ContributionsService } from '../contributions/contributions.service';
import { Prisma, WeeklyCompetition } from '@prisma/client';
import { WEEKLY_COMP_POINTS, WEEKLY_LEADERBOARD_POINTS } from '../ranking/ranking.constants';

const THEMES = ['dsa', 'systems', 'cs-fundamentals', 'networking', 'mixed'];
const COMP_QUESTION_COUNT = 10;

@Injectable()
export class WeeklyService {
  private readonly logger = new Logger(WeeklyService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private questions: QuestionsService,
    private ranking: RankingService,
    private notifications: NotificationsService,
    private contributions: ContributionsService,
  ) {}

  // ── Cron: open competition every Thursday midnight UTC ─────────────────
  @Cron('0 0 * * 4', { timeZone: 'UTC' })
  async openWeeklyCompetition() {
    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    if (!(await this.redis.acquireLock(`cron:weekly-open:${weekStart.toISOString()}`, 600))) return;

    this.logger.log('Opening weekly competition');

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 3); // Sunday
    weekEnd.setUTCHours(23, 59, 59, 999);

    // Rotate theme based on week number
    const weekNum = Math.floor(weekStart.getTime() / (7 * 24 * 60 * 60 * 1000));
    const theme   = THEMES[weekNum % THEMES.length];

    const themeLabels: Record<string, string> = {
      dsa:               'Data Structures & Algorithms Week',
      systems:           'System Design Week',
      'cs-fundamentals': 'CS Fundamentals Week',
      networking:        'Networking Week',
      mixed:             'The Gauntlet — All Domains',
    };

    const pool = this.questions.findForWeeklyComp(theme, COMP_QUESTION_COUNT);
    if (pool.length === 0) {
      this.logger.error(`No eligible questions for weekly theme "${theme}" — competition not opened`);
      return;
    }

    const competition = await this.prisma.$transaction(async (tx) => {
      // Deactivate any previously active competitions
      await tx.weeklyCompetition.updateMany({
        where: { isActive: true },
        data:  { isActive: false },
      });
      return tx.weeklyCompetition.create({
        data: {
          weekStart,
          weekEnd,
          theme,
          themeLabel: themeLabels[theme],
          questionIds: pool.map(q => q.id),
          isActive: true,
        },
      });
    });

    await this.redis.del(ACTIVE_KEY);

    // Notify authors whose questions are featured
    for (const q of pool) {
      await this.contributions.notifyQuestionUsed(q.id, 'weekly_comp', 0, competition.id).catch(() => {});
    }

    this.logger.log(`Weekly competition ${competition.id} opened — theme: ${theme}`);
  }

  // ── Cron: close competition every Monday midnight UTC ─────────────────
  // Safe to re-run: each payout is keyed on its source, so a crash part way and a rerun
  // finishes the job without paying anyone twice.
  @Cron('0 0 * * 1', { timeZone: 'UTC' })
  async closeWeeklyCompetition(now = new Date()) {
    const weekKey = utcDate(now);
    if (!(await this.redis.acquireLock(`cron:weekly-close:${weekKey}`, 600))) return;

    const active = await this.prisma.weeklyCompetition.findFirst({
      where: { isActive: true, closedAt: null },
    });
    if (active) await this.closeCompetition(active);

    await this.payWeeklyLeaderboard(weekKey);
  }

  private async closeCompetition(active: WeeklyCompetition) {
    this.logger.log(`Closing weekly competition ${active.id}`);

    // Rank all submissions
    const submissions = await this.prisma.weeklySubmission.findMany({
      where:   { competitionId: active.id },
      orderBy: [{ score: 'desc' }, { submittedAt: 'asc' }], // tie-break: submitted earlier wins
    });

    const weekLabel = utcDate(active.weekStart);

    for (let i = 0; i < submissions.length; i++) {
      const rank = i + 1;
      const bonus = weeklyCompBonus(rank);
      const sub = submissions[i];

      await this.prisma.$transaction(async (tx) => {
        await tx.weeklySubmission.update({
          where: { id: sub.id },
          data:  { finalRank: rank, pointsEarned: bonus },
        });

        const award = await this.ranking.awardPoints(sub.userId, bonus, 'weekly_competition', active.id, { tx });

        if (rank <= 10) {
          const badgeType = rank === 1 ? 'WEEKLY_CHAMPION' : rank <= 3 ? 'WEEKLY_PODIUM' : 'WEEKLY_TOP_10';
          const label = `Week of ${weekLabel} — ${active.themeLabel.replace(' Week', '')} ${rank === 1 ? 'Champion' : `#${rank}`}`;
          // Scoped to the competition, so these can be earned every week
          await this.ranking.ensureBadge(sub.userId, badgeType, label, `weekly:${active.id}`, tx);

          if (rank <= 3 && !award.duplicate) {
            await this.notifications.send(sub.userId, {
              type:  'weekly_result',
              title: rank === 1 ? '🏆 You won the weekly competition!' : `🎖 You finished #${rank} in the weekly competition`,
              body:  `${active.themeLabel} — you earned ${bonus} rank points`,
              metadata: { rank, competitionId: active.id, bonus },
            }, tx);
          }
        }
      }, TX_OPTIONS);
    }

    await this.prisma.weeklyCompetition.update({
      where: { id: active.id },
      data:  { isActive: false, closedAt: new Date() },
    });

    await this.redis.del(ACTIVE_KEY);
    this.logger.log(`Weekly competition ${active.id} closed. ${submissions.length} participants.`);
  }

  /**
   * Pay the weekly XP leaderboard's top 10, then reset everyone's weekly XP.
   * Both happen in one transaction, so a rerun never pays a different (post-reset) top 10.
   */
  private async payWeeklyLeaderboard(weekKey: string) {
    const sourceId = `week:${weekKey}`;
    await this.prisma.$transaction(async (tx) => {
      const alreadyPaid = await tx.rankEvent.findFirst({
        where: { reason: 'weekly_leaderboard', sourceId },
        select: { id: true },
      });
      if (alreadyPaid) return;

      const topUsers = await tx.user.findMany({
        where: { weeklyXp: { gt: 0 } },
        orderBy: [{ weeklyXp: 'desc' }, { id: 'asc' }],
        take: 10,
        select: { id: true },
      });

      for (let i = 0; i < topUsers.length; i++) {
        const rank = i + 1;
        const bonus =
          rank === 1 ? WEEKLY_LEADERBOARD_POINTS.RANK_1 :
          rank === 2 ? WEEKLY_LEADERBOARD_POINTS.RANK_2 :
          rank === 3 ? WEEKLY_LEADERBOARD_POINTS.RANK_3 :
          WEEKLY_LEADERBOARD_POINTS.TOP_10;
        await this.ranking.awardPoints(topUsers[i].id, bonus, 'weekly_leaderboard', sourceId, { tx });
      }

      // Reset everyone's weekly XP (weekly leaderboard reset)
      await tx.user.updateMany({ where: { weeklyXp: { not: 0 } }, data: { weeklyXp: 0 } });
    }, { timeout: 60_000, maxWait: 10_000 });

    await this.redis.del('leaderboard:weekly');
  }

  // ── Submit answers to weekly competition ──────────────────────────────

  async submitWeeklyAnswers(
    userId: string,
    answers: Record<string, number>,
  ) {
    const competition = await this.getActiveCompetition();
    if (!competition) throw new BadRequestException('No active competition');

    const now = new Date();
    if (now < competition.weekStart || now > competition.weekEnd) {
      throw new BadRequestException('Competition is not currently accepting submissions');
    }

    // Score answers
    const questions = competition.questionIds.map((id: string) =>
      this.questions.findById(id),
    );

    let score = 0;
    const storedAnswers: Record<string, number | null> = {};
    for (const q of questions) {
      const choice = Number.isInteger(answers[q.id]) ? answers[q.id] : null;
      storedAnswers[q.id] = choice;
      if (choice !== null && 'answer' in q && (q as { answer: number }).answer === choice) {
        score++;
      }
    }

    try {
      const submission = await this.prisma.$transaction(async (tx) => {
        // Insert first: the unique (userId, competitionId) key rejects a second submit
        const created = await tx.weeklySubmission.create({
          data: {
            userId,
            competitionId: competition.id,
            score,
            pointsEarned: 0, // computed on close
            answers: storedAnswers,
          },
        });
        // Weekly XP (used in the weekly leaderboard)
        await tx.user.update({
          where: { id: userId },
          data: { weeklyXp: { increment: score * 20 }, totalXp: { increment: score * 20 } },
        });
        return created;
      });
      await this.redis.del('leaderboard:weekly');
      return { score, total: questions.length, submission };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('You have already submitted this week');
      }
      throw e;
    }
  }

  /** The active competition, with real Date fields (Redis only caches its id). */
  async getActiveCompetition(): Promise<WeeklyCompetition | null> {
    const cachedId = await this.redis.get(ACTIVE_KEY);
    if (cachedId) {
      const comp = await this.prisma.weeklyCompetition.findUnique({ where: { id: cachedId } });
      if (comp?.isActive) return comp;
    }

    const comp = await this.prisma.weeklyCompetition.findFirst({
      where: { isActive: true },
    });
    if (comp) await this.redis.set(ACTIVE_KEY, comp.id, 3600);
    return comp;
  }

  async getCompetitionQuestions(competitionId: string) {
    const comp = await this.prisma.weeklyCompetition.findUnique({
      where: { id: competitionId },
    });
    if (!comp) throw new NotFoundException('Competition not found');

    return {
      competition: comp,
      // Strip answers — never send to client
      questions: comp.questionIds.map((id: string) =>
        this.questions.stripAnswer(this.questions.findById(id)),
      ),
    };
  }
}

const ACTIVE_KEY = 'weekly:active:id';
const TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 };

function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weeklyCompBonus(rank: number): number {
  if (rank === 1)  return WEEKLY_COMP_POINTS.RANK_1;
  if (rank === 2)  return WEEKLY_COMP_POINTS.RANK_2;
  if (rank === 3)  return WEEKLY_COMP_POINTS.RANK_3;
  if (rank <= 10)  return WEEKLY_COMP_POINTS.TOP_10;
  if (rank <= 25)  return WEEKLY_COMP_POINTS.TOP_25;
  return WEEKLY_COMP_POINTS.PARTICIPATION;
}
