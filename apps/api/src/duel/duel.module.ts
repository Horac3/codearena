// apps/api/src/duel/duel.module.ts
import { Module } from '@nestjs/common';
import { DuelService } from './duel.service';
import { DuelGateway } from './duel.gateway';
import { DuelController } from './duel.controller';
import { QuestionsModule } from '../questions/questions.module';
import { RankingModule } from '../ranking/ranking.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [QuestionsModule, RankingModule, AuthModule],
  providers: [DuelService, DuelGateway],
  controllers: [DuelController],
})
export class DuelModule {}
