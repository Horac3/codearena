// apps/api/src/duel/duel.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server } from 'socket.io';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { QuestionsService } from '../questions/questions.service';
import { Question, XP } from '@codearena/question-schema';

// ── In-memory room state (mirrored to Redis for multi-instance support) ──────

interface PlayerState {
  userId: string;
  socketId: string;
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
}

const INVITE_EXPIRY_HOURS = 24;
const ROOM_TTL_SECONDS = 60 * 60 * 2; // 2 hours max per duel

@Injectable()
export class DuelService {
  private readonly logger = new Logger(DuelService.name);
  private rooms = new Map<string, DuelRoom>(); // local cache

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private questions: QuestionsService,
    private config: ConfigService,
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────

  async createDuel(
    userId: string,
    config: { topic: string; rounds: number },
    socketId: string,
  ) {
    const token = randomBytes(8).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
    const rounds = [5, 7].includes(config.rounds) ? config.rounds : 7;

    const duel = await this.prisma.duel.create({
      data: {
        playerAId: userId,
        topic: config.topic,
        rounds,
        inviteToken: token,
        expiresAt,
      },
    });

    const selectedQuestions = this.questions.findForDuel(
      config.topic as any,
      rounds,
    );

    const room: DuelRoom = {
      id: duel.id,
      players: [{ userId, socketId, score: 0, answers: {} }, null],
      questions: selectedQuestions,
      currentIndex: -1, // -1 = not started yet
      topic: config.topic,
      rounds,
      startedAt: null,
    };

    this.rooms.set(duel.id, room);
    await this.redis.setJson(`duel:${duel.id}`, room, ROOM_TTL_SECONDS);

    const baseUrl = this.config.get<string>('BASE_URL', 'https://codearena.dev');

    return {
      roomId: duel.id,
      inviteToken: token,
      inviteLink: `${baseUrl}/duel/${token}`,
      vsCodeLink: `vscode://codearena.codearena/duel/${token}`,
    };
  }

  // ── Join ──────────────────────────────────────────────────────────────────

  async joinDuel(
    userId: string,
    roomId: string,
    socketId: string,
    server: Server,
  ): Promise<{ ok: boolean; players?: any[]; error?: string }> {
    const duel = await this.prisma.duel.findUnique({ where: { id: roomId } });

    if (!duel) return { ok: false, error: 'Duel not found' };
    if (duel.status !== 'PENDING') return { ok: false, error: 'Duel is no longer open' };
    if (duel.playerAId === userId) return { ok: false, error: 'Cannot duel yourself' };
    if (duel.expiresAt < new Date()) return { ok: false, error: 'Invite has expired' };

    await this.prisma.duel.update({
      where: { id: roomId },
      data: { playerBId: userId, status: 'ACTIVE', startedAt: new Date() },
    });

    const room = await this.getRoom(roomId);
    if (!room) return { ok: false, error: 'Room state not found' };

    room.players[1] = { userId, socketId, score: 0, answers: {} };
    room.startedAt = Date.now();

    await this.saveRoom(room);

    const [pA, pB] = room.players;
    return {
      ok: true,
      players: [
        { userId: pA!.userId, score: 0 },
        { userId: pB!.userId, score: 0 },
      ],
    };
  }

  // ── Answer recording ──────────────────────────────────────────────────────

  async recordAnswer(
    roomId: string,
    userId: string,
    questionId: string,
    choice: number,
    elapsedMs: number,
  ) {
    const room = await this.getRoom(roomId);
    if (!room) return null;

    const question = room.questions.find((q) => q.id === questionId);
    if (!question) return null;

    const player = room.players.find((p) => p?.userId === userId);
    if (!player || player.answers[questionId]) return null; // already answered

    // Score server-side — never trust the client
    const correct =
      'answer' in question ? (question as any).answer === choice : false;
    const xp = correct
      ? Math.max(
          XP.MCQ_CORRECT,
          XP.MCQ_CORRECT +
            Math.round(XP.MCQ_SPEED_BONUS_MAX * (1 - Math.min(elapsedMs, 60_000) / 60_000)),
        )
      : 0;

    player.answers[questionId] = { choice, correct, elapsedMs };
    if (correct) player.score += xp;

    await this.saveRoom(room);

    const currentQ = room.questions[room.currentIndex];
    const bothAnswered = room.players.every((p) => p && currentQ && p.answers[currentQ.id]);
    const duelComplete = bothAnswered && room.currentIndex >= room.rounds - 1;

    return {
      bothAnswered,
      duelComplete,
      scores: {
        [room.players[0]!.userId]: room.players[0]!.score,
        [room.players[1]!.userId]: room.players[1]!.score,
      },
      summary: duelComplete ? this.buildSummary(room) : null,
    };
  }

