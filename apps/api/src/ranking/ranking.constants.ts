// apps/api/src/ranking/ranking.constants.ts
// Single source of truth for all ranking values.
// Every number that affects rank progression lives here.

// ─── Tier definitions ─────────────────────────────────────────────────────

export interface RankTier {
  tier: number;
  title: string;
  minPoints: number;
  color: string; // hex, used in extension UI
}

export const RANK_TIERS: RankTier[] = [
  { tier: 1,  title: 'Script Kiddie',          minPoints: 0,      color: '9CA3AF' },
  { tier: 2,  title: 'Code Monkey',            minPoints: 300,    color: '34D399' },
  { tier: 3,  title: 'Bug Hunter',             minPoints: 900,    color: '60A5FA' },
  { tier: 4,  title: 'Stack Overflow Refugee', minPoints: 2000,   color: 'A78BFA' },
  { tier: 5,  title: 'Algorithm Apprentice',   minPoints: 4500,   color: 'F59E0B' },
  { tier: 6,  title: 'Architecture Architect', minPoints: 8500,   color: 'F97316' },
  { tier: 7,  title: 'System Sage',            minPoints: 14000,  color: 'EF4444' },
  { tier: 8,  title: 'Kernel Wizard',          minPoints: 22000,  color: 'EC4899' },
  { tier: 9,  title: 'Distributed Deity',      minPoints: 32000,  color: 'E11D48' },
  { tier: 10, title: 'Ultimate Geek',          minPoints: 45000,  color: 'FFD700' },
];

// ─── Daily Blitz points ───────────────────────────────────────────────────

export const DAILY_POINTS = {
  CORRECT_ANSWER:     50,
  SPEED_BONUS_MAX:    30,   // at 0ms, decays linearly to 0 at 60s
  PERFECT_SCORE:      100,  // bonus for 5/5
  COMPLETION_BONUS:   25,   // just for showing up
  STREAK_MULTIPLIER:  0.10, // +10% per streak day
  STREAK_CAP:         2.0,  // max 2× multiplier (10-day streak)
} as const;

// ─── Duel points ─────────────────────────────────────────────────────────

export const DUEL_POINTS = {
  WIN_VS_HIGHER:      80,
  WIN_VS_HIGHER_STEP: 20,   // +20 per rank tier difference, capped
  WIN_VS_HIGHER_CAP:  140,  // max win points
  WIN_VS_SAME:        50,
  WIN_VS_LOWER:       25,
  DRAW:               20,
  LOSS_VS_HIGHER:     -5,
  LOSS_VS_SAME:       -15,
  LOSS_VS_LOWER:      -30,
  FLOOR_PROTECTION_DUELS: 10, // duels at tier before floor can be breached
} as const;

// ─── Weekly leaderboard bonuses ───────────────────────────────────────────

export const WEEKLY_LEADERBOARD_POINTS = {
  RANK_1:   500,
  RANK_2:   300,
  RANK_3:   150,
  TOP_10:   50,
} as const;

// ─── Weekly competition points ────────────────────────────────────────────

export const WEEKLY_COMP_POINTS = {
  RANK_1:        1000,
  RANK_2:        600,
  RANK_3:        400,
  TOP_10:        200,
  TOP_25:        100,
  PARTICIPATION: 50,
} as const;

// ─── Contribution & review points ─────────────────────────────────────────

export const CONTRIBUTION_POINTS = {
  QUESTION_MERGED:          200,
  USED_IN_DAILY_BLITZ:      100,  // bonus when question appears in blitz
  USED_IN_WEEKLY_COMP:      300,  // bonus when question appears in weekly comp
  REVIEW_SUBMITTED:         10,
  REVIEW_LEADS_TO_MERGE:    50,
  ACCURACY_BONUS_WEEKLY:    25,   // for reviewers with >90% accuracy
} as const;

// ─── Reviewer thresholds ──────────────────────────────────────────────────

export const REVIEWER_REQUIREMENTS = {
  MIN_TIER:             5,   // Algorithm Apprentice minimum
  SHADOW_REVIEWS:       3,   // must complete 3 shadow reviews to qualify
  SENIOR_MIN_TIER:      8,   // Kernel Wizard for senior reviewer (no maintainer needed)
  ACCURACY_THRESHOLD:   0.9, // 90% accuracy for bonus
  FOUNDING_BYPASS_TIER: 3,   // founding reviewers only need rank 3 (first 3 months)
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────

export function getTierForPoints(points: number): RankTier {
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) {
    if (points >= t.minPoints) tier = t;
  }
  return tier;
}

export function getNextTier(currentTier: number): RankTier | null {
  return RANK_TIERS.find(t => t.tier === currentTier + 1) ?? null;
}

export function calculateSpeedBonus(elapsedMs: number): number {
  if (elapsedMs >= 60_000) return 0;
  return Math.round(DAILY_POINTS.SPEED_BONUS_MAX * (1 - elapsedMs / 60_000));
}

export function calculateStreakMultiplier(streak: number): number {
  return Math.min(
    DAILY_POINTS.STREAK_CAP,
    1 + streak * DAILY_POINTS.STREAK_MULTIPLIER,
  );
}

export function calculateDuelPoints(
  outcome: 'win' | 'loss' | 'draw',
  myTier: number,
  opponentTier: number,
): number {
  if (outcome === 'draw') return DUEL_POINTS.DRAW;

  const diff = opponentTier - myTier;

  if (outcome === 'win') {
    if (diff > 0) {
      // Beat a higher-ranked player
      const bonus = diff * DUEL_POINTS.WIN_VS_HIGHER_STEP;
      return Math.min(
        DUEL_POINTS.WIN_VS_HIGHER_CAP,
        DUEL_POINTS.WIN_VS_HIGHER + bonus,
      );
    }
    if (diff === 0) return DUEL_POINTS.WIN_VS_SAME;
    return DUEL_POINTS.WIN_VS_LOWER;
  }

  // Loss
  if (diff > 0) return DUEL_POINTS.LOSS_VS_HIGHER; // lost to higher = barely hurts
  if (diff === 0) return DUEL_POINTS.LOSS_VS_SAME;
  return DUEL_POINTS.LOSS_VS_LOWER; // lost to lower = stings
}
