// apps/api/src/duel/duel.module.ts
import { Module } from '@nestjs/common';
import { DuelService } from './duel.service';
import { DuelGateway } from './duel.gateway';
import { DuelController } from './duel.controller';
import { QuestionsModule } from '../questions/questions.module';

@Module({
  imports: [QuestionsModule],
  providers: [DuelService, DuelGateway],
  controllers: [DuelController],
})
export class DuelModule {}