  async recordTimeout(roomId: string, userId: string, questionId: string) {
    // Record a null answer — counts as wrong, no XP
    await this.recordAnswer(roomId, userId, questionId, -1, 60_000);
  }

  // ── Next question ─────────────────────────────────────────────────────────

  async getNextQuestion(roomId: string) {
    const room = await this.getRoom(roomId);
    if (!room) return null;

    room.currentIndex += 1;
    if (room.currentIndex >= room.questions.length) return null;

    await this.saveRoom(room);

    return {
      question: this.stripAnswer(room.questions[room.currentIndex]),
      index: room.currentIndex,
      total: room.rounds,
    };
  }

  // ── Finalize ──────────────────────────────────────────────────────────────

  async finalizeDuel(roomId: string) {
    const room = await this.getRoom(roomId);
    if (!room) return;

    const [pA, pB] = room.players;
    const winnerId =
      pA!.score > pB!.score
        ? pA!.userId
        : pB!.score > pA!.score
        ? pB!.userId
        : null; // draw

    await this.prisma.duel.update({
      where: { id: roomId },
      data: {
        status: 'COMPLETED',
        scoreA: pA!.score,
        scoreB: pB!.score,
        winnerId,
        endedAt: new Date(),
      },
    });

    // Award XP to both players
    for (const player of room.players) {
      if (!player) continue;
      const isWinner = player.userId === winnerId;
      await this.prisma.user.update({
        where: { id: player.userId },
        data: {
          totalXp: { increment: isWinner ? XP.DUEL_WIN : XP.DUEL_LOSS },
          weeklyXp: { increment: isWinner ? XP.DUEL_WIN : XP.DUEL_LOSS },
        },
      });
    }

    // Clean up room state
    this.rooms.delete(roomId);
    await this.redis.del(`duel:${roomId}`);
  }

  // ── Disconnect handler ────────────────────────────────────────────────────

  async handleDisconnect(socketId: string, server: Server) {
    for (const [roomId, room] of this.rooms.entries()) {
      const disconnected = room.players.find((p) => p?.socketId === socketId);
      if (!disconnected) continue;

      if (room.startedAt) {
        // Mid-duel disconnect — mark as abandoned
        server.to(roomId).emit('PLAYER_DISCONNECTED', {
          userId: disconnected.userId,
          message: 'Opponent disconnected. Duel abandoned.',
        });
        await this.prisma.duel.update({
          where: { id: roomId },
          data: { status: 'ABANDONED', endedAt: new Date() },
        });
      }

      this.rooms.delete(roomId);
      await this.redis.del(`duel:${roomId}`);
      break;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async getRoom(roomId: string): Promise<DuelRoom | null> {
    // Check local cache first
    if (this.rooms.has(roomId)) return this.rooms.get(roomId)!;
    // Fall back to Redis (handles multi-instance)
    const room = await this.redis.getJson<DuelRoom>(`duel:${roomId}`);
    if (room) this.rooms.set(roomId, room);
    return room;
  }

  private async saveRoom(room: DuelRoom) {
    this.rooms.set(room.id, room);
    await this.redis.setJson(`duel:${room.id}`, room, ROOM_TTL_SECONDS);
  }

  private stripAnswer(q: Question): Omit<Question, 'answer'> {
    // Never send the correct answer to clients
    const { ...safe } = q as any;
    delete safe.answer;
    return safe;
  }

  private buildSummary(room: DuelRoom) {
    const [pA, pB] = room.players;
    return {
      scores: {
        [pA!.userId]: pA!.score,
        [pB!.userId]: pB!.score,
      },
      winner:
        pA!.score > pB!.score
          ? pA!.userId
          : pB!.score > pA!.score
          ? pB!.userId
          : 'draw',
      rounds: room.rounds,
    };
  }

  // ── Invite token lookup (for HTTP invite endpoint) ────────────────────────

  async findByToken(token: string) {
    const duel = await this.prisma.duel.findUnique({
      where: { inviteToken: token },
      include: { playerA: { select: { username: true, avatarUrl: true } } },
    });
    if (!duel) throw new NotFoundException('Invite not found');
    if (duel.expiresAt < new Date()) throw new BadRequestException('Invite expired');
    return duel;
  }
}
