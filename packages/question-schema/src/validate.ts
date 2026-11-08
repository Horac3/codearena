// packages/question-schema/src/validate.ts
// Question validation shared by the CI validator (validate-cli.ts) and the API loader.

import fs from 'fs';
import path from 'path';

const VALID_TYPES = ['mcq', 'trace', 'bug-hunt', 'coding'];
const VALID_TOPICS = ['dsa', 'systems', 'cs-fundamentals', 'networking'];
const VALID_DIFFICULTIES = [1, 2, 3];
const VALID_LANGUAGES = ['javascript', 'typescript', 'python', 'go'];

/**
 * Validate one question object. Returns a list of human-readable errors (empty = valid).
 * When `file` is given, coding questions also have their test file checked on disk
 * (relative to the JSON file's folder, in `tests/`).
 */
export function validateQuestion(q: unknown, file?: string): string[] {
  const errors: string[] = [];
  if (!q || typeof q !== 'object' || Array.isArray(q)) {
    return ['Question must be a JSON object'];
  }
  const question = q as Record<string, unknown>;

  if (!question.id || typeof question.id !== 'string') {
    errors.push('Missing or invalid "id"');
  } else if (!/^[a-z0-9-]+$/.test(question.id as string)) {
    errors.push('"id" must be kebab-case alphanumeric');
  }

  if (!VALID_TYPES.includes(question.type as string)) {
    errors.push(`"type" must be one of: ${VALID_TYPES.join(', ')}`);
  }

  if (!VALID_TOPICS.includes(question.topic as string)) {
    errors.push(`"topic" must be one of: ${VALID_TOPICS.join(', ')}`);
  }

  if (!VALID_DIFFICULTIES.includes(question.difficulty as number)) {
    errors.push('"difficulty" must be 1, 2, or 3');
  }

  if (!question.stem || typeof question.stem !== 'string' || (question.stem as string).length < 10) {
    errors.push('"stem" is required and must be at least 10 characters');
  }

  if (!question.explanation || typeof question.explanation !== 'string' || (question.explanation as string).length < 10) {
    errors.push('"explanation" is required and must be at least 10 characters');
  }

  if (!Array.isArray(question.tags) || question.tags.length === 0) {
    errors.push('"tags" must be a non-empty array');
  }

  if (!question.author || typeof question.author !== 'string') {
    errors.push('"author" is required');
  }

  if (question.code && !VALID_LANGUAGES.includes(question.language as string)) {
    errors.push('If "code" is present, "language" must be one of: ' + VALID_LANGUAGES.join(', '));
  }

  // Type-specific validation
  if (['mcq', 'trace', 'bug-hunt'].includes(question.type as string)) {
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      errors.push('"options" must be an array of exactly 4 strings');
    }
    if (![0, 1, 2, 3].includes(question.answer as number)) {
      errors.push('"answer" must be 0, 1, 2, or 3');
    }
  }

  if (question.type === 'trace' || question.type === 'bug-hunt') {
    if (!question.code) errors.push('"code" is required for trace and bug-hunt questions');
    if (!question.language) errors.push('"language" is required for trace and bug-hunt questions');
  }

  if (question.type === 'coding') {
    if (!question.functionSignature || typeof question.functionSignature !== 'object') {
      errors.push('"functionSignature" is required for coding questions');
    }
    if (!Array.isArray(question.examples) || question.examples.length === 0) {
      errors.push('"examples" must be a non-empty array for coding questions');
    }
    if (!question.testFile || typeof question.testFile !== 'string') {
      errors.push('"testFile" is required for coding questions');
    }
    if (file && typeof question.testFile === 'string') {
      const testFilePath = path.join(path.dirname(file), 'tests', question.testFile);
      if (!fs.existsSync(testFilePath)) {
        errors.push(`Test file not found: ${testFilePath}`);
      }
    }
  }

  return errors;
}

/**
 * A question file holds either one question object or an array of them.
 * Always returns an array so callers never treat an array file as one question.
 */
export function questionsFromFile(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [raw];
}
