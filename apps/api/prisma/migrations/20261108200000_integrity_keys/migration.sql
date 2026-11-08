-- Integrity keys for points and badges (see RankingService.awardPoints / ensureBadge).
--
-- Existing data can already hold repeats (coding XP was re-awarded on every resubmission,
-- and weekly leaderboard bonuses reused "week_<rank>" as their source). Keep the earliest
-- event as the idempotency key and re-key the later ones so the unique index can be built.
-- No points are changed; the audit trail stays intact.
UPDATE "RankEvent" r
SET "sourceId" = r."sourceId" || ':legacy:' || r."id"
WHERE r."sourceId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "RankEvent" o
    WHERE o."userId" = r."userId"
      AND o."reason" = r."reason"
      AND o."sourceId" = r."sourceId"
      AND (o."createdAt", o."id") < (r."createdAt", r."id")
  );

-- DropIndex
DROP INDEX "User_username_key";

-- AlterTable
ALTER TABLE "Badge" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "WeeklyCompetition" ADD COLUMN     "closedAt" TIMESTAMP(3);

-- Badges were deduplicated by (userId, type) in application code; drop any race-created repeats.
DELETE FROM "Badge" b
WHERE EXISTS (
  SELECT 1 FROM "Badge" o
  WHERE o."userId" = b."userId" AND o."type" = b."type"
    AND (o."awardedAt", o."id") < (b."awardedAt", b."id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Badge_userId_type_scope_key" ON "Badge"("userId", "type", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "RankEvent_userId_reason_sourceId_key" ON "RankEvent"("userId", "reason", "sourceId");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

