// apps/api/src/contributions/contributions.service.ts
import {
  Injectable, Logger, NotFoundException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RankingService } from '../ranking/ranking.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CONTRIBUTION_POINTS,
  REVIEWER_REQUIREMENTS,
} from '../ranking/ranking.constants';

const REVIEW_CHECKLIST_KEYS = [
  'stemClear',
  'correctAnswer',
  'distractors',
  'explanation',
  'testCoverage',
  'difficultyAccurate',
];

@Injectable()
export class ContributionsService {
  private readonly logger = new Logger(ContributionsService.name);

  constructor(
    private prisma: PrismaService,
    private ranking: RankingService,
    private notifications: NotificationsService,
  ) {}

  // ── Submit a contribution (called by CI webhook after PR opens) ────────

  async registerContribution(
    authorId: string,
    questionId: string,
    questionSnapshot: any,
    prNumber?: number,
    prUrl?: string,
  ) {
    const existing = await this.prisma.contribution.findUnique({
      where: { questionId },
    });
    if (existing) {
      // PR updated — refresh snapshot
      return this.prisma.contribution.update({
        where: { questionId },
        data: { questionSnapshot, prNumber, prUrl, updatedAt: new Date() },
      });
    }

    return this.prisma.contribution.create({
      data: {
        authorId,
        questionId,
        questionSnapshot,
        prNumber,
        prUrl,
        status: 'DRAFT',
      },
    });
  }

  // ── CI passed — move to review queue ──────────────────────────────────

  async markCiPassed(questionId: string) {
    const contribution = await this.prisma.contribution.findUnique({
      where: { questionId },
    });
    if (!contribution) throw new NotFoundException('Contribution not found');

    await this.prisma.contribution.update({
      where: { questionId },
      data: { ciPassed: true, status: 'NEEDS_REVIEW' },
    });

    // Auto-assign reviewers from pool
    await this.assignReviewers(contribution.id, contribution.questionSnapshot);
  }

  // ── Assign reviewers based on topic ───────────────────────────────────

  private async assignReviewers(contributionId: string, questionSnapshot: any) {
    const topic = questionSnapshot?.topic as string;

    // Find active reviewers who have performed well on this topic
    const reviewers = await this.prisma.user.findMany({
      where: {
        isReviewer: true,
        reviewerStatus: 'ACTIVE',
        rankTier: { gte: REVIEWER_REQUIREMENTS.MIN_TIER },
      },
      orderBy: { rankPoints: 'desc' },
      take: 3,
    });

    if (reviewers.length > 0) {
      await this.prisma.contribution.update({
        where: { id: contributionId },
        data: { status: 'IN_REVIEW' },
      });

      // Notify each assigned reviewer
      for (const reviewer of reviewers) {
        await this.notifications.send(reviewer.id, {
          type: 'review_assigned',
          title: '📋 New question to review',
          body: `A new ${topic} question needs your review. Earn +${CONTRIBUTION_POINTS.REVIEW_SUBMITTED} pts for reviewing.`,
          metadata: { contributionId, topic },
        });
      }
    }
  }

  // ── Submit a review ───────────────────────────────────────────────────

