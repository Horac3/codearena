// .github/scripts/test-solutions.js
// Runs each coding challenge's test suite against its reference solution.
// Called by CI on every PR to ensure submitted tests actually pass a correct solution.

const fs = require('fs');
const path = require('path');

const QUESTIONS_DIR = path.join(__dirname, '../../questions/coding');
const SOLUTIONS_DIR = path.join(QUESTIONS_DIR, 'solutions');
const TESTS_DIR     = path.join(QUESTIONS_DIR, 'tests');

let totalPassed = 0;
let totalFailed = 0;
const failures  = [];

// ── Inline test harness (same one injected at runtime) ────────────────────

function buildHarness() {
  const tests   = [];
  const results = [];

  function test(name, fn) { tests.push({ name, fn }); }
  function describe(_name, fn) { fn(); }
  function expect(actual) {
    return {
      toEqual(expected) {
        const pass = JSON.stringify(actual) === JSON.stringify(expected);
        if (!pass) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      },
      toBe(expected) {
        if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
      },
      toBeGreaterThan(n) {
        if (actual <= n) throw new Error(`Expected > ${n}, got ${actual}`);
      },
      toBeLessThan(n) {
        if (actual >= n) throw new Error(`Expected < ${n}, got ${actual}`);
      },
    };
  }

  function runTests() {
    for (const t of tests) {
      try {
        t.fn();
        results.push({ name: t.name, passed: true });
      } catch (e) {
        results.push({ name: t.name, passed: false, error: e.message });
      }
    }
    return results;
  }

  return { test, describe, expect, runTests };
}

// ── Collect all solution files ─────────────────────────────────────────────

if (!fs.existsSync(SOLUTIONS_DIR)) {
  console.log('No solutions directory found — skipping solution tests.');
  process.exit(0);
}

const solutionFiles = fs.readdirSync(SOLUTIONS_DIR).filter(f => f.endsWith('.js'));

if (solutionFiles.length === 0) {
  console.log('No solution files found — skipping.');
  process.exit(0);
}

// ── Run each solution against its test file ───────────────────────────────

for (const solutionFile of solutionFiles) {
  const questionId  = solutionFile.replace('.js', '');
  const testFile    = path.join(TESTS_DIR, `${questionId}.test.js`);
  const solutionPath = path.join(SOLUTIONS_DIR, solutionFile);

  if (!fs.existsSync(testFile)) {
    console.warn(`⚠  No test file for ${questionId} — skipping`);
    continue;
  }

  try {
    const solutionFn = require(solutionPath);
    const testSource = fs.readFileSync(testFile, 'utf-8');
    const harness    = buildHarness();

    // Run test file in a function scope with harness globals + solution injected
    const testFn = new Function(
      'solution', 'test', 'describe', 'expect',
      testSource,
    );
    testFn(solutionFn, harness.test, harness.describe, harness.expect);

    const results = harness.runTests();
    const passed  = results.filter(r => r.passed).length;
    const failed  = results.filter(r => !r.passed).length;

    totalPassed += passed;
    totalFailed += failed;

    if (failed > 0) {
      failures.push({ questionId, results });
      console.error(`❌  ${questionId}: ${passed}/${results.length} passed`);
      for (const r of results.filter(r => !r.passed)) {
        console.error(`     ✗ ${r.name}: ${r.error}`);
      }
    } else {
      console.log(`✅  ${questionId}: ${passed}/${results.length} passed`);
    }
  } catch (e) {
    totalFailed++;
    failures.push({ questionId, error: e.message });
    console.error(`❌  ${questionId}: crashed — ${e.message}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`\n──────────────────────────────`);
console.log(`Total: ${totalPassed} passed, ${totalFailed} failed`);

if (totalFailed > 0) {
  console.error(`\n${failures.length} question(s) have failing tests. Fix before merging.`);
  process.exit(1);
} else {
  console.log(`\nAll solution tests passed ✓`);
  process.exit(0);
}
