// apps/api/src/leaderboard/leaderboard.service.ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const LEADERBOARD_TTL = 300; // 5 minutes cache

@Injectable()
export class LeaderboardService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getWeekly(limit = 50) {
    const cached = await this.redis.getJson('leaderboard:weekly');
    if (cached) return cached;
    return this.buildAndCache(limit);
  }

  private async buildAndCache(limit: number) {
    const entries = await this.prisma.user.findMany({
      orderBy: { weeklyXp: 'desc' },
      take: limit,
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

  // Reset weekly XP every Monday at midnight
  @Cron('0 0 * * 1')
  async resetWeeklyXp() {
    await this.prisma.user.updateMany({ data: { weeklyXp: 0 } });
    await this.redis.del('leaderboard:weekly');
  }
}
