// apps/api/src/jobs/code-harness.ts
//
// Builds the program sent to Judge0 for a coding submission and reads its results back.
//
// Why it looks like this: the old harness ran user code in the same scope as the test runner
// and trusted the last line of stdout, so a submission could print its own "all passed" JSON
// (or redefine test()/expect()) and collect XP. Now:
//   - user code is embedded as a string and evaluated in a separate V8 context (node:vm) that has
//     no require, process or console, so it can't write to stdout, exit, or touch the harness;
//   - arguments and return values cross the boundary as JSON strings, so no host object (and
//     no host Function constructor) is reachable from user code;
//   - the harness prints its results after a random per-run marker that it reads from stdin
//     before user code runs, and the server only accepts output behind that marker;
//   - the server checks the reported test names against the test file.
// It is not a full sandbox (Judge0/isolate is), but it closes the "print a fake result" hole.

import ts from 'typescript';

export interface HarnessResult {
  name: string;
  passed: boolean;
  error?: string;
}

/** Languages that have a harness. Others are rejected before a job is queued. */
export const HARNESS_LANGUAGES = ['javascript', 'typescript'] as const;
export type HarnessLanguage = (typeof HARNESS_LANGUAGES)[number];

export function hasHarness(language: string): language is HarnessLanguage {
  return (HARNESS_LANGUAGES as readonly string[]).includes(language);
}

/** The function the user must define, from the question's signature (e.g. "function twoSum(…)"). */
export function solutionName(signature: string | undefined): string | null {
  if (!signature) return null;
  const m = signature.match(/\bfunction\s+([A-Za-z_$][\w$]*)/) ?? signature.match(/\bdef\s+([A-Za-z_][\w]*)/);
  return m ? m[1] : null;
}

/** Test names declared in a test file: test('name', …) / it('name', …). */
export function expectedTestNames(testSource: string): string[] {
  const names: string[] = [];
  const re = /\b(?:test|it)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(testSource))) names.push(m[2].replace(/\\(.)/g, '$1'));
  return names;
}

/** TypeScript submissions are transpiled here and run as JavaScript. */
export function toJavaScript(code: string, language: HarnessLanguage): string {
  if (language === 'javascript') return code;
  return ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: false,
  }).outputText;
}

/** Build the Node program: harness + isolated user code + the question's test file. */
export function buildJsProgram(userJs: string, fnName: string, testSource: string): string {
  if (!/^[A-Za-z_$][\w$]*$/.test(fnName)) throw new Error('Invalid solution function name');
  return `'use strict';
const __ca = (() => {
  const vm = require('vm');
  const fs = require('fs');
  let marker = '';
  try { marker = String(fs.readFileSync(0, 'utf8')).trim(); } catch (_) { /* no stdin */ }
  const write = process.stdout.write.bind(process.stdout);
  const stringify = JSON.stringify;
  const parse = JSON.parse;

  // A fresh context: no require, process, or host objects. Captures its own JSON before user code runs.
  const ctx = vm.createContext(Object.create(null));
  const wrap = vm.runInContext(
    'var console = { log: function () {}, error: function () {}, warn: function () {}, info: function () {} };' +
    'var exports = {}; var module = { exports: exports };' +
    '(function () { var s = JSON.stringify, p = JSON.parse;' +
    '  return function (fn) { return function (argsJson) { var r = fn.apply(undefined, p(argsJson)); return r === undefined ? undefined : s(r); }; };' +
    '})()',
    ctx,
  );
  let call = null;
  let loadError = null;
  try {
    vm.runInContext(${JSON.stringify(userJs)}, ctx, { timeout: 2000, filename: 'solution.js' });
    const fn = vm.runInContext(${JSON.stringify(`typeof ${fnName} === 'function' ? ${fnName} : (module.exports && module.exports.${fnName})`)}, ctx);
    if (typeof fn !== 'function') throw new Error(${JSON.stringify(`Define a function named ${fnName}`)});
    call = wrap(fn);
  } catch (e) {
    loadError = String((e && e.message) || e);
  }

  const solution = (...args) => {
    if (loadError !== null) throw new Error(loadError);
    const out = call(stringify(args));
    return out === undefined ? undefined : parse(out);
  };

  const tests = [];
  let running = false;
  const fail = (msg) => { throw new Error(msg); };
  const test = (name, fn) => { if (!running) tests.push({ name: String(name), fn }); };
  const describe = (_name, fn) => fn();
  const expect = (actual) => ({
    toEqual(e) { if (stringify(actual) !== stringify(e)) fail('Expected ' + stringify(e) + ', got ' + stringify(actual)); },
    toBe(e) { if (actual !== e) fail('Expected ' + stringify(e) + ', got ' + stringify(actual)); },
    toBeGreaterThan(n) { if (!(actual > n)) fail('Expected > ' + n + ', got ' + stringify(actual)); },
    toBeLessThan(n) { if (!(actual < n)) fail('Expected < ' + n + ', got ' + stringify(actual)); },
    toBeTruthy() { if (!actual) fail('Expected a truthy value, got ' + stringify(actual)); },
    toBeFalsy() { if (actual) fail('Expected a falsy value, got ' + stringify(actual)); },
  });
  const run = () => {
    running = true;
    const results = [];
    for (const t of tests) {
      try { t.fn(); results.push({ name: t.name, passed: true }); }
      catch (e) { results.push({ name: t.name, passed: false, error: String((e && e.message) || e).slice(0, 500) }); }
    }
    write('\\n' + marker + stringify(results) + '\\n');
  };
  return { solution, test, it: test, describe, expect, run };
})();

((solution, test, it, describe, expect) => {
${testSource}
})(__ca.solution, __ca.test, __ca.it, __ca.describe, __ca.expect);

__ca.run();
`;
}

/**
 * Read the harness results from Judge0 stdout. Only a line starting with this run's marker
 * counts, and it must report exactly the tests in the test file.
 */
export function parseHarnessOutput(stdout: string, marker: string, expectedNames: string[]): HarnessResult[] {
  const line = stdout
    .split('\n')
    .reverse()
    .find((l) => l.startsWith(marker));
  if (!line) throw new HarnessError('The test run did not finish (no results were reported)');

  let parsed: unknown;
  try {
    parsed = JSON.parse(line.slice(marker.length));
  } catch {
    throw new HarnessError('Test results could not be read');
  }
  if (!Array.isArray(parsed) || !parsed.every(isResult)) {
    throw new HarnessError('Test results could not be read');
  }

  const got = parsed.map((r) => r.name).sort();
  const want = [...expectedNames].sort();
  if (want.length > 0 && (got.length !== want.length || got.some((n, i) => n !== want[i]))) {
    throw new HarnessError('Test results did not match the test file');
  }
  return parsed.map((r) => ({ name: r.name, passed: r.passed, error: r.error }));
}

/** A problem with the run itself (not a failing test). Not retried. */
export class HarnessError extends Error {}

function isResult(r: unknown): r is HarnessResult {
  if (!r || typeof r !== 'object') return false;
  const o = r as Record<string, unknown>;
  return typeof o.name === 'string' && typeof o.passed === 'boolean' &&
    (o.error === undefined || typeof o.error === 'string');
}
