import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean, IsInt, IsObject, IsOptional, IsString, IsUrl, Matches, MaxLength,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContributionsService } from './contributions.service';
import { CiTokenGuard } from './ci-token.guard';

class ReviewDto {
  @IsBoolean() approved!: boolean;
  @IsObject()  checklistResults!: Record<string, boolean>;
  @IsOptional() @IsString() @MaxLength(2000) feedback?: string;
}

class ShadowReviewDto extends ReviewDto {}

class VerifyShadowDto {
  @IsBoolean() maintainerVerdict!: boolean;
}

class RegisterContributionDto {
  @IsString() @Matches(/^\d+$/) authorGithubId!: string;
  @IsString() @Matches(/^[a-z0-9-]+$/) @MaxLength(100) questionId!: string;
  @IsObject() questionSnapshot!: Record<string, unknown>;
  @IsOptional() @IsInt() prNumber?: number;
  @IsOptional() @IsUrl() prUrl?: string;
}

class CiPassedDto {
  @IsString() @Matches(/^[a-z0-9-]+$/) @MaxLength(100) questionId!: string;
}

@ApiTags('contributions')
@Controller('contributions')
export class ContributionsController {
  constructor(private readonly contributions: ContributionsService) {}

  // ── CI webhooks (question PR workflow) ──────────────────────────────────

  @Post('ci/register')
  @UseGuards(CiTokenGuard)
  @ApiOperation({ summary: 'CI: register or refresh a question contribution from a PR' })
  registerFromCi(@Body() dto: RegisterContributionDto) {
    return this.contributions.registerFromCi(dto);
  }

  @Post('ci/passed')
  @UseGuards(CiTokenGuard)
  @ApiOperation({ summary: 'CI: validation passed — move the contribution into the review queue' })
  ciPassed(@Body() dto: CiPassedDto) {
    return this.contributions.markCiPassed(dto.questionId);
  }

  // ── Signed-in users ─────────────────────────────────────────────────────

  @Get('pending')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List contributions pending review (reviewers only)' })
  getPending(@Req() req: any) {
    return this.contributions.getPendingReviews(req.user.userId);
  }

  @Get(':questionId/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get contribution status for a question ID' })
  getStatus(@Param('questionId') questionId: string, @Req() req: any) {
    return this.contributions.getContributionStatus(questionId, req.user.userId);
  }

  @Post(':id/review')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Submit a review for a contribution' })
  review(@Param('id') id: string, @Body() dto: ReviewDto, @Req() req: any) {
    return this.contributions.submitReview(id, req.user.userId, dto.approved, dto.checklistResults, dto.feedback);
  }

  @Post(':id/shadow-review')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Submit a shadow review (reviewer candidate probation)' })
  shadowReview(@Param('id') id: string, @Body() dto: ShadowReviewDto, @Req() req: any) {
    return this.contributions.submitShadowReview(id, req.user.userId, dto.approved, dto.checklistResults, dto.feedback);
  }

  @Patch('shadow-reviews/:id/verify')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Record the maintainer verdict on a shadow review (maintainer only)' })
  verifyShadow(@Param('id') id: string, @Body() dto: VerifyShadowDto, @Req() req: any) {
    return this.contributions.verifyShadowReview(id, dto.maintainerVerdict, req.user.userId);
  }

  @Patch(':id/merge')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Merge an approved contribution (maintainer only)' })
  merge(@Param('id') id: string, @Req() req: any) {
    return this.contributions.mergeContribution(id, req.user.userId);
  }
}
