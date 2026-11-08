// apps/api/src/users/users.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findByGithubId(githubId: string) {
    return this.prisma.user.findUnique({ where: { githubId } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Find or create the user for a GitHub login. Users are keyed on githubId only:
   * GitHub usernames can be renamed and later reused by someone else, so the stored
   * username and avatar are refreshed on every login.
   */
  async upsertFromGithub(profile: { id: string; username: string; avatarUrl?: string; email?: string }) {
    return this.prisma.user.upsert({
      where: { githubId: profile.id },
      create: {
        githubId: profile.id,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        email: profile.email,
      },
      update: {
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        ...(profile.email ? { email: profile.email } : {}),
      },
    });
  }

  create(profile: { id: string; username: string; avatarUrl?: string; email?: string }) {
    return this.prisma.user.create({
      data: {
        githubId: profile.id,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        email: profile.email,
      },
    });
  }

  /** Record activity today and return the updated user (streak counted in UTC calendar days). */
  async updateStreak(userId: string, db: Prisma.TransactionClient = this.prisma, now = new Date()) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    const streak = nextStreak(user.streak, user.lastActiveAt, now);
    const longestStreak = Math.max(streak, user.longestStreak);

    return db.user.update({
      where: { id: userId },
      data: { streak, longestStreak, lastActiveAt: now },
    });
  }

  getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        level: true,
        totalXp: true,
        weeklyXp: true,
        streak: true,
        createdAt: true,
      },
    });
  }
}

/** UTC calendar date (YYYY-MM-DD) for a timestamp. */
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Streak after activity at `now`: unchanged if already active today (UTC),
 * +1 if the last activity was yesterday, otherwise restarts at 1.
 */
export function nextStreak(current: number, lastActiveAt: Date | null, now: Date): number {
  if (!lastActiveAt) return 1;
  const today = utcDay(now);
  const last = utcDay(lastActiveAt);
  if (last === today) return Math.max(current, 1);
  const yesterday = utcDay(new Date(now.getTime() - 86_400_000));
  return last === yesterday ? current + 1 : 1;
}
