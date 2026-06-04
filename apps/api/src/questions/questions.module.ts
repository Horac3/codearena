// apps/api/src/questions/questions.module.ts
import { Module } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { QuestionsController } from './questions.controller';
import { UsersModule } from '../users/users.module';
import { RankingModule } from '../ranking/ranking.module';
import { ContributionsModule } from '../contributions/contributions.module';

@Module({
  imports: [UsersModule, RankingModule, ContributionsModule],
  providers: [QuestionsService],
  controllers: [QuestionsController],
  exports: [QuestionsService],
})
export class QuestionsModule {}
