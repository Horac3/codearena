import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildJsProgram, expectedTestNames, parseHarnessOutput, solutionName, toJavaScript, HarnessError,
} from './code-harness';

const TEST_FILE = fs.readFileSync(
  path.join(__dirname, '../../../../questions/coding/tests/coding-arrays-001.test.js'),
  'utf-8',
);
const NAMES = expectedTestNames(TEST_FILE);
const MARKER = '@@CA-0123456789abcdef0123456789abcdef@@';

/** Run a program the way Judge0 would: node, with the marker on stdin. */
function run(userCode: string, language: 'javascript' | 'typescript' = 'javascript') {
  const program = buildJsProgram(toJavaScript(userCode, language), 'twoSum', TEST_FILE);
  const out = spawnSync(process.execPath, ['-e', program], { input: MARKER, encoding: 'utf-8', timeout: 20_000 });
  return parseHarnessOutput(out.stdout, MARKER, NAMES);
}

const GOOD = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const j = seen.get(target - nums[i]);
    if (j !== undefined) return [j, i];
    seen.set(nums[i], i);
  }
}`;

describe('code harness', () => {
  it('reads the function name from the signature and test names from the test file', () => {
    expect(solutionName('function twoSum(nums, target) {}')).toBe('twoSum');
    expect(solutionName('def two_sum(nums):')).toBe('two_sum');
    expect(NAMES).toHaveLength(5);
  });

  it('passes a correct solution (the test file calls it as `solution`)', () => {
    const results = run(GOOD);
    expect(results.every((r) => r.passed)).toBe(true);
    expect(results).toHaveLength(5);
  });

  it('runs TypeScript submissions', () => {
    const results = run(`function twoSum(nums: number[], target: number): number[] {
      for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) {
        if (nums[i] + nums[j] === target) return [i, j];
      }
      return [];
    }`, 'typescript');
    expect(results.filter((r) => r.passed)).toHaveLength(5);
  });

  it('fails a wrong solution', () => {
    const results = run('function twoSum() { return [0, 0]; }');
    expect(results.some((r) => !r.passed)).toBe(true);
  });

  it('does not accept a forged "all passed" line printed by user code', () => {
    const forged = JSON.stringify(NAMES.map((name) => ({ name, passed: true })));
    const attack = `
      try { console.log(${JSON.stringify(forged)}); } catch (e) {}
      try { process.stdout.write(${JSON.stringify(forged)} + '\\n'); process.exit(0); } catch (e) {}
      function twoSum() { return null; }`;
    const results = run(attack);
    expect(results.filter((r) => r.passed)).toHaveLength(0);
  });

  it('gives user code no access to the host (process, require, host Function)', () => {
    const probe = `function twoSum(nums) {
      const leaks = [
        typeof process, typeof require, typeof globalThis.process,
        (function () { try { return typeof nums.constructor.constructor('return process')(); } catch (e) { return 'blocked'; } })(),
      ];
      return leaks;
    }`;
    const program = buildJsProgram(probe, 'twoSum', `test('probe', () => { expect(solution([1], 1)).toEqual('x'); });`);
    const out = spawnSync(process.execPath, ['-e', program], { input: MARKER, encoding: 'utf-8' });
    const [result] = parseHarnessOutput(out.stdout, MARKER, ['probe']);
    // The error message carries what the function returned: nothing from the host is reachable
    // (the Function-constructor escape either finds no `process` or throws).
    expect(result.error).toMatch(/got \["undefined","undefined","undefined","(undefined|blocked)"\]/);
  });

  it('rejects output without the marker or with the wrong tests', () => {
    expect(() => parseHarnessOutput('[{"name":"x","passed":true}]', MARKER, NAMES)).toThrow(HarnessError);
    expect(() => parseHarnessOutput(`${MARKER}[{"name":"x","passed":true}]`, MARKER, NAMES)).toThrow(HarnessError);
  });

  it('reports a missing function as failed tests', () => {
    const results = run('const nope = 1;');
    expect(results.every((r) => !r.passed && /Define a function named twoSum/.test(r.error ?? ''))).toBe(true);
  });
});
