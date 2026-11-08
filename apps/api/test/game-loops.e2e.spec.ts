// End-to-end tests for the game loops, against the real Postgres and Redis from
// docker-compose.test.yml and a stub Judge0 that runs submissions with local Node.
// These cover the failures found in review: the daily submit, a full duel over Socket.IO,
// coding XP and forged results, concurrent point awards, and a re-run weekly close.

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { spawnSync } from 'child_process';
import * as http from 'http';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { RankingService } from '../src/ranking/ranking.service';
import { QuestionsService } from '../src/questions/questions.service';
import { WeeklyService } from '../src/weekly/weekly.service';

jest.setTimeout(90_000);

// ── Stub Judge0: runs the program with Node, passing stdin through ─────────────
function startJudge0(port: number): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/languages') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ id: 93, name: 'JavaScript (Node.js 18.15.0)' }]));
      return;
    }
    if (req.method === 'POST' && req.url?.startsWith('/submissions')) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const sub = JSON.parse(body);
        const out = spawnSync(process.execPath, ['-e', sub.source_code], {
          input: sub.stdin ?? '', encoding: 'utf-8', timeout: 10_000,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: out.status === 0 ? { id: 3, description: 'Accepted' } : { id: 11, description: 'Runtime Error (NZEC)' },
          stdout: out.stdout, stderr: out.stderr,
        }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

describe('Game loops (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let questions: QuestionsService;
  let jwt: JwtService;
  let judge0: http.Server;
  let baseUrl: string;
  const sockets: Socket[] = [];

  async function makeUser(name: string) {
    const user = await prisma.user.create({
      data: { githubId: `${Date.now()}${Math.floor(Math.random() * 1e6)}`, username: name },
    });
    return { user, token: jwt.sign({ sub: user.id, username: name }) };
  }

  function api(token: string, path: string, init: RequestInit = {}) {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
    });
  }

  function connect(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const s = io(`${baseUrl}/duel`, { auth: { token: `Bearer ${token}` }, transports: ['websocket'], reconnection: false });
      sockets.push(s);
      s.once('connect', () => resolve(s));
      s.once('connect_error', reject);
    });
  }

  function once<T = any>(s: Socket, event: string): Promise<T> {
    return new Promise((resolve) => s.once(event, resolve));
  }

  beforeAll(async () => {
    const judgePort = Number(new URL(process.env.JUDGE0_URL ?? 'http://localhost:3099').port);
    judge0 = await startJudge0(judgePort);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    questions = app.get(QuestionsService);
    jwt = app.get(JwtService);

    await prisma.$executeRawUnsafe(
      'TRUNCATE "RankEvent", "Badge", "Notification", "DailySubmission", "DailySet", "Answer", "Duel", ' +
      '"WeeklySubmission", "WeeklyCompetition", "ExecutionJob", "ContributionReview", "ShadowReview", ' +
      '"Contribution", "User" CASCADE',
    );
    await redis.redis.flushdb();
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
    await new Promise<void>((r) => judge0.close(() => r()));
  });

  // ── Points ──────────────────────────────────────────────────────────────

  it('applies concurrent awards without losing any, and pays each source once', async () => {
    const ranking = app.get(RankingService);
    const { user } = await makeUser('racer');

    await Promise.all(Array.from({ length: 10 }, (_, i) => ranking.awardPoints(user.id, 10, 'test', `src-${i}`)));
    const results = await Promise.all(Array.from({ length: 5 }, () => ranking.awardPoints(user.id, 10, 'test', 'same')));

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.rankPoints).toBe(110);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
  });

  // ── Daily Blitz ───────────────────────────────────────────────────────────

  it('serves the daily set without answers, scores the submit once, and records points and streak', async () => {
    const { user, token } = await makeUser('daily');

    const set = await (await api(token, '/questions/daily')).json() as any;
    expect(set.length).toBe(5);
    for (const q of set) {
      expect(q.answer).toBeUndefined();
      expect(q.explanation).toBeUndefined();
      expect(q.type).not.toBe('coding');
    }

    const answers = Object.fromEntries(
      set.map((q: any) => [q.id, (questions.findById(q.id) as any).answer]),
    );
    const [first, second] = await Promise.all([
      api(token, '/questions/daily/submit', { method: 'POST', body: JSON.stringify({ answers }) }),
      api(token, '/questions/daily/submit', { method: 'POST', body: JSON.stringify({ answers }) }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 400]);

    const ok = await (first.status === 201 ? first : second).json() as any;
    expect(ok.score).toBe(5);
    expect(ok.streak).toBe(1);
    expect(ok.pointsEarned).toBeGreaterThan(0);
    expect(ok.results[0].explanation).toBeTruthy();

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.rankPoints).toBe(ok.pointsEarned);
    expect(after.weeklyXp).toBe(ok.pointsEarned);
    expect(await prisma.dailySubmission.count({ where: { userId: user.id } })).toBe(1);
  });

  // ── Duel ─────────────────────────────────────────────────────────────────

  it('plays a full duel: both players get every question, the server scores, points are awarded', async () => {
    const a = await makeUser('alice');
    const b = await makeUser('bob');
    const sa = await connect(a.token);
    const sb = await connect(b.token);

    const created = once<any>(sa, 'DUEL_CREATED');
    sa.emit('CREATE_DUEL', { topic: 'mixed', rounds: 5 });
    const { inviteToken, roomId } = await created;

    // The public invite lookup works without a token
    const invite = await (await fetch(`${baseUrl}/duels/invite/${inviteToken}`)).json() as any;
    expect(invite.playerA.username).toBe('alice');

    const readyA = once<any>(sa, 'DUEL_READY');
    const readyB = once<any>(sb, 'DUEL_READY');
    sb.emit('JOIN_DUEL', { inviteToken });
    expect((await readyA).you).toBe(a.user.id);
    expect((await readyB).you).toBe(b.user.id);

    const seenByA: number[] = [];
    const seenByB: number[] = [];
    const ended = Promise.all([once<any>(sa, 'DUEL_END'), once<any>(sb, 'DUEL_END')]);

    sa.on('QUESTION', ({ question, index }) => {
      seenByA.push(index);
      const correct = (questions.findById(question.id) as any).answer;
      sa.emit('ANSWER', { roomId, questionId: question.id, choice: correct, elapsedMs: 1000 });
    });
    sb.on('QUESTION', ({ question, index }) => {
      seenByB.push(index);
      const wrong = ((questions.findById(question.id) as any).answer + 1) % 4;
      // Answering anything but the current question is ignored
      sb.emit('ANSWER', { roomId, questionId: 'not-the-current-question', choice: 0, elapsedMs: 1 });
      sb.emit('ANSWER', { roomId, questionId: question.id, choice: wrong, elapsedMs: 1000 });
    });

    const [endA] = await ended;
    expect(seenByA).toEqual([0, 1, 2, 3, 4]);
    expect(seenByB).toEqual([0, 1, 2, 3, 4]);
    expect(endA.winner).toBe(a.user.id);
    expect(endA.scores[b.user.id]).toBe(0);

    const duel = await prisma.duel.findUniqueOrThrow({ where: { id: roomId } });
    expect(duel.status).toBe('COMPLETED');
    expect(duel.winnerId).toBe(a.user.id);
    const winner = await prisma.user.findUniqueOrThrow({ where: { id: a.user.id } });
    expect(winner.rankPoints).toBeGreaterThan(0);
    expect(winner.duelsWon).toBe(1);
    // FIRST_DUEL lands on the first win (it used to need two)
    expect(await prisma.badge.count({ where: { userId: a.user.id, type: 'FIRST_DUEL' } })).toBe(1);
  });

  it('rejects joining with a room id instead of the invite token', async () => {
    const c = await makeUser('carol');
    const sc = await connect(c.token);
    const err = once<any>(sc, 'exception');
    sc.emit('JOIN_DUEL', { roomId: '00000000-0000-0000-0000-000000000000' });
    expect((await err).status).toBe('error');
  });

  // ── Coding ────────────────────────────────────────────────────────────────

  async function runCode(token: string, code: string) {
    const res = await api(token, '/execute', {
      method: 'POST',
      body: JSON.stringify({ questionId: 'coding-arrays-001', language: 'javascript', code }),
    });
    expect(res.status).toBe(202);
    const { jobId } = await res.json() as any;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const job = await (await api(token, `/execute/${jobId}`)).json() as any;
      if (job.completed) return { jobId, ...job };
    }
    throw new Error('job did not finish');
  }

  it('awards coding XP once per question and ignores forged results', async () => {
    const { user, token } = await makeUser('coder');
    const good = 'function twoSum(n, t) { const m = new Map(); for (let i = 0; i < n.length; i++) { if (m.has(t - n[i])) return [m.get(t - n[i]), i]; m.set(n[i], i); } }';

    const forged = await runCode(token, `
      console.log(JSON.stringify([{ name: 'basic case — first and second elements', passed: true }]));
      function twoSum() { return null; }`);
    expect(forged.result.passed).toBe(0);
    expect(forged.result.xpAwarded).toBe(0);

    const first = await runCode(token, good);
    expect(first.result.passed).toBe(5);
    expect(first.result.xpAwarded).toBe(125);

    const again = await runCode(token, good);
    expect(again.result.passed).toBe(5);
    expect(again.result.xpAwarded).toBe(0);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.rankPoints).toBe(125);

    // Another user can't read this user's job
    const other = await makeUser('snoop');
    expect((await api(other.token, `/execute/${first.jobId}`)).status).toBe(404);
  });

  // ── Weekly ────────────────────────────────────────────────────────────────

  it('closes the weekly competition once, even when the close runs again', async () => {
    const weekly = app.get(WeeklyService);
    const { user, token } = await makeUser('weekly');

    await weekly.openWeeklyCompetition();
    const active = await (await api(token, '/weekly/active')).json() as any;
    expect(active.active).toBe(true);
    expect(active.questions.length).toBeGreaterThan(0);
    expect(active.questions[0].answer).toBeUndefined();

    const res = await api(token, '/weekly/submit', { method: 'POST', body: JSON.stringify({ answers: {} }) });
    expect(res.status).toBe(201);

    const comp = await prisma.weeklyCompetition.findFirstOrThrow({ where: { isActive: true } });
    const closeAt = new Date('2030-01-07T00:00:00Z');
    await weekly.closeWeeklyCompetition(closeAt);

    // Simulate a crash before the competition was marked closed, then a rerun
    await prisma.weeklyCompetition.update({ where: { id: comp.id }, data: { isActive: true, closedAt: null } });
    await redis.redis.del(`lock:cron:weekly-close:2030-01-07`);
    await weekly.closeWeeklyCompetition(closeAt);

    const events = await prisma.rankEvent.count({ where: { userId: user.id, reason: 'weekly_competition' } });
    expect(events).toBe(1);
    expect(await prisma.badge.count({ where: { userId: user.id, type: 'WEEKLY_CHAMPION' } })).toBe(1);
  });
});
