// apps/api/src/leaderboard/leaderboard.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const LEADERBOARD_TTL = 300; // 5 minutes cache
const MAX_ENTRIES = 100;

@Injectable()
export class LeaderboardService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // One cached list (the top MAX_ENTRIES); each caller gets a slice of it, so the first
  // caller's limit no longer decides what everyone sees for five minutes.
  async getWeekly(limit = 50) {
    const take = Math.min(Math.max(Math.floor(limit) || 50, 1), MAX_ENTRIES);
    const cached = await this.redis.getJson<unknown[]>('leaderboard:weekly');
    const entries = cached ?? (await this.buildAndCache());
    return entries.slice(0, take);
  }

  private async buildAndCache() {
    const entries = await this.prisma.user.findMany({
      orderBy: [{ weeklyXp: 'desc' }, { id: 'asc' }],
      take: MAX_ENTRIES,
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        weeklyXp: true,
        streak: true,
        level: true,
      },
    });

    const ranked = entries.map((u, i) => ({ rank: i + 1, ...u }));
    await this.redis.setJson('leaderboard:weekly', ranked, LEADERBOARD_TTL);
    return ranked;
  }

  // Weekly XP reset is handled by WeeklyService.closeWeeklyCompetition()
  // to ensure leaderboard bonuses are awarded before the reset.
  // This method is kept for manual/admin use.
  async resetWeeklyXp() {
    await this.prisma.user.updateMany({ data: { weeklyXp: 0 } });
    await this.redis.del('leaderboard:weekly');
  }
}
