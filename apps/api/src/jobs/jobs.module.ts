import { Module } from '@nestjs/common';
import { ExecutionQueue } from './execution.queue';
import { RankingModule } from '../ranking/ranking.module';

@Module({
  imports: [RankingModule],
  providers: [ExecutionQueue],
  exports: [ExecutionQueue],
})
export class JobsModule {}
