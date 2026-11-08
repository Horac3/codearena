// apps/api/src/duel/duel.service.ts
//
// Duel lifecycle, all driven by the server:
//   CREATE_DUEL → creator joins the room, gets an invite token
//   JOIN_DUEL (invite token) → atomic PENDING → ACTIVE, countdown, first QUESTION
//   each QUESTION has a server timer; unanswered players time out and the duel advances
//   after the last question → DUEL_END and points (one transaction)
//   a player who drops mid-duel has a grace period to come back, then forfeits
//
// Timers and the room lock are in-process, so a duel must be served by one API instance
// (true for the single-VPS deployment; see the scaling note in docs/decisions.md).

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server } from 'socket.io';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { QuestionsService } from '../questions/questions.service';
import { RankingService } from '../ranking/ranking.service';
import { Question, XP } from '@codearena/question-schema';

interface PlayerState {
  userId: string;
  username: string;
  socketId: string | null; // null while disconnected
  score: number;
  answers: Record<string, { choice: number; correct: boolean; elapsedMs: number }>;
}

interface DuelRoom {
  id: string;
  players: [PlayerState, PlayerState | null];
  questions: Question[];
  currentIndex: number;
  topic: string;
  rounds: number;
  startedAt: number | null;
  questionStartedAt: number; // server timestamp when the current question was pushed
}

export const QUESTION_MS = 60_000;
const ANSWER_GRACE_MS = 1_500;   // network slack after the question timer
const COUNTDOWN_MS = 3_500;
const BETWEEN_QUESTIONS_MS = 1_500;
export const RECONNECT_GRACE_MS = 30_000;
const INVITE_EXPIRY_HOURS = 24;
const ROOM_TTL_SECONDS = 60 * 60 * 2; // 2 hours max per duel
const TIMEOUT_CHOICE = -1;

export type DuelEndReason = 'completed' | 'forfeit';

