// apps/api/src/execution/execution.service.ts
// v2: Judge0 integration for running coding challenge submissions
// Judge0 runs as a separate Docker Compose stack on the same VPS

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QuestionsService } from '../questions/questions.service';
import { CodingQuestion, ExecutionResult, TestResult, XP } from '@codearena/question-schema';
import * as fs from 'fs';
import * as path from 'path';

const SUPPORTED_LANGUAGES: Record<string, { judge0Id: number }> = {
  javascript: { judge0Id: 93 },  // Node.js 18
  typescript: { judge0Id: 94 },  // TypeScript
  python:     { judge0Id: 71 },  // Python 3
  go:         { judge0Id: 95 },  // Go
};

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    private config: ConfigService,
    private questions: QuestionsService,
  ) {}

  async execute(
    questionId: string,
    language: string,
    code: string,
    userId: string,
  ): Promise<ExecutionResult> {
    const question = this.questions.findById(questionId);

    if (question.type !== 'coding') {
      throw new BadRequestException('Only coding questions can be executed');
    }

    const codingQ = question as CodingQuestion;

    if (!SUPPORTED_LANGUAGES[language]) {
      throw new BadRequestException(
        `Language "${language}" not supported. Supported: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`,
      );
    }

    if (!codingQ.functionSignature[language as keyof typeof codingQ.functionSignature]) {
      throw new BadRequestException(
        `Question "${questionId}" does not support ${language}`,
      );
    }

    // Load the test file for this question
    const testSource = this.loadTestFile(codingQ.testFile, language);

    // Build the combined source: user code + test harness
    const fullSource = this.buildRunnable(code, testSource, language);

    const start = Date.now();
    const judge0Result = await this.callJudge0(language, fullSource, codingQ.timeLimit ?? 5000);
    const executionMs = Date.now() - start;

    // Parse test results from stdout
    const results = this.parseTestOutput(judge0Result.stdout, judge0Result.stderr);

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const xpAwarded = passed * XP.CODING_PER_TEST;

    return {
      questionId,
      passed,
      failed,
      total: results.length,
      results,
      executionMs,
      xpAwarded,
    };
  }

  // ── Judge0 API call ────────────────────────────────────────────────────────

  private async callJudge0(
    language: string,
    code: string,
    timeLimitMs: number,
  ): Promise<{ stdout: string; stderr: string; statusId: number }> {
    const judge0Url = this.config.get<string>('JUDGE0_URL', 'http://judge0:2358');
    const judge0Token = this.config.get<string>('JUDGE0_AUTH_TOKEN');
    const lang = SUPPORTED_LANGUAGES[language];

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (judge0Token) {
      headers['Authorization'] = `Bearer ${judge0Token}`;
    }

    const response = await fetch(`${judge0Url}/submissions?wait=true`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source_code: code,
        language_id: lang.judge0Id,
        stdin: '',
        cpu_time_limit: Math.ceil(timeLimitMs / 1000), // Convert ms to seconds
        memory_limit: 128000, // 128MB in KB
      }),
      signal: AbortSignal.timeout(timeLimitMs + 5000),
    });

    if (!response.ok) {
      throw new BadRequestException(`Execution engine error: ${response.statusText}`);
    }

    const data = await response.json() as any;

    // Judge0 status.id: 3 = Accepted (passed), anything else = failed/error
    if (data.status?.id !== 3) {
      const statusDesc = data.status?.description || 'Unknown error';
      this.logger.warn(`Judge0 execution failed: ${statusDesc}`);

      // Return stderr or compile error for parsing
      return {
        stdout: '',
        stderr: data.stderr || data.compile_output || statusDesc,
        statusId: data.status?.id || -1,
      };
    }

    return {
      stdout: data.stdout ?? '',
      stderr: data.stderr ?? '',
      statusId: data.status?.id ?? -1,
    };
  }

  // ── Source builder ────────────────────────────────────────────────────────
  // Wraps user code + test harness into a single runnable file per language

  private buildRunnable(userCode: string, testSource: string, language: string): string {
    switch (language) {
      case 'javascript':
      case 'typescript':
        return [
          userCode,
          '',
          '// ── Test harness ──────────────────────────────────────',
          this.buildJsTestHarness(),
          '',
          testSource,
          '',
          'runTests();',
        ].join('\n');

      case 'python':
        return [
          userCode,
          '',
          '# ── Test harness ──────────────────────────────────────',
          this.buildPythonTestHarness(),
          '',
          testSource,
          '',
          'run_tests()',
        ].join('\n');

      case 'go':
        return [userCode, '', testSource].join('\n');

      default:
        return userCode + '\n' + testSource;
    }
  }

  // Lightweight inline test runner (no Jest dependency — Judge0 is sandboxed)
  private buildJsTestHarness(): string {
    return `
const __tests = [];
const __results = [];

function test(name, fn) {
  __tests.push({ name, fn });
}

function expect(actual) {
  return {
    toEqual(expected) {
      const pass = JSON.stringify(actual) === JSON.stringify(expected);
      if (!pass) throw new Error(\`Expected \${JSON.stringify(expected)}, got \${JSON.stringify(actual)}\`);
    },
    toBe(expected) {
      if (actual !== expected) throw new Error(\`Expected \${expected}, got \${actual}\`);
    },
    toBeGreaterThan(n) {
      if (actual <= n) throw new Error(\`Expected > \${n}, got \${actual}\`);
    },
    toBeLessThan(n) {
      if (actual >= n) throw new Error(\`Expected < \${n}, got \${actual}\`);
    },
  };
}

function describe(_name, fn) { fn(); }

function runTests() {
  for (const t of __tests) {
    try {
      t.fn();
      __results.push({ name: t.name, passed: true });
    } catch (e) {
      __results.push({ name: t.name, passed: false, error: e.message });
    }
  }
  console.log(JSON.stringify(__results));
}
`.trim();
  }

  private buildPythonTestHarness(): string {
    return `
import json as __json

__tests = []
__results = []

def test(name):
    def decorator(fn):
        __tests.append((name, fn))
        return fn
    return decorator

class __Expect:
    def __init__(self, actual):
        self.actual = actual
    def to_equal(self, expected):
        if self.actual != expected:
            raise AssertionError(f"Expected {expected}, got {self.actual}")
    def to_be(self, expected):
        if self.actual != expected:
            raise AssertionError(f"Expected {expected}, got {self.actual}")

def expect(val):
    return __Expect(val)

def run_tests():
    for name, fn in __tests:
        try:
            fn()
            __results.append({"name": name, "passed": True})
        except Exception as e:
            __results.append({"name": name, "passed": False, "error": str(e)})
    print(__json.dumps(__results))
`.trim();
  }

  // ── Test file loader ──────────────────────────────────────────────────────

  private loadTestFile(testFile: string, language: string): string {
    const questionsDir = this.config.get<string>(
      'QUESTIONS_DIR',
      path.join(__dirname, '../../../../questions'),
    );

    // Language-specific test file takes precedence, fallback to .js
    const candidates = [
      path.join(questionsDir, 'coding', 'tests', testFile.replace('.test.js', `.test.${this.ext(language)}`)),
      path.join(questionsDir, 'coding', 'tests', testFile),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, 'utf-8');
      }
    }

    throw new BadRequestException(`Test file not found for question`);
  }

  // ── Output parser ─────────────────────────────────────────────────────────

  private parseTestOutput(stdout: string, stderr: string): TestResult[] {
    // The test harness outputs a JSON array as the last line of stdout
    const lines = stdout.trim().split('\n');
    const lastLine = lines[lines.length - 1];

    try {
      const parsed = JSON.parse(lastLine) as Array<{
        name: string;
        passed: boolean;
        error?: string;
      }>;
      return parsed.map((r) => ({
        name: r.name,
        passed: r.passed,
        error: r.error,
      }));
    } catch {
      // If we can't parse results, treat as a compile/runtime error
      return [{
        name: 'Execution',
        passed: false,
        error: stderr || stdout || 'Unknown execution error',
      }];
    }
  }

  // ── Utils ─────────────────────────────────────────────────────────────────

  private ext(language: string): string {
    return { javascript: 'js', typescript: 'ts', python: 'py', go: 'go' }[language] ?? 'js';
  }
}

// Made with Bob
