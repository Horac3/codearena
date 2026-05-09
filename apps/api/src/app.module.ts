// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { QuestionsModule } from './questions/questions.module';
import { RankingModule } from './ranking/ranking.module';
import { DuelModule } from './duel/duel.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { WeeklyModule } from './weekly/weekly.module';
import { ContributionsModule } from './contributions/contributions.module';
import { ExecutionModule } from './execution/execution.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Infrastructure (global)
    PrismaModule,
    RedisModule,
    NotificationsModule,
    // Domain modules
    AuthModule,
    UsersModule,
    QuestionsModule,
    RankingModule,
    DuelModule,
    LeaderboardModule,
    WeeklyModule,
    ContributionsModule,
    ExecutionModule,
    JobsModule,
  ],
})
export class AppModule {}
