// apps/api/src/duel/duel.module.ts
import { Module } from '@nestjs/common';
import { DuelService } from './duel.service';
import { DuelGateway } from './duel.gateway';
import { DuelController } from './duel.controller';
import { QuestionsModule } from '../questions/questions.module';
import { RankingModule } from '../ranking/ranking.module';

@Module({
  imports: [QuestionsModule, RankingModule],
  providers: [DuelService, DuelGateway],
  controllers: [DuelController],
})
export class DuelModule {}
