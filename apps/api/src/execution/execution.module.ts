// apps/api/src/execution/execution.module.ts
import { Module } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';
import { QuestionsModule } from '../questions/questions.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [QuestionsModule, JobsModule],
  providers: [ExecutionService],
  controllers: [ExecutionController],
  exports: [ExecutionService],
})
export class ExecutionModule {}
