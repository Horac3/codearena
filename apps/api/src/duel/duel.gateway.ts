// apps/api/src/duel/duel.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { UseGuards, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { DuelService } from './duel.service';
import { WsJwtGuard } from '../auth/ws-jwt.guard';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/duel',
})
export class DuelGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(DuelGateway.name);

  constructor(private readonly duelService: DuelService) {}

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    await this.duelService.handleDisconnect(client.id, this.server);
  }

  // ── CREATE DUEL ──────────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('CREATE_DUEL')
  async onCreateDuel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { topic: string; rounds: number },
  ) {
    const userId = client.data.userId as string;
    const result = await this.duelService.createDuel(userId, data, client.id);
    client.join(result.roomId);
    client.emit('DUEL_CREATED', result);
  }

  // ── JOIN DUEL ────────────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('JOIN_DUEL')
  async onJoinDuel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = client.data.userId as string;
    const result = await this.duelService.joinDuel(
      userId,
      data.roomId,
      client.id,
      this.server,
    );

    if (result.ok) {
      client.join(data.roomId);
      // Notify both players
      this.server.to(data.roomId).emit('DUEL_READY', {
        roomId: data.roomId,
        players: result.players,
      });

      // Start 3-second countdown then push first question to both simultaneously
      setTimeout(() => {
        this.server.to(data.roomId).emit('COUNTDOWN', { seconds: 3 });
      }, 500);

      setTimeout(async () => {
        await this.pushNextQuestion(data.roomId);
      }, 3500);
    } else {
      client.emit('DUEL_ERROR', { message: result.error });
    }
  }

  // ── SUBMIT ANSWER ────────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('ANSWER')
  async onAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; questionId: string; choice: number; elapsedMs: number },
  ) {
    const userId = client.data.userId as string;
    // Timestamp is recorded server-side — client-supplied elapsedMs is for
    // display only; actual speed scoring uses server receive time
    const result = await this.duelService.recordAnswer(
      data.roomId,
      userId,
      data.questionId,
      data.choice,
      data.elapsedMs,
    );

    if (!result) return;

    // Broadcast updated scores to the room
    this.server.to(data.roomId).emit('SCORE_UPDATE', result.scores);

    // If both players have answered (or timer expired), advance
    if (result.bothAnswered) {
      if (result.duelComplete) {
        this.server.to(data.roomId).emit('DUEL_END', result.summary);
        await this.duelService.finalizeDuel(data.roomId);
      } else {
        setTimeout(async () => {
          await this.pushNextQuestion(data.roomId);
        }, 1500); // 1.5s to show result before next question
      }
    }
  }

  // ── TIMEOUT (client signals question timer expired) ───────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('QUESTION_TIMEOUT')
  async onTimeout(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; questionId: string },
  ) {
    const userId = client.data.userId as string;
    await this.duelService.recordTimeout(data.roomId, userId, data.questionId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async pushNextQuestion(roomId: string) {
    const next = await this.duelService.getNextQuestion(roomId);
    if (!next) return;
    // Both players receive the exact same question in the same emit call
    this.server.to(roomId).emit('QUESTION', {
      question: next.question,
      index: next.index,
      total: next.total,
      timerMs: 60_000,
    });
  }
}
