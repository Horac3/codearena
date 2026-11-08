// apps/api/src/ranking/ranking.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { BadgeType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  getTierForPoints,
  calculateDuelPoints,
  DUEL_POINTS,
  RANK_TIERS,
  RankTier,
} from './ranking.constants';

type Db = Prisma.TransactionClient;

export interface AwardResult {
  pointsBefore: number;
  pointsAfter: number;
  tierBefore: number;
  tierAfter: number;
  rankedUp: boolean;
  newTier?: RankTier;
  /** True when this award (same user, reason and source) was already granted, so nothing changed. */
  duplicate: boolean;
}

export interface AwardOptions {
  /** Run inside the caller's transaction. Without it, the award runs in its own transaction. */
  tx?: Db;
  /** Activity XP to add to weeklyXp and totalXp alongside the rank points (default 0). */
  xp?: number;
}

const XP_PER_LEVEL = 1000;
const TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 };

@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ── Core award method — all rank point grants flow through here ────────
  //
  // Atomic: the user row is locked for the read-modify-write, so concurrent awards
  // (a daily submit and a duel ending together) can't overwrite each other.
  // Idempotent: an award with a sourceId is granted at most once per (user, reason, sourceId),
  // so a retried job or a re-run cron never pays out twice.

  async awardPoints(
    userId: string,
    delta: number,
    reason: string,
    sourceId?: string,
    opts: AwardOptions = {},
  ): Promise<AwardResult> {
    if (opts.tx) return this.awardIn(opts.tx, userId, delta, reason, sourceId, opts.xp ?? 0);
    return this.prisma.$transaction(
      (tx) => this.awardIn(tx, userId, delta, reason, sourceId, opts.xp ?? 0),
      TX_OPTIONS,
    );
  }

  private async awardIn(
    db: Db,
    userId: string,
    delta: number,
    reason: string,
    sourceId: string | undefined,
    xp: number,
  ): Promise<AwardResult> {
    await this.lockUsers(db, [userId]);

    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { rankPoints: true, rankTier: true, duelsAtTier: true, totalXp: true },
    });

    const pointsBefore = user.rankPoints;
    const tierBefore   = user.rankTier;

    if (sourceId) {
      const already = await db.rankEvent.findFirst({
        where: { userId, reason, sourceId },
        select: { id: true },
      });
      if (already) {
        return {
          pointsBefore, pointsAfter: pointsBefore, tierBefore, tierAfter: tierBefore,
          rankedUp: false, duplicate: true,
        };
      }
    }

    // Floor protection — never go below tier floor if < 10 duels at current tier
    let effectiveDelta = delta;
    if (delta < 0) {
      const tierFloor = RANK_TIERS.find(t => t.tier === user.rankTier)?.minPoints ?? 0;
      const projectedPoints = pointsBefore + delta;
      if (projectedPoints < tierFloor && user.duelsAtTier < DUEL_POINTS.FLOOR_PROTECTION_DUELS) {
        effectiveDelta = Math.min(0, tierFloor - pointsBefore);
        this.logger.debug(
          `Floor protection applied for ${userId}: clamped delta from ${delta} to ${effectiveDelta}`,
        );
      }
    }

    const pointsAfter = Math.max(0, pointsBefore + effectiveDelta);
    const newTierData = getTierForPoints(pointsAfter);
    const tierAfter   = newTierData.tier;
    const rankedUp    = tierAfter > tierBefore;
    const safeXp      = Math.max(0, Math.round(xp));

    await db.user.update({
      where: { id: userId },
      data: {
        rankPoints: pointsAfter,
        rankTier: tierAfter,
        // Reset duelsAtTier when tier changes
        ...(tierAfter !== tierBefore ? { duelsAtTier: 0 } : {}),
        ...(safeXp > 0
          ? {
              weeklyXp: { increment: safeXp },
              totalXp: { increment: safeXp },
              level: Math.floor((user.totalXp + safeXp) / XP_PER_LEVEL) + 1,
            }
          : {}),
      },
    });

    // Audit event — doubles as the idempotency key via @@unique([userId, reason, sourceId])
    await db.rankEvent.create({
      data: {
        userId,
        delta: pointsAfter - pointsBefore,
        reason,
        sourceId,
        rankBefore: pointsBefore,
        rankAfter: pointsAfter,
        tierBefore,
        tierAfter,
      },
    });

    if (rankedUp) {
      await this.notifications.send(userId, {
        type:  'rank_up',
        title: `⚡ Rank up! You are now ${newTierData.title}`,
        body:  `You've reached rank tier ${tierAfter}. Keep going — ${
          RANK_TIERS.find(t => t.tier === tierAfter + 1)?.title ?? 'the top'
        } awaits.`,
        metadata: { tierBefore, tierAfter, title: newTierData.title },
      }, db);

      // One rank-up badge per tier reached
      const badgeType: BadgeType = tierAfter === 10 ? 'ULTIMATE_GEEK' : 'RANK_UP';
      await this.ensureBadge(userId, badgeType, `Reached ${newTierData.title}`, `tier:${tierAfter}`, db);

      if (tierAfter === 10) {
        this.logger.log(`🏆 ${userId} reached ULTIMATE GEEK`);
      }
    }

    return {
      pointsBefore, pointsAfter, tierBefore, tierAfter, rankedUp,
      newTier: rankedUp ? newTierData : undefined, duplicate: false,
    };
  }

  /** Lock user rows (in a stable order, so two transactions can't deadlock each other). */
  private async lockUsers(db: Db, userIds: string[]) {
    const ids = [...new Set(userIds)].sort();
    for (const id of ids) {
      // NO KEY UPDATE: blocks other awards, but not inserts of rows that reference the user.
      await db.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${id} FOR NO KEY UPDATE`;
    }
  }

  // ── Duel-specific award (handles both players, floor protection, tier snapshot) ──
  // Call with the transaction that marks the duel COMPLETED, so the duel row and the awards
  // commit together and the win count below includes this duel.

  async awardDuelPoints(
    duelId: string,
    winnerId: string | null,
    playerAId: string,
    playerBId: string,
    playerATier: number,
    playerBTier: number,
    tx: Db,
  ) {
    const isDraw = winnerId === null;

    const aOutcome = isDraw ? 'draw' : winnerId === playerAId ? 'win' : 'loss';
    const bOutcome = isDraw ? 'draw' : winnerId === playerBId ? 'win' : 'loss';

    const aDelta = calculateDuelPoints(aOutcome, playerATier, playerBTier);
    const bDelta = calculateDuelPoints(bOutcome, playerBTier, playerATier);

    await this.lockUsers(tx, [playerAId, playerBId]);

    const aResult = await this.awardPoints(playerAId, aDelta, 'duel_' + aOutcome, duelId, { tx, xp: Math.max(aDelta, 0) });
    const bResult = await this.awardPoints(playerBId, bDelta, 'duel_' + bOutcome, duelId, { tx, xp: Math.max(bDelta, 0) });

    // Track duels at tier for floor protection
    for (const [id, outcome] of [[playerAId, aOutcome], [playerBId, bOutcome]] as const) {
      await tx.user.update({
        where: { id },
        data: {
          duelsAtTier: { increment: 1 },
          duelsPlayed: { increment: 1 },
          ...(outcome === 'win' ? { duelsWon: { increment: 1 } } : {}),
        },
      });
    }

    // Persist the points actually applied (after floor protection) back to the duel record
    await tx.duel.update({
      where: { id: duelId },
      data: {
        pointsAwardedA: aResult.pointsAfter - aResult.pointsBefore,
        pointsAwardedB: bResult.pointsAfter - bResult.pointsBefore,
      },
    });

    await this.checkDuelBadges(tx, playerAId, playerBId, winnerId, playerATier, playerBTier);

    return { aDelta, bDelta, aResult, bResult };
  }

  // ── Badge checks ──────────────────────────────────────────────────────

  private async checkDuelBadges(
    db: Db,
    playerAId: string,
    playerBId: string,
    winnerId: string | null,
    playerATier: number,
    playerBTier: number,
  ) {
    if (!winnerId) return;

    const winner = winnerId === playerAId ? playerAId : playerBId;
    const loserTier = winner === playerAId ? playerBTier : playerATier;

    // The current duel is already COMPLETED in this transaction, so it is counted.
    const wins = await db.duel.count({ where: { winnerId: winner, status: 'COMPLETED' } });

    if (wins >= 1)  await this.ensureBadge(winner, 'FIRST_DUEL', 'First duel win', '', db);
    if (wins >= 50) await this.ensureBadge(winner, 'DUEL_MASTER', '50 duel wins', '', db);
    if (loserTier === 10) {
      await this.ensureBadge(winner, 'ULTIMATE_DUEL', 'Defeated the Ultimate Geek', '', db);
    }
  }

  async checkStreakBadges(userId: string, streak: number, db: Db = this.prisma) {
    if (streak >= 7)   await this.ensureBadge(userId, 'STREAK_7',   '7-day streak', '', db);
    if (streak >= 30)  await this.ensureBadge(userId, 'STREAK_30',  '30-day streak', '', db);
    if (streak >= 100) await this.ensureBadge(userId, 'STREAK_100', '100-day streak', '', db);
  }

  /**
   * Award a badge once per (user, type, scope). Use a scope for badges that can be earned
   * repeatedly (a week for weekly placements, a tier for rank-ups); leave it empty for once-ever badges.
   * Returns true when the badge was newly awarded.
   */
  async ensureBadge(
    userId: string,
    type: BadgeType,
    label: string,
    scope = '',
    db: Db = this.prisma,
  ): Promise<boolean> {
    const { count } = await db.badge.createMany({
      data: [{ userId, type, label, scope }],
      skipDuplicates: true,
    });
    return count > 0;
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
