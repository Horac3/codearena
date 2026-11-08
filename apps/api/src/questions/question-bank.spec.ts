import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadQuestionBank } from './questions.service';

const REPO_QUESTIONS = path.join(__dirname, '../../../../questions');

function tmpBank(files: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-bank-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body));
  }
  return dir;
}

const mcq = (id: string) => ({
  id, type: 'mcq', topic: 'dsa', difficulty: 2,
  stem: 'Which structure gives O(1) average lookup?',
  options: ['Array', 'Hash map', 'Linked list', 'Heap'], answer: 1,
  explanation: 'Hash maps hash the key to a bucket.', tags: ['hashing'], author: 'test',
});

describe('loadQuestionBank', () => {
  it('flattens array files from the real question bank into individual questions', () => {
    const { questions, errors } = loadQuestionBank(REPO_QUESTIONS);
    expect(errors).toEqual([]);
    // 4 array files + 1 single coding question
    expect(questions.length).toBeGreaterThan(5);
    for (const q of questions) {
      expect(Array.isArray(q)).toBe(false);
      expect(typeof q.id).toBe('string');
      expect(typeof q.topic).toBe('string');
    }
    expect(questions.filter((q) => q.topic === 'dsa' && q.type !== 'coding').length).toBeGreaterThan(0);
  });

  it('reports invalid entries and duplicate ids instead of loading them', () => {
    const dir = tmpBank({
      'dsa/a.json': [mcq('dsa-x-001'), { id: 'broken' }],
      'dsa/b.json': mcq('dsa-x-001'),
      'dsa/c.json': '{ not json',
    });
    const { questions, errors } = loadQuestionBank(dir);
    expect(questions.map((q) => q.id)).toEqual(['dsa-x-001']);
    expect(errors).toHaveLength(3);
    expect(errors.some((e) => e.includes('duplicate id "dsa-x-001"'))).toBe(true);
    expect(errors.some((e) => e.includes('invalid JSON'))).toBe(true);
  });

  it('reports a missing directory', () => {
    expect(loadQuestionBank('/nonexistent/questions').errors).toHaveLength(1);
  });
});
