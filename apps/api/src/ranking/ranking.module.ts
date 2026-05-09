// apps/api/src/ranking/ranking.module.ts
import { Module } from '@nestjs/common';
import { RankingService } from './ranking.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [RankingService],
  exports: [RankingService],
})
export class RankingModule {}