  async submitReview(
    contributionId: string,
    reviewerId: string,
    approved: boolean,
    checklistResults: Record<string, boolean>,
    feedback?: string,
  ) {
    const reviewer = await this.prisma.user.findUniqueOrThrow({
      where: { id: reviewerId },
    });

    if (!reviewer.isReviewer || reviewer.reviewerStatus !== 'ACTIVE') {
      throw new ForbiddenException('You are not an active reviewer');
    }

    if (reviewer.rankTier < REVIEWER_REQUIREMENTS.MIN_TIER) {
      throw new ForbiddenException(
        `Reviewers must be rank ${REVIEWER_REQUIREMENTS.MIN_TIER} or above`,
      );
    }

    // Validate checklist completeness
    const missingKeys = REVIEW_CHECKLIST_KEYS.filter(k => !(k in checklistResults));
    if (missingKeys.length > 0) {
      throw new BadRequestException(`Checklist incomplete: ${missingKeys.join(', ')}`);
    }

    const contribution = await this.prisma.contribution.findUniqueOrThrow({
      where: { id: contributionId },
      include: { reviews: true },
    });

    if (contribution.status === 'MERGED' || contribution.status === 'REJECTED') {
      throw new BadRequestException('Contribution is already finalised');
    }

    // Create review
    const review = await this.prisma.contributionReview.create({
      data: {
        contributionId,
        reviewerId,
        approved,
        checklistResults,
        feedback,
        pointsEarned: CONTRIBUTION_POINTS.REVIEW_SUBMITTED,
      },
    });

    // Award reviewer points immediately
    await this.ranking.awardPoints(
      reviewerId,
      CONTRIBUTION_POINTS.REVIEW_SUBMITTED,
      'review_submitted',
      review.id,
    );

    // Award weekly XP for reviewer activity
    await this.prisma.user.update({
      where: { id: reviewerId },
      data: { weeklyXp: { increment: 15 } },
    });

    // Check if we have enough approvals
    const allReviews = [...contribution.reviews, review];
    const approvals = allReviews.filter(r => r.approved).length;
    const rejections = allReviews.filter(r => !r.approved).length;

    await this.prisma.contribution.update({
      where: { id: contributionId },
      data: { reviewerCount: allReviews.length },
    });

    // Two approvals from rank 6+ OR two general approvals → APPROVED
    const seniorApprovals = await this.countSeniorApprovals(contributionId);

    if (approvals >= 2 || seniorApprovals >= 1) {
      await this.prisma.contribution.update({
        where: { id: contributionId },
        data: { status: 'APPROVED' },
      });

      await this.notifications.send(contribution.authorId, {
        type: 'contribution_approved',
        title: '✅ Your question was approved!',
        body: 'Your question has been approved by the community and is awaiting final merge.',
        metadata: { contributionId },
      });
    } else if (rejections >= 2) {
      await this.prisma.contribution.update({
        where: { id: contributionId },
        data: { status: 'CHANGES_REQUESTED' },
      });

      await this.notifications.send(contribution.authorId, {
        type: 'contribution_changes',
        title: '📝 Changes requested on your question',
        body: 'Reviewers have requested changes. Check the feedback and update your PR.',
        metadata: { contributionId },
      });
    }

    return review;
  }

  // ── Maintainer merges contribution ────────────────────────────────────

  async mergeContribution(contributionId: string, maintainerId: string) {
    const contribution = await this.prisma.contribution.findUniqueOrThrow({
      where: { id: contributionId },
      include: { reviews: true, author: true },
    });

    if (!['APPROVED', 'NEEDS_REVIEW'].includes(contribution.status)) {
      throw new BadRequestException('Contribution must be APPROVED before merging');
    }

    await this.prisma.contribution.update({
      where: { id: contributionId },
      data: { status: 'MERGED', mergedAt: new Date(), pointsAwarded: CONTRIBUTION_POINTS.QUESTION_MERGED },
    });

    // Award author points
    await this.ranking.awardPoints(
      contribution.authorId,
      CONTRIBUTION_POINTS.QUESTION_MERGED,
      'question_merged',
      contributionId,
    );

    // Award reviewers who approved — bonus for leading to a merge
    for (const review of contribution.reviews.filter(r => r.approved)) {
      await this.ranking.awardPoints(
        review.reviewerId,
        CONTRIBUTION_POINTS.REVIEW_LEADS_TO_MERGE,
        'review_merged',
        contributionId,
      );
    }

    // Check authorship badges
    await this.checkAuthorBadges(contribution.authorId);

    // Award author badge
    await this.prisma.badge.create({
      data: {
        userId: contribution.authorId,
        type: 'QUESTION_AUTHOR',
        label: `Question "${contribution.questionId}" merged`,
      },
    });

    // Notify author
    await this.notifications.send(contribution.authorId, {
      type: 'contribution_merged',
      title: '🎉 Your question is now live!',
      body: `"${contribution.questionId}" is now part of the CodeArena question bank. You earned +${CONTRIBUTION_POINTS.QUESTION_MERGED} rank points.`,
      metadata: { contributionId, questionId: contribution.questionId },
    });

    return contribution;
  }

  // ── Shadow review (reviewer candidates) ──────────────────────────────

  async submitShadowReview(
    contributionId: string,
    candidateId: string,
    approved: boolean,
    checklistResults: Record<string, boolean>,
    feedback?: string,
  ) {
    const candidate = await this.prisma.user.findUniqueOrThrow({
      where: { id: candidateId },
    });

    if (candidate.rankTier < REVIEWER_REQUIREMENTS.MIN_TIER) {
      throw new ForbiddenException(
        `Must be rank ${REVIEWER_REQUIREMENTS.MIN_TIER}+ to apply as a reviewer`,
      );
    }

    return this.prisma.shadowReview.create({
      data: { contributionId, candidateId, approved, checklistResults, feedback },
    });
  }

