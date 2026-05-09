// apps/api/src/weekly/weekly.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { QuestionsService } from '../questions/questions.service';
import { RankingService } from '../ranking/ranking.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WEEKLY_COMP_POINTS } from '../ranking/ranking.constants';

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
  ) {}

  // ── Cron: open competition every Thursday midnight UTC ─────────────────
  @Cron('0 0 * * 4')
  async openWeeklyCompetition() {
    this.logger.log('Opening weekly competition');

    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);

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

    const pool = this.questions.findForWeeklyComp(theme as any, COMP_QUESTION_COUNT);

    // Deactivate any previously active competitions
    await this.prisma.weeklyCompetition.updateMany({
      where: { isActive: true },
      data:  { isActive: false },
    });

    const competition = await this.prisma.weeklyCompetition.create({
      data: {
        weekStart,
        weekEnd,
        theme,
        themeLabel: themeLabels[theme],
        questionIds: pool.map(q => q.id),
        isActive: true,
      },
    });

    await this.redis.setJson('weekly:active', competition, 60 * 60 * 24 * 4);
    this.logger.log(`Weekly competition ${competition.id} opened — theme: ${theme}`);
  }

  // ── Cron: close competition every Monday midnight UTC ─────────────────
  @Cron('0 0 * * 1')
  async closeWeeklyCompetition() {
    const active = await this.getActiveCompetition();
    if (!active) return;

    this.logger.log(`Closing weekly competition ${active.id}`);

    // Rank all submissions
    const submissions = await this.prisma.weeklySubmission.findMany({
      where:   { competitionId: active.id },
      orderBy: [{ score: 'desc' }, { submittedAt: 'asc' }], // tie-break: submitted earlier wins
    });

    // Award points and update finalRank
    for (let i = 0; i < submissions.length; i++) {
      const rank = i + 1;
      let bonus = 0;

      if (rank === 1)       bonus = WEEKLY_COMP_POINTS.RANK_1;
      else if (rank === 2)  bonus = WEEKLY_COMP_POINTS.RANK_2;
      else if (rank === 3)  bonus = WEEKLY_COMP_POINTS.RANK_3;
      else if (rank <= 10)  bonus = WEEKLY_COMP_POINTS.TOP_10;
      else if (rank <= 25)  bonus = WEEKLY_COMP_POINTS.TOP_25;
      else                  bonus = WEEKLY_COMP_POINTS.PARTICIPATION;

      await this.prisma.weeklySubmission.update({
        where: { id: submissions[i].id },
        data:  { finalRank: rank, pointsEarned: bonus },
      });

      await this.ranking.awardPoints(
        submissions[i].userId,
        bonus,
        'weekly_competition',
        active.id,
      );

      // Award badges for top finishers
      if (rank <= 3 || rank <= 10) {
        const badgeType = rank === 1 ? 'WEEKLY_CHAMPION' : rank <= 3 ? 'WEEKLY_PODIUM' : 'WEEKLY_TOP_10';
        const label = `${active.themeLabel} — ${rank === 1 ? 'Champion' : `#${rank}`} (${active.weekStart.toISOString().split('T')[0]})`;
        await this.prisma.badge.create({
          data: { userId: submissions[i].userId, type: badgeType as any, label },
        });

        // Notify top 3
        if (rank <= 3) {
          await this.notifications.send(submissions[i].userId, {
            type:  'weekly_result',
            title: rank === 1 ? '🏆 You won the weekly competition!' : `🎖 You finished #${rank} in the weekly competition`,
            body:  `${active.themeLabel} — you earned ${bonus} rank points`,
            metadata: { rank, competitionId: active.id, bonus },
          });
        }
      }
    }

    // Reset weekly XP for all users (weekly leaderboard reset)
    await this.resetWeeklyLeaderboard(submissions);

    await this.prisma.weeklyCompetition.update({
      where: { id: active.id },
      data:  { isActive: false },
    });

    await this.redis.del('weekly:active');
    this.logger.log(`Weekly competition ${active.id} closed. ${submissions.length} participants.`);
  }

  private async resetWeeklyLeaderboard(submissions: any[]) {
    // Award weekly leaderboard bonuses before reset
    const topUsers = await this.prisma.user.findMany({
      orderBy: { weeklyXp: 'desc' },
      take: 10,
      select: { id: true, weeklyXp: true },
    });

    for (let i = 0; i < topUsers.length; i++) {
      const rank = i + 1;
      let bonus = 0;
      if (rank === 1)      bonus = 500;
      else if (rank === 2) bonus = 300;
      else if (rank === 3) bonus = 150;
      else                 bonus = 50;

      await this.ranking.awardPoints(topUsers[i].id, bonus, 'weekly_leaderboard', `week_${rank}`);
    }

    // Reset everyone's weekly XP
    await this.prisma.user.updateMany({ data: { weeklyXp: 0 } });
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

    const existing = await this.prisma.weeklySubmission.findUnique({
      where: { userId_competitionId: { userId, competitionId: competition.id } },
    });
    if (existing) throw new BadRequestException('You have already submitted this week');

    // Score answers
    const questions = competition.questionIds.map((id: string) =>
      this.questions.findById(id),
    );

    let score = 0;
    for (const q of questions) {
      const choice = answers[q.id];
      if (choice !== undefined && 'answer' in q && (q as any).answer === choice) {
        score++;
      }
    }

    const submission = await this.prisma.weeklySubmission.create({
      data: {
        userId,
        competitionId: competition.id,
        score,
        pointsEarned: 0, // computed on close
        answers,
      },
    });

    // Award weekly XP (used in weekly leaderboard)
    const weeklyXp = score * 20;
    await this.prisma.user.update({
      where: { id: userId },
      data: { weeklyXp: { increment: weeklyXp } },
    });

    await this.redis.del('leaderboard:weekly');

    return { score, total: questions.length, submission };
  }

  async getActiveCompetition() {
    const cached = await this.redis.getJson<any>('weekly:active');
    if (cached) return cached;

    const comp = await this.prisma.weeklyCompetition.findFirst({
      where: { isActive: true },
    });
    if (comp) await this.redis.setJson('weekly:active', comp, 3600);
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
      questions: comp.questionIds.map((id: string) => {
        const q = this.questions.findById(id);
        const { ...safe } = q as any;
        delete safe.answer;
        return safe;
      }),
    };
  }
}
