// apps/api/src/execution/execution.service.ts
// Checks a coding submission before it is queued. The actual run (harness, Judge0 call,
// result parsing, XP) lives in jobs/execution.queue.ts and jobs/code-harness.ts, so there
// is one implementation of it.

import { Injectable, BadRequestException } from '@nestjs/common';
import { QuestionsService } from '../questions/questions.service';
import { CodingQuestion } from '@codearena/question-schema';
import { hasHarness, solutionName } from '../jobs/code-harness';

@Injectable()
export class ExecutionService {
  constructor(private questions: QuestionsService) {}

  /** Throws a 400 if the question can't be run in this language. */
  assertRunnable(questionId: string, language: string): void {
    const question = this.questions.findById(questionId);
    if (question.type !== 'coding') {
      throw new BadRequestException('Only coding questions can be executed');
    }
    if (!hasHarness(language)) {
      throw new BadRequestException(`${language} submissions are not supported yet`);
    }
    const signature = (question as CodingQuestion).functionSignature[language];
    if (!solutionName(signature)) {
      throw new BadRequestException(`Question "${questionId}" does not support ${language}`);
    }
  }
}
