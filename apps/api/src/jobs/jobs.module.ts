import { Module } from '@nestjs/common';
import { ExecutionQueue } from './execution.queue';
import { RankingModule } from '../ranking/ranking.module';
import { QuestionsModule } from '../questions/questions.module';

@Module({
  imports: [RankingModule, QuestionsModule],
  providers: [ExecutionQueue],
  exports: [ExecutionQueue],
})
export class JobsModule {}