@Injectable()
export class DuelService {
  private readonly logger = new Logger(DuelService.name);
  private rooms = new Map<string, DuelRoom>(); // local cache
  private roomLocks = new Map<string, Promise<unknown>>(); // per-room mutex (promise chain)
  private questionTimers = new Map<string, NodeJS.Timeout>();
  private forfeitTimers = new Map<string, NodeJS.Timeout>(); // key: `${roomId}:${userId}`
  private server?: Server;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private questions: QuestionsService,
    private config: ConfigService,
    private ranking: RankingService,
  ) {}

  attachServer(server: Server) {
    this.server = server;
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async createDuel(
    userId: string,
    config: { topic: string; rounds: number },
    socketId: string,
  ) {
    if (!this.questions.isValidTopic(config.topic)) {
      throw new BadRequestException('Unknown topic');
    }
    const rounds = [5, 7].includes(config.rounds) ? config.rounds : 7;

    const selectedQuestions = this.questions.findForDuel(config.topic, rounds);
    if (selectedQuestions.length < rounds) {
      throw new BadRequestException(
        `Not enough ${config.topic} questions for a ${rounds}-round duel (have ${selectedQuestions.length})`,
      );
    }

    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

    // Snapshot player A's tier at creation
    const playerA = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { rankTier: true, username: true },
    });

    const duel = await this.prisma.duel.create({
      data: {
        playerAId: userId,
        playerARankTier: playerA.rankTier,
        topic: config.topic,
        rounds,
        inviteToken: token,
        expiresAt,
      },
    });

    const room: DuelRoom = {
      id: duel.id,
      players: [{ userId, username: playerA.username, socketId, score: 0, answers: {} }, null],
      questions: selectedQuestions,
      currentIndex: -1, // -1 = not started yet
      topic: config.topic,
      rounds,
      startedAt: null,
      questionStartedAt: 0,
    };

    await this.saveRoom(room);

    // The invite page lives on the web app (WEB_URL), not the API (BASE_URL).
    const webUrl = this.config.get<string>('WEB_URL', 'https://codearena.dev');

    return {
      roomId: duel.id,
      inviteToken: token,
      inviteLink: `${webUrl}/duel/${token}`,
      vsCodeLink: `vscode://codearena.codearena/duel/${token}`,
    };
  }

  // ── Join (by invite token, never by room id) ────────────────────────────────

  async joinDuel(
    userId: string,
    inviteToken: string,
    socketId: string,
  ): Promise<{ ok: true; roomId: string; rejoined: boolean } | { ok: false; error: string }> {
    const duel = await this.prisma.duel.findUnique({ where: { inviteToken } });
    if (!duel) return { ok: false, error: 'Duel not found' };

    // A participant coming back (reconnect, or the creator reopening the panel)
    if (duel.playerAId === userId || duel.playerBId === userId) {
      if (duel.status !== 'ACTIVE' && !(duel.status === 'PENDING' && duel.playerAId === userId)) {
        return { ok: false, error: 'Duel is no longer running' };
      }
      return this.withRoomLock(duel.id, async () => {
        const room = await this.getRoom(duel.id);
        const player = room?.players.find((p) => p?.userId === userId);
        if (!room || !player) return { ok: false as const, error: 'Room state not found' };
        player.socketId = socketId;
        await this.saveRoom(room);
        this.clearForfeitTimer(duel.id, userId);
        return { ok: true as const, roomId: duel.id, rejoined: true };
      });
    }

    if (duel.expiresAt < new Date()) return { ok: false, error: 'Invite has expired' };

    const playerB = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { rankTier: true, username: true },
    });

    // Atomic seat claim: of two concurrent joiners only one moves PENDING → ACTIVE.
    const { count } = await this.prisma.duel.updateMany({
      where: { id: duel.id, status: 'PENDING', playerBId: null },
      data: {
        playerBId: userId,
        playerBRankTier: playerB.rankTier,
        status: 'ACTIVE',
        startedAt: new Date(),
      },
    });
    if (count === 0) return { ok: false, error: 'Duel is no longer open' };

    const joined = await this.withRoomLock(duel.id, async () => {
      const room = await this.getRoom(duel.id);
      if (!room) return false;
      room.players[1] = { userId, username: playerB.username, socketId, score: 0, answers: {} };
      room.startedAt = Date.now();
      await this.saveRoom(room);
      return true;
    });
    if (!joined) {
      await this.prisma.duel.update({ where: { id: duel.id }, data: { status: 'ABANDONED', endedAt: new Date() } });
      return { ok: false, error: 'Room state not found' };
    }
    return { ok: true, roomId: duel.id, rejoined: false };
  }

  /** Players with display info, for DUEL_READY and the client header. */
  async getPlayers(roomId: string) {
    const room = await this.getRoom(roomId);
    if (!room) return [];
    return room.players
      .filter((p): p is PlayerState => !!p)
      .map((p) => ({ userId: p.userId, username: p.username, score: p.score }));
  }

  /** Start a freshly joined duel: countdown, then the first question. */
  startDuel(roomId: string) {
    const server = this.requireServer();
    server.to(roomId).emit('COUNTDOWN', { seconds: 3 });
    setTimeout(() => {
      this.pushNextQuestion(roomId).catch((e) => this.logger.error(`pushNextQuestion failed: ${e.message}`));
    }, COUNTDOWN_MS);
  }

  /** State for a player who just rejoined, so their client can catch up. */
  async getCurrentQuestionFor(roomId: string) {
    const room = await this.getRoom(roomId);
    if (!room || room.currentIndex < 0 || room.currentIndex >= room.questions.length) return null;
    const q = room.questions[room.currentIndex];
    return {
      question: this.questions.stripAnswer(q),
      index: room.currentIndex,
      total: room.questions.length,
      timerMs: Math.max(0, QUESTION_MS - (Date.now() - room.questionStartedAt)),
    };
  }

  // ── Answer recording ──────────────────────────────────────────────────────

  async recordAnswer(
    roomId: string,
    userId: string,
    questionId: string,
    choice: number,
    clientElapsedMs: number, // client-reported — for display only
  ) {
    const outcome = await this.withRoomLock(roomId, async () => {
      const room = await this.getRoom(roomId);
      if (!room || room.currentIndex < 0) return null;

      // Only the question currently on screen can be answered
      const current = room.questions[room.currentIndex];
      if (!current || current.id !== questionId) return null;

      const player = room.players.find((p) => p?.userId === userId);
      if (!player || player.answers[questionId]) return null; // not a player, or already answered

      const serverElapsed = Date.now() - room.questionStartedAt;
      if (serverElapsed > QUESTION_MS + ANSWER_GRACE_MS) return null; // too late; the timer handles it

      // Score server-side — never trust the client
      const correct = choice !== TIMEOUT_CHOICE && 'answer' in current && (current as { answer: number }).answer === choice;
      const xp = correct ? speedXp(serverElapsed) : 0;

      player.answers[questionId] = { choice, correct, elapsedMs: Math.max(0, Math.min(clientElapsedMs || 0, QUESTION_MS)) };
      player.score += xp;
      await this.saveRoom(room);

      return { room, bothAnswered: this.allAnswered(room) };
    });

    if (!outcome) return null;
    this.requireServer().to(roomId).emit('SCORE_UPDATE', scoresOf(outcome.room));
    if (outcome.bothAnswered) await this.advance(roomId, outcome.room.currentIndex);
    return outcome;
  }

  // ── Question flow ─────────────────────────────────────────────────────────

  private async pushNextQuestion(roomId: string) {
    const next = await this.withRoomLock(roomId, async () => {
      const room = await this.getRoom(roomId);
      if (!room) return null;

      room.currentIndex += 1;
      if (room.currentIndex >= room.questions.length) return null;

      room.questionStartedAt = Date.now();
      await this.saveRoom(room);
      return { room, index: room.currentIndex };
    });
    if (!next) return;

    const { room, index } = next;
    // Both players receive the exact same question in the same emit call
    this.requireServer().to(roomId).emit('QUESTION', {
      question: this.questions.stripAnswer(room.questions[index]),
      index,
      total: room.questions.length,
      timerMs: QUESTION_MS,
    });

    this.clearQuestionTimer(roomId);
    this.questionTimers.set(
      roomId,
      setTimeout(() => {
        this.onQuestionTimeout(roomId, index).catch((e) => this.logger.error(`question timeout failed: ${e.message}`));
      }, QUESTION_MS + ANSWER_GRACE_MS),
    );
  }

  /** Server-side timer: whoever hasn't answered gets a timeout, then the duel moves on. */
  async onQuestionTimeout(roomId: string, index: number) {
    const room = await this.withRoomLock(roomId, async () => {
      const r = await this.getRoom(roomId);
      if (!r || r.currentIndex !== index) return null; // already advanced
      const q = r.questions[index];
      for (const p of r.players) {
        if (p && !p.answers[q.id]) p.answers[q.id] = { choice: TIMEOUT_CHOICE, correct: false, elapsedMs: QUESTION_MS };
      }
      await this.saveRoom(r);
      return r;
    });
    if (!room) return;
    this.requireServer().to(roomId).emit('SCORE_UPDATE', scoresOf(room));
    await this.advance(roomId, index);
  }

  /** Move past question `index` exactly once: next question, or the end of the duel. */
  private async advance(roomId: string, index: number) {
    const room = await this.getRoom(roomId);
    if (!room || room.currentIndex !== index) return;
    this.clearQuestionTimer(roomId);

    if (index >= room.questions.length - 1) {
      await this.finalizeDuel(roomId, 'completed');
      return;
    }
    setTimeout(() => {
      this.pushNextQuestion(roomId).catch((e) => this.logger.error(`pushNextQuestion failed: ${e.message}`));
    }, BETWEEN_QUESTIONS_MS);
  }

  private allAnswered(room: DuelRoom): boolean {
    const q = room.questions[room.currentIndex];
    return !!q && room.players.every((p) => p && p.answers[q.id]);
  }

  // ── Finalize ──────────────────────────────────────────────────────────────

  async finalizeDuel(roomId: string, reason: DuelEndReason, forfeitedBy?: string) {
    const room = await this.getRoom(roomId);
    if (!room) return;
    const [pA, pB] = room.players;
    if (!pB) return;

    let winnerId: string | null;
    if (reason === 'forfeit' && forfeitedBy) {
      winnerId = forfeitedBy === pA.userId ? pB.userId : pA.userId;
    } else {
      winnerId = pA.score > pB.score ? pA.userId : pB.score > pA.score ? pB.userId : null;
    }

    // One transaction: the status flip, the scores and both players' points commit together.
    // The guarded updateMany makes a second finalize (timer + last answer racing) a no-op.
    const finalized = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.duel.updateMany({
        where: { id: roomId, status: 'ACTIVE' },
        data: {
          status: 'COMPLETED',
          scoreA: pA.score,
          scoreB: pB.score,
          winnerId,
          endedAt: new Date(),
        },
      });
      if (count === 0) return null;

      const duel = await tx.duel.findUniqueOrThrow({
        where: { id: roomId },
        select: { playerARankTier: true, playerBRankTier: true },
      });
      return this.ranking.awardDuelPoints(
        roomId, winnerId, pA.userId, pB.userId,
        duel.playerARankTier, duel.playerBRankTier ?? duel.playerARankTier,
        tx,
      );
    }, { timeout: 15_000, maxWait: 10_000 });

    this.clearRoomTimers(room);
    if (!finalized) return;

    this.requireServer().to(roomId).emit('DUEL_END', {
      scores: scoresOf(room),
      winner: winnerId ?? 'draw',
      reason,
      rounds: room.questions.length,
      pointsAwarded: {
        [pA.userId]: finalized.aResult.pointsAfter - finalized.aResult.pointsBefore,
        [pB.userId]: finalized.bResult.pointsAfter - finalized.bResult.pointsBefore,
      },
    });

    this.rooms.delete(roomId);
    await this.redis.del(`duel:${roomId}`);
  }

  // ── Disconnect handling ───────────────────────────────────────────────────

  async handleDisconnect(socketId: string) {
    for (const [roomId, room] of this.rooms.entries()) {
      const player = room.players.find((p) => p?.socketId === socketId);
      if (!player) continue;

      if (!room.startedAt) {
        // The creator left before anyone joined: close the invite instead of leaving it dangling.
        await this.prisma.duel.updateMany({
          where: { id: roomId, status: 'PENDING' },
          data: { status: 'EXPIRED', endedAt: new Date() },
        });
        this.clearRoomTimers(room);
        this.rooms.delete(roomId);
        await this.redis.del(`duel:${roomId}`);
        continue;
      }

      await this.withRoomLock(roomId, async () => {
        player.socketId = null;
        await this.saveRoom(room);
      });

      // Leaving costs the duel: unless the player is back within the grace period, they forfeit.
      this.requireServer().to(roomId).emit('PLAYER_DISCONNECTED', {
        userId: player.userId,
        graceMs: RECONNECT_GRACE_MS,
        message: `Opponent disconnected. They have ${RECONNECT_GRACE_MS / 1000}s to come back or they forfeit.`,
      });
      const key = `${roomId}:${player.userId}`;
      this.clearForfeitTimer(roomId, player.userId);
      this.forfeitTimers.set(
        key,
        setTimeout(() => {
          this.forfeitTimers.delete(key);
          this.finalizeDuel(roomId, 'forfeit', player.userId)
            .catch((e) => this.logger.error(`forfeit failed: ${e.message}`));
        }, RECONNECT_GRACE_MS),
      );
    }
  }

  // ── Per-room mutex — serializes read-modify-write on room state ──────────

  private async withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.roomLocks.get(roomId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    const tail = run.catch(() => undefined);
    this.roomLocks.set(roomId, tail);
    try {
      return await run;
    } finally {
      if (this.roomLocks.get(roomId) === tail) this.roomLocks.delete(roomId);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private requireServer(): Server {
    if (!this.server) throw new Error('DuelService used before the gateway attached its server');
    return this.server;
  }

  private clearQuestionTimer(roomId: string) {
    const t = this.questionTimers.get(roomId);
    if (t) clearTimeout(t);
    this.questionTimers.delete(roomId);
  }

  private clearForfeitTimer(roomId: string, userId: string) {
    const key = `${roomId}:${userId}`;
    const t = this.forfeitTimers.get(key);
    if (t) clearTimeout(t);
    this.forfeitTimers.delete(key);
  }

  private clearRoomTimers(room: DuelRoom) {
    this.clearQuestionTimer(room.id);
    for (const p of room.players) if (p) this.clearForfeitTimer(room.id, p.userId);
  }

  private async getRoom(roomId: string): Promise<DuelRoom | null> {
    // Check local cache first
    if (this.rooms.has(roomId)) return this.rooms.get(roomId)!;
    // Fall back to Redis (survives a restart of this instance)
    const room = await this.redis.getJson<DuelRoom>(`duel:${roomId}`);
    if (room) this.rooms.set(roomId, room);
    return room;
  }

  private async saveRoom(room: DuelRoom) {
    this.rooms.set(room.id, room);
    await this.redis.setJson(`duel:${room.id}`, room, ROOM_TTL_SECONDS);
  }

  // ── Invite token lookup (public, for the web invite page) ──────────────────

  async findByToken(token: string) {
    const duel = await this.prisma.duel.findUnique({
      where: { inviteToken: token },
      select: {
        topic: true,
        rounds: true,
        status: true,
        expiresAt: true,
        playerA: { select: { username: true, avatarUrl: true } },
      },
    });
    if (!duel) throw new NotFoundException('Invite not found');
    if (duel.expiresAt < new Date()) throw new BadRequestException('Invite expired');
    return duel;
  }
}

/** Duel XP for a correct answer: base plus a speed bonus that decays to 0 over the question timer. */
export function speedXp(serverElapsedMs: number): number {
  const elapsed = Math.min(Math.max(serverElapsedMs, 0), QUESTION_MS);
  return XP.MCQ_CORRECT + Math.round(XP.MCQ_SPEED_BONUS_MAX * (1 - elapsed / QUESTION_MS));
}

function scoresOf(room: DuelRoom): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const p of room.players) if (p) scores[p.userId] = p.score;
  return scores;
}
