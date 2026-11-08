// apps/api/src/duel/duel.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WsException,
} from '@nestjs/websockets';
import { UseGuards, Logger, UsePipes, ValidationPipe, BadRequestException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { IsIn, IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { DuelService } from './duel.service';
import { WsJwtGuard } from '../auth/ws-jwt.guard';

// ── Validated message payloads ──────────────────────────────────────────────

class CreateDuelMessage {
  @IsIn(['mixed', 'dsa', 'systems', 'cs-fundamentals', 'networking']) topic!: string;
  @IsIn([5, 7]) rounds!: number;
}

class JoinDuelMessage {
  @IsString() @Matches(/^[a-f0-9]{16,64}$/) inviteToken!: string;
}

class AnswerMessage {
  @IsString() roomId!: string;
  @IsString() questionId!: string;
  @IsInt() @Min(0) @Max(3) choice!: number;
  @IsInt() @Min(0) @Max(600_000) elapsedMs!: number;
}

const wsValidation = new ValidationPipe({
  whitelist: true,
  transform: true,
  exceptionFactory: (errors) =>
    new WsException(errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ')),
});

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  },
  namespace: '/duel',
  maxHttpBufferSize: 16 * 1024, // duel messages are tiny
})
@UsePipes(wsValidation)
export class DuelGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(DuelGateway.name);

  constructor(
    private readonly duelService: DuelService,
    private readonly wsAuth: WsJwtGuard,
  ) {}

  afterInit(server: Server) {
    this.duelService.attachServer(server);
  }

  handleConnection(client: Socket) {
    // Authenticate the handshake itself; unauthenticated sockets are dropped immediately.
    if (!this.wsAuth.authenticate(client)) {
      client.disconnect(true);
      return;
    }
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    await this.duelService.handleDisconnect(client.id);
  }

  // ── CREATE DUEL ──────────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('CREATE_DUEL')
  async onCreateDuel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: CreateDuelMessage,
  ) {
    const userId = client.data.userId as string;
    try {
      const result = await this.duelService.createDuel(userId, data, client.id);
      await client.join(result.roomId);
      client.emit('DUEL_CREATED', result);
    } catch (e) {
      client.emit('DUEL_ERROR', { message: errorMessage(e) });
    }
  }

  // ── JOIN DUEL ────────────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('JOIN_DUEL')
  async onJoinDuel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinDuelMessage,
  ) {
    const userId = client.data.userId as string;
    const result = await this.duelService.joinDuel(userId, data.inviteToken, client.id);
    if (!result.ok) {
      client.emit('DUEL_ERROR', { message: result.error });
      return;
    }

    await client.join(result.roomId);
    const players = await this.duelService.getPlayers(result.roomId);

    if (result.rejoined) {
      // Catch the returning player up; a waiting creator just keeps waiting.
      client.emit('DUEL_READY', { roomId: result.roomId, players, you: userId });
      const current = await this.duelService.getCurrentQuestionFor(result.roomId);
      if (current) client.emit('QUESTION', current);
      client.to(result.roomId).emit('PLAYER_RECONNECTED', { userId });
      return;
    }

    // Tell each player who they are, so clients can label "you" and the opponent.
    const sockets = await this.server.in(result.roomId).fetchSockets();
    for (const s of sockets) {
      s.emit('DUEL_READY', { roomId: result.roomId, players, you: s.data.userId });
    }
    this.duelService.startDuel(result.roomId);
  }

  // ── SUBMIT ANSWER ────────────────────────────────────────────────────────

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('ANSWER')
  async onAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: AnswerMessage,
  ) {
    const userId = client.data.userId as string;
    // Speed scoring uses the server's receive time; elapsedMs is display-only.
    await this.duelService.recordAnswer(data.roomId, userId, data.questionId, data.choice, data.elapsedMs);
  }

  // The server runs the question timer, so the client's QUESTION_TIMEOUT message is no longer needed.
}

function errorMessage(e: unknown): string {
  if (e instanceof BadRequestException) return e.message;
  if (e instanceof WsException) return String(e.getError());
  return 'Something went wrong';
}
