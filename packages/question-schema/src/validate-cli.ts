// packages/question-schema/src/validate-cli.ts
// Run: npx ts-node src/validate-cli.ts ../../questions
// Used in CI to validate all question files before merging PRs

import fs from 'fs';
import path from 'path';
import { Question } from './index';

const VALID_TYPES = ['mcq', 'trace', 'bug-hunt', 'coding'];
const VALID_TOPICS = ['dsa', 'systems', 'cs-fundamentals', 'networking'];
const VALID_DIFFICULTIES = [1, 2, 3];
const VALID_LANGUAGES = ['javascript', 'typescript', 'python', 'go'];

interface ValidationError {
  file: string;
  errors: string[];
}

function validateQuestion(q: unknown, file: string): string[] {
  const errors: string[] = [];
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
    const testFilePath = path.join(
      path.dirname(file),
      'tests',
      question.testFile as string,
    );
    if (!fs.existsSync(testFilePath)) {
      errors.push(`Test file not found: ${testFilePath}`);
    }
  }

  return errors;
}

function collectJsonFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.includes('test')) {
      files.push(full);
    }
  }
  return files;
}

function run() {
  const questionsDir = process.argv[2] || path.join(__dirname, '../../../questions');
  const files = collectJsonFiles(questionsDir);

  if (files.length === 0) {
    console.log('No question files found in', questionsDir);
    process.exit(0);
  }

  const allErrors: ValidationError[] = [];
  const seenIds = new Set<string>();

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const errors = validateQuestion(raw, file);

      // Check for duplicate IDs
      if (raw.id && seenIds.has(raw.id)) {
        errors.push(`Duplicate ID "${raw.id}" — already used in another file`);
      } else if (raw.id) {
        seenIds.add(raw.id);
      }

      if (errors.length > 0) {
        allErrors.push({ file: path.relative(process.cwd(), file), errors });
      }
    } catch (e) {
      allErrors.push({ file, errors: [`Invalid JSON: ${(e as Error).message}`] });
    }
  }

  if (allErrors.length > 0) {
    console.error(`\n❌ Validation failed — ${allErrors.length} file(s) have errors:\n`);
    for (const { file, errors } of allErrors) {
      console.error(`  ${file}`);
      for (const err of errors) {
        console.error(`    • ${err}`);
      }
    }
    process.exit(1);
  } else {
    console.log(`✅ All ${files.length} question file(s) are valid.`);
    process.exit(0);
  }
}

run();
