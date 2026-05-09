// apps/api/src/users/users.service.ts
import { Injectable } from '@nestjs/common';
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

  async updateStreak(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const now = new Date();
    const lastActive = user.lastActiveAt;
    const daysSinceLast = lastActive
      ? Math.floor((now.getTime() - lastActive.getTime()) / 86_400_000)
      : null;

    let streak = user.streak;
    if (daysSinceLast === null || daysSinceLast > 1) {
      streak = 1; // reset
    } else if (daysSinceLast === 1) {
      streak += 1; // extend
    }
    // daysSinceLast === 0 → same day, no change

    return this.prisma.user.update({
      where: { id: userId },
      data: { streak, lastActiveAt: now },
    });
  }

  async addXp(userId: string, xp: number) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        totalXp: { increment: xp },
        weeklyXp: { increment: xp },
      },
    });
    // Level up: every 1000 XP is a level
    const newLevel = Math.floor(user.totalXp / 1000) + 1;
    if (newLevel !== user.level) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { level: newLevel },
      });
    }
    return user;
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
