-- CreateEnum
CREATE TYPE "DuelStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReviewerStatus" AS ENUM ('SHADOW', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('DRAFT', 'NEEDS_REVIEW', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'MERGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('RANK_UP', 'ULTIMATE_GEEK', 'QUESTION_AUTHOR', 'CONTENT_CREATOR', 'CURRICULUM_ARCHITECT', 'COMMUNITY_REVIEWER', 'FOUNDING_REVIEWER', 'WEEKLY_CHAMPION', 'WEEKLY_PODIUM', 'WEEKLY_TOP_10', 'STREAK_7', 'STREAK_30', 'STREAK_100', 'FIRST_DUEL', 'DUEL_MASTER', 'ULTIMATE_DUEL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "githubId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "email" TEXT,
    "rankPoints" INTEGER NOT NULL DEFAULT 0,
    "rankTier" INTEGER NOT NULL DEFAULT 1,
    "weeklyXp" INTEGER NOT NULL DEFAULT 0,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActiveAt" TIMESTAMP(3),
    "duelsPlayed" INTEGER NOT NULL DEFAULT 0,
    "duelsWon" INTEGER NOT NULL DEFAULT 0,
    "duelsAtTier" INTEGER NOT NULL DEFAULT 0,
    "isReviewer" BOOLEAN NOT NULL DEFAULT false,
    "reviewerStatus" "ReviewerStatus",
    "reviewerSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceId" TEXT,
    "rankBefore" INTEGER NOT NULL,
    "rankAfter" INTEGER NOT NULL,
    "tierBefore" INTEGER NOT NULL,
    "tierAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "BadgeType" NOT NULL,
    "label" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySet" (
    "date" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "questionIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySet_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "DailySubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "pointsEarned" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Duel" (
    "id" TEXT NOT NULL,
    "playerAId" TEXT NOT NULL,
    "playerBId" TEXT,
    "playerARankTier" INTEGER NOT NULL DEFAULT 1,
    "playerBRankTier" INTEGER,
    "topic" TEXT NOT NULL,
    "rounds" INTEGER NOT NULL DEFAULT 7,
    "status" "DuelStatus" NOT NULL DEFAULT 'PENDING',
    "scoreA" INTEGER NOT NULL DEFAULT 0,
    "scoreB" INTEGER NOT NULL DEFAULT 0,
    "pointsAwardedA" INTEGER,
    "pointsAwardedB" INTEGER,
    "winnerId" TEXT,
    "inviteToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Duel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCompetition" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "theme" TEXT NOT NULL,
    "themeLabel" TEXT NOT NULL,
    "questionIds" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyCompetition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklySubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "pointsEarned" INTEGER NOT NULL,
    "finalRank" INTEGER,
    "answers" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contribution" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "prNumber" INTEGER,
    "prUrl" TEXT,
    "status" "ContributionStatus" NOT NULL DEFAULT 'DRAFT',
    "questionSnapshot" JSONB NOT NULL,
    "ciPassed" BOOLEAN NOT NULL DEFAULT false,
    "reviewerCount" INTEGER NOT NULL DEFAULT 0,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "mergedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionReview" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "checklistResults" JSONB NOT NULL,
    "feedback" TEXT,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowReview" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "checklistResults" JSONB NOT NULL,
    "feedback" TEXT,
    "maintainerVerdict" BOOLEAN,
    "accuracyMatch" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "bullJobId" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ExecutionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_rankPoints_idx" ON "User"("rankPoints");

-- CreateIndex
CREATE INDEX "User_weeklyXp_idx" ON "User"("weeklyXp");

-- CreateIndex
CREATE INDEX "User_rankTier_idx" ON "User"("rankTier");

-- CreateIndex
CREATE INDEX "RankEvent_userId_idx" ON "RankEvent"("userId");

-- CreateIndex
CREATE INDEX "RankEvent_createdAt_idx" ON "RankEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Badge_userId_idx" ON "Badge"("userId");

-- CreateIndex
CREATE INDEX "DailySubmission_date_idx" ON "DailySubmission"("date");

-- CreateIndex
CREATE INDEX "DailySubmission_userId_idx" ON "DailySubmission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailySubmission_userId_date_key" ON "DailySubmission"("userId", "date");

-- CreateIndex
CREATE INDEX "Answer_userId_idx" ON "Answer"("userId");

-- CreateIndex
CREATE INDEX "Answer_questionId_idx" ON "Answer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Duel_inviteToken_key" ON "Duel"("inviteToken");

-- CreateIndex
CREATE INDEX "Duel_playerAId_idx" ON "Duel"("playerAId");

-- CreateIndex
CREATE INDEX "Duel_playerBId_idx" ON "Duel"("playerBId");

-- CreateIndex
CREATE INDEX "Duel_inviteToken_idx" ON "Duel"("inviteToken");

-- CreateIndex
CREATE INDEX "WeeklyCompetition_weekStart_idx" ON "WeeklyCompetition"("weekStart");

-- CreateIndex
CREATE INDEX "WeeklyCompetition_isActive_idx" ON "WeeklyCompetition"("isActive");

-- CreateIndex
CREATE INDEX "WeeklySubmission_competitionId_score_idx" ON "WeeklySubmission"("competitionId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySubmission_userId_competitionId_key" ON "WeeklySubmission"("userId", "competitionId");

-- CreateIndex
CREATE UNIQUE INDEX "Contribution_questionId_key" ON "Contribution"("questionId");

-- CreateIndex
CREATE INDEX "Contribution_authorId_idx" ON "Contribution"("authorId");

-- CreateIndex
CREATE INDEX "Contribution_status_idx" ON "Contribution"("status");

-- CreateIndex
CREATE INDEX "ContributionReview_reviewerId_idx" ON "ContributionReview"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionReview_contributionId_reviewerId_key" ON "ContributionReview"("contributionId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "ShadowReview_contributionId_candidateId_key" ON "ShadowReview"("contributionId", "candidateId");

-- CreateIndex
CREATE INDEX "ExecutionJob_userId_idx" ON "ExecutionJob"("userId");

-- CreateIndex
CREATE INDEX "ExecutionJob_status_idx" ON "ExecutionJob"("status");

-- CreateIndex
CREATE INDEX "ExecutionJob_bullJobId_idx" ON "ExecutionJob"("bullJobId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- AddForeignKey
ALTER TABLE "RankEvent" ADD CONSTRAINT "RankEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge" ADD CONSTRAINT "Badge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySubmission" ADD CONSTRAINT "DailySubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_playerAId_fkey" FOREIGN KEY ("playerAId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_playerBId_fkey" FOREIGN KEY ("playerBId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySubmission" ADD CONSTRAINT "WeeklySubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySubmission" ADD CONSTRAINT "WeeklySubmission_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "WeeklyCompetition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionReview" ADD CONSTRAINT "ContributionReview_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "Contribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionReview" ADD CONSTRAINT "ContributionReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowReview" ADD CONSTRAINT "ShadowReview_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "Contribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShadowReview" ADD CONSTRAINT "ShadowReview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
