// packages/question-schema/src/validate-cli.ts
// Run: npx ts-node src/validate-cli.ts ../../questions
// Used in CI to validate all question files before merging PRs

import fs from 'fs';
import path from 'path';
import { questionsFromFile, validateQuestion } from './validate';

interface ValidationError {
  file: string;
  errors: string[];
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
      const errors: string[] = [];
      questionsFromFile(raw).forEach((q, i) => {
        const where = Array.isArray(raw) ? `[${i}] ` : '';
        const id = (q as { id?: unknown } | null)?.id;
        for (const err of validateQuestion(q, file)) errors.push(`${where}${err}`);

        // Check for duplicate IDs
        if (typeof id === 'string' && seenIds.has(id)) {
          errors.push(`${where}Duplicate ID "${id}" — already used in another question`);
        } else if (typeof id === 'string') {
          seenIds.add(id);
        }
      });

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
    console.log(`✅ All ${seenIds.size} question(s) in ${files.length} file(s) are valid.`);
    process.exit(0);
  }
}

run();
