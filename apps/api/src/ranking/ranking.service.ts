// apps/api/src/ranking/ranking.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  getTierForPoints,
  calculateDuelPoints,
  RANK_TIERS,
  RankTier,
} from './ranking.constants';

interface AwardResult {
  pointsBefore: number;
  pointsAfter: number;
  tierBefore: number;
  tierAfter: number;
  rankedUp: boolean;
  newTier?: RankTier;
}

@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ── Core award method — all rank point grants flow through here ────────

  async awardPoints(
    userId: string,
    delta: number,
    reason: string,
    sourceId?: string,
  ): Promise<AwardResult> {
    // Fetch current state
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { rankPoints: true, rankTier: true, duelsAtTier: true },
    });

    const pointsBefore = user.rankPoints;
    const tierBefore   = user.rankTier;

    // Floor protection — never go below tier floor if < 10 duels at current tier
    let effectiveDelta = delta;
    if (delta < 0) {
      const tierFloor = RANK_TIERS.find(t => t.tier === user.rankTier)?.minPoints ?? 0;
      const projectedPoints = pointsBefore + delta;
      if (projectedPoints < tierFloor && user.duelsAtTier < 10) {
        // Clamp to tier floor — can't drop below it yet
        effectiveDelta = tierFloor - pointsBefore;
        this.logger.debug(
          `Floor protection applied for ${userId}: clamped delta from ${delta} to ${effectiveDelta}`,
        );
      }
    }

    const pointsAfter = Math.max(0, pointsBefore + effectiveDelta);
    const newTierData = getTierForPoints(pointsAfter);
    const tierAfter   = newTierData.tier;
    const rankedUp    = tierAfter > tierBefore;

    // Update user
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        rankPoints: pointsAfter,
        rankTier: tierAfter,
        // Reset duelsAtTier when tier changes
        ...(rankedUp ? { duelsAtTier: 0 } : {}),
      },
    });

    // Write audit event
    await this.prisma.rankEvent.create({
      data: {
        userId,
        delta: effectiveDelta,
        reason,
        sourceId,
        rankBefore: pointsBefore,
        rankAfter: pointsAfter,
        tierBefore,
        tierAfter,
      },
    });

    // Notify on rank-up
    if (rankedUp) {
      await this.notifications.send(userId, {
        type:  'rank_up',
        title: `⚡ Rank up! You are now ${newTierData.title}`,
        body:  `You've reached rank tier ${tierAfter}. Keep going — ${
          RANK_TIERS.find(t => t.tier === tierAfter + 1)?.title ?? 'the top'
        } awaits.`,
        metadata: { tierBefore, tierAfter, title: newTierData.title },
      });

      // Award rank-up badge
      await this.prisma.badge.create({
        data: {
          userId,
          type:  tierAfter === 10 ? 'ULTIMATE_GEEK' : 'RANK_UP',
          label: `Reached ${newTierData.title}`,
        },
      });

      if (tierAfter === 10) {
        this.logger.log(`🏆 ${userId} reached ULTIMATE GEEK`);
      }
    }

    return { pointsBefore, pointsAfter, tierBefore, tierAfter, rankedUp, newTier: rankedUp ? newTierData : undefined };
  }

  // ── Duel-specific award (handles both players, floor protection, tier snapshot) ──

  async awardDuelPoints(
    duelId: string,
    winnerId: string | null,
    playerAId: string,
    playerBId: string,
    playerATier: number,
    playerBTier: number,
  ) {
    const isDraw = winnerId === null;

    const aOutcome = isDraw ? 'draw' : winnerId === playerAId ? 'win' : 'loss';
    const bOutcome = isDraw ? 'draw' : winnerId === playerBId ? 'win' : 'loss';

    const aDelta = calculateDuelPoints(aOutcome, playerATier, playerBTier);
    const bDelta = calculateDuelPoints(bOutcome, playerBTier, playerATier);

    const [aResult, bResult] = await Promise.all([
      this.awardPoints(playerAId, aDelta, 'duel_' + aOutcome, duelId),
      this.awardPoints(playerBId, bDelta, 'duel_' + bOutcome, duelId),
    ]);

    // Track duels at tier for floor protection
    await Promise.all([
      this.prisma.user.update({
        where: { id: playerAId },
        data: { duelsAtTier: { increment: 1 }, duelsPlayed: { increment: 1 }, ...(aOutcome === 'win' ? { duelsWon: { increment: 1 } } : {}) },
      }),
      this.prisma.user.update({
        where: { id: playerBId },
        data: { duelsAtTier: { increment: 1 }, duelsPlayed: { increment: 1 }, ...(bOutcome === 'win' ? { duelsWon: { increment: 1 } } : {}) },
      }),
    ]);

    // Persist awarded points back to duel record
    await this.prisma.duel.update({
      where: { id: duelId },
      data: { pointsAwardedA: aDelta, pointsAwardedB: bDelta },
    });

    // Check duel-specific badges
    await this.checkDuelBadges(playerAId, playerBId, winnerId, playerATier, playerBTier);

    return { aDelta, bDelta, aResult, bResult };
  }

  // ── Badge checks ──────────────────────────────────────────────────────

  private async checkDuelBadges(
    playerAId: string,
    playerBId: string,
    winnerId: string | null,
    playerATier: number,
    playerBTier: number,
  ) {
    if (!winnerId) return;

    const winner = winnerId === playerAId ? playerAId : playerBId;
    const winnerTier = winner === playerAId ? playerATier : playerBTier;
    const loserTier  = winner === playerAId ? playerBTier : playerATier;

    const [wins] = await Promise.all([
      this.prisma.duel.count({ where: { winnerId: winner, status: 'COMPLETED' } }),
    ]);

    // First duel win
    if (wins === 1) {
      await this.ensureBadge(winner, 'FIRST_DUEL', 'First duel win');
    }

    // 50 duel wins
    if (wins === 50) {
      await this.ensureBadge(winner, 'DUEL_MASTER', '50 duel wins');
    }

    // Beat a rank 10 player
    if (loserTier === 10) {
      await this.ensureBadge(winner, 'ULTIMATE_DUEL', 'Defeated the Ultimate Geek');
    }
  }

  async checkStreakBadges(userId: string, streak: number) {
    if (streak >= 7)   await this.ensureBadge(userId, 'STREAK_7',   '7-day streak');
    if (streak >= 30)  await this.ensureBadge(userId, 'STREAK_30',  '30-day streak');
    if (streak >= 100) await this.ensureBadge(userId, 'STREAK_100', '100-day streak');
  }

  private async ensureBadge(userId: string, type: string, label: string) {
    const existing = await this.prisma.badge.findFirst({
      where: { userId, type: type as any },
    });
    if (!existing) {
      await this.prisma.badge.create({ data: { userId, type: type as any, label } });
    }
  }

  // ── Public helpers ────────────────────────────────────────────────────

  async getUserRankInfo(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { rankPoints: true, rankTier: true, streak: true, weeklyXp: true },
    });

    const current = RANK_TIERS.find(t => t.tier === user.rankTier)!;
    const next    = RANK_TIERS.find(t => t.tier === user.rankTier + 1);
    const progressToNext = next
      ? Math.round(((user.rankPoints - current.minPoints) / (next.minPoints - current.minPoints)) * 100)
      : 100;

    return {
      ...user,
      tierTitle:       current.title,
      tierColor:       current.color,
      nextTierTitle:   next?.title ?? null,
      nextTierPoints:  next?.minPoints ?? null,
      progressToNext,
    };
  }
}
