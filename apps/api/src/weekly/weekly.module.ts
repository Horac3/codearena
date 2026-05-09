// apps/api/src/weekly/weekly.module.ts
import { Module } from '@nestjs/common';
import { WeeklyService } from './weekly.service';
import { WeeklyController } from './weekly.controller';
import { QuestionsModule } from '../questions/questions.module';
import { RankingModule } from '../ranking/ranking.module';

@Module({
  imports: [QuestionsModule, RankingModule],
  providers: [WeeklyService],
  controllers: [WeeklyController],
  exports: [WeeklyService],
})
export class WeeklyModule {}
