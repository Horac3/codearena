// packages/question-schema/src/index.ts
// Shared types used by the extension, API, and question validators

export type QuestionType = 'mcq' | 'trace' | 'bug-hunt' | 'coding';
export type Topic = 'dsa' | 'systems' | 'cs-fundamentals' | 'networking';
export type Difficulty = 1 | 2 | 3;
export type Language = 'javascript' | 'typescript' | 'python' | 'go';

// ─── Base question (all types share these fields) ────────────────────────────

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  topic: Topic;
  difficulty: Difficulty;
  stem: string;
  code?: string;
  language?: Language;
  explanation: string;
  tags: string[];
  author: string;
}

// ─── MCQ ─────────────────────────────────────────────────────────────────────

export interface MCQQuestion extends BaseQuestion {
  type: 'mcq';
  options: [string, string, string, string]; // always exactly 4
  answer: 0 | 1 | 2 | 3;
}

// ─── Trace the output ────────────────────────────────────────────────────────

export interface TraceQuestion extends BaseQuestion {
  type: 'trace';
  code: string;           // required for trace
  language: Language;     // required for trace
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
}

// ─── Bug hunt ────────────────────────────────────────────────────────────────

export interface BugHuntQuestion extends BaseQuestion {
  type: 'bug-hunt';
  code: string;           // required — the buggy snippet
  language: Language;
  options: [string, string, string, string]; // 4 options for what the bug is
  answer: 0 | 1 | 2 | 3;
  fixedCode?: string;     // optional — the corrected version shown in explanation
}

// ─── Coding challenge ─────────────────────────────────────────────────────────

export interface FunctionSignatures {
  javascript?: string;
  typescript?: string;
  python?: string;
  go?: string;
}

export interface Example {
  input: string;
  output: string;
}

export interface CodingQuestion extends BaseQuestion {
  type: 'coding';
  functionSignature: FunctionSignatures;
  constraints: string[];
  examples: Example[];
  testFile: string;       // filename of the Jest test suite in questions/coding/tests/
  timeLimit?: number;     // ms, defaults to 5000
}

// ─── Union type ───────────────────────────────────────────────────────────────

export type Question = MCQQuestion | TraceQuestion | BugHuntQuestion | CodingQuestion;

// ─── Daily set ────────────────────────────────────────────────────────────────

export interface DailySet {
  date: string;           // YYYY-MM-DD
  questions: Question[];  // always 5
  seed: string;           // deterministic seed used to pick them
}

// ─── Duel ─────────────────────────────────────────────────────────────────────

export interface DuelConfig {
  topic: Topic | 'mixed';
  rounds: number;         // 5 or 7
}

// ─── Answer submission ────────────────────────────────────────────────────────

export interface MCQAnswer {
  questionId: string;
  choice: 0 | 1 | 2 | 3;
  elapsedMs: number;
}

export interface CodingAnswer {
  questionId: string;
  code: string;
  language: Language;
}

// ─── Result from the execution engine ────────────────────────────────────────

export interface TestResult {
  name: string;
  passed: boolean;
  output?: string;
  error?: string;
}

export interface ExecutionResult {
  questionId: string;
  passed: number;
  failed: number;
  total: number;
  results: TestResult[];
  executionMs: number;
  xpAwarded: number;
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  weeklyXp: number;
  streak: number;
  level: number;
}

// ─── XP config ────────────────────────────────────────────────────────────────

export const XP = {
  MCQ_CORRECT: 50,
  MCQ_SPEED_BONUS_MAX: 30,    // decays linearly from 0–60s
  CODING_PER_TEST: 25,         // per passing test case
  STREAK_MULTIPLIER: 0.1,      // +10% per streak day, capped at 2×
  DUEL_WIN: 100,
  DUEL_LOSS: 20,               // participation points
} as const;

export function calculateXp(
  baseXp: number,
  elapsedMs: number,
  streakDays: number,
): number {
  const speedBonus =
    elapsedMs < 60_000
      ? Math.round(XP.MCQ_SPEED_BONUS_MAX * (1 - elapsedMs / 60_000))
      : 0;
  const multiplier = Math.min(2, 1 + streakDays * XP.STREAK_MULTIPLIER);
  return Math.round((baseXp + speedBonus) * multiplier);
}