  // ── Verify shadow review (maintainer) ────────────────────────────────

  async verifyShadowReview(
    shadowReviewId: string,
    maintainerVerdict: boolean,
  ) {
    const shadow = await this.prisma.shadowReview.findUniqueOrThrow({
      where: { id: shadowReviewId },
    });

    const accuracyMatch = shadow.approved === maintainerVerdict;

    await this.prisma.shadowReview.update({
      where: { id: shadowReviewId },
      data: { maintainerVerdict, accuracyMatch },
    });

    // Check if candidate has 3 shadow reviews and qualifies
    await this.checkReviewerPromotion(shadow.candidateId);

    return { accuracyMatch };
  }

  // ── Auto-promote reviewer candidates ─────────────────────────────────

  private async checkReviewerPromotion(candidateId: string) {
    const shadows = await this.prisma.shadowReview.findMany({
      where: { candidateId, maintainerVerdict: { not: null } },
    });

    if (shadows.length < REVIEWER_REQUIREMENTS.SHADOW_REVIEWS) return;

    const accurate = shadows.filter(s => s.accuracyMatch).length;
    const accuracy = accurate / shadows.length;

    if (accuracy >= REVIEWER_REQUIREMENTS.ACCURACY_THRESHOLD) {
      await this.prisma.user.update({
        where: { id: candidateId },
        data: {
          isReviewer: true,
          reviewerStatus: 'ACTIVE',
          reviewerSince: new Date(),
        },
      });

      await this.notifications.send(candidateId, {
        type: 'reviewer_approved',
        title: '🎖 You are now a Community Reviewer!',
        body: `Your shadow reviews demonstrated ${Math.round(accuracy * 100)}% accuracy. You can now officially review question contributions and earn bonus rank points.`,
        metadata: { accuracy },
      });

      await this.prisma.badge.create({
        data: {
          userId: candidateId,
          type: 'COMMUNITY_REVIEWER',
          label: 'Earned Community Reviewer status',
        },
      });
    }
  }

  // ── Notify author when their question is used ─────────────────────────

  async notifyQuestionUsed(
    questionId: string,
    context: 'daily_blitz' | 'weekly_comp',
    participantCount: number,
  ) {
    const contribution = await this.prisma.contribution.findUnique({
      where: { questionId },
    });
    if (!contribution) return;

    const bonus = context === 'daily_blitz'
      ? CONTRIBUTION_POINTS.USED_IN_DAILY_BLITZ
      : CONTRIBUTION_POINTS.USED_IN_WEEKLY_COMP;

    await this.ranking.awardPoints(
      contribution.authorId,
      bonus,
      `question_${context}`,
      questionId,
    );

    await this.notifications.send(contribution.authorId, {
      type: 'question_used',
      title: `⚡ Your question appeared in ${context === 'daily_blitz' ? 'Daily Blitz' : 'the Weekly Competition'}!`,
      body: `${participantCount} developers answered your question "${questionId}" today. +${bonus} rank points awarded.`,
      metadata: { questionId, context, participantCount, bonus },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async countSeniorApprovals(contributionId: string): Promise<number> {
    const reviews = await this.prisma.contributionReview.findMany({
      where: { contributionId, approved: true },
      include: { reviewer: { select: { rankTier: true } } },
    });
    return reviews.filter(r => r.reviewer.rankTier >= REVIEWER_REQUIREMENTS.SENIOR_MIN_TIER).length;
  }

  private async checkAuthorBadges(authorId: string) {
    const count = await this.prisma.contribution.count({
      where: { authorId, status: 'MERGED' },
    });
    if (count >= 5)  await this.ensureBadge(authorId, 'CONTENT_CREATOR',      '5 questions merged');
    if (count >= 20) await this.ensureBadge(authorId, 'CURRICULUM_ARCHITECT', '20 questions merged');
  }

  private async ensureBadge(userId: string, type: string, label: string) {
    const exists = await this.prisma.badge.findFirst({ where: { userId, type: type as any } });
    if (!exists) await this.prisma.badge.create({ data: { userId, type: type as any, label } });
  }

  async getContributionStatus(questionId: string) {
    return this.prisma.contribution.findUnique({
      where: { questionId },
      include: {
        reviews: {
          select: { approved: true, feedback: true, checklistResults: true, createdAt: true },
        },
      },
    });
  }

  async getPendingReviews() {
    return this.prisma.contribution.findMany({
      where: { status: { in: ['NEEDS_REVIEW', 'IN_REVIEW'] }, ciPassed: true },
      include: { author: { select: { username: true, rankTier: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
