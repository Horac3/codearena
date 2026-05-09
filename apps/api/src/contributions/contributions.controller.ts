import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContributionsService } from './contributions.service';

class ReviewDto {
  @IsBoolean() approved: boolean;
  @IsObject()  checklistResults: Record<string, boolean>;
  @IsOptional() @IsString() feedback?: string;
}

class ShadowReviewDto {
  @IsBoolean() approved: boolean;
  @IsObject()  checklistResults: Record<string, boolean>;
  @IsOptional() @IsString() feedback?: string;
}

@ApiTags('contributions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contributions')
export class ContributionsController {
  constructor(private readonly contributions: ContributionsService) {}

  @Get('pending')
  @ApiOperation({ summary: 'List contributions pending review (reviewers only)' })
  getPending() {
    return this.contributions.getPendingReviews();
  }

  @Get(':questionId/status')
  @ApiOperation({ summary: 'Get contribution status for a question ID' })
  getStatus(@Param('questionId') questionId: string) {
    return this.contributions.getContributionStatus(questionId);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Submit a review for a contribution' })
  review(@Param('id') id: string, @Body() dto: ReviewDto, @Req() req: any) {
    return this.contributions.submitReview(id, req.user.userId, dto.approved, dto.checklistResults, dto.feedback);
  }

  @Post(':id/shadow-review')
  @ApiOperation({ summary: 'Submit a shadow review (reviewer candidate probation)' })
  shadowReview(@Param('id') id: string, @Body() dto: ShadowReviewDto, @Req() req: any) {
    return this.contributions.submitShadowReview(id, req.user.userId, dto.approved, dto.checklistResults, dto.feedback);
  }

  @Patch(':id/merge')
  @ApiOperation({ summary: 'Merge an approved contribution (maintainer only)' })
  merge(@Param('id') id: string, @Req() req: any) {
    return this.contributions.mergeContribution(id, req.user.userId);
  }
}
