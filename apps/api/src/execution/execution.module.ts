// apps/api/src/execution/execution.module.ts
import { Module } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';
import { QuestionsModule } from '../questions/questions.module';

@Module({
  imports: [QuestionsModule],
  providers: [ExecutionService],
  controllers: [ExecutionController],
})
export class ExecutionModule {}
