// apps/extension/src/services/duel.service.ts
import * as vscode from 'vscode';
import { io, Socket } from 'socket.io-client';
import { AuthService } from './auth.service';

type DuelEventHandler = (data: any) => void;

export class DuelService {
  private socket: Socket | null = null;
  private handlers = new Map<string, DuelEventHandler[]>();
  private lastInviteToken: string | null = null;

  constructor(
    private context: vscode.ExtensionContext,
    private auth: AuthService,
  ) {}

  private get wsUrl(): string {
    const apiUrl = vscode.workspace
      .getConfiguration('codearena')
      .get<string>('apiUrl', 'https://api.codearena.dev');
    return apiUrl.replace(/^http/, 'ws');
  }

  async connect(): Promise<void> {
    if (this.socket?.connected) return;
    // Drop a stale (disconnected) socket instead of stacking a second one next to it.
    this.socket?.removeAllListeners();
    this.socket?.disconnect();

    const token = await this.auth.getToken();
    if (!token) throw new Error('Not authenticated');

    return new Promise((resolve, reject) => {
      this.socket = io(`${this.wsUrl}/duel`, {
        auth: { token: `Bearer ${token}` },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
      });

      this.socket.once('connect', () => resolve());
      this.socket.once('connect_error', (err) => reject(err));

      // Forward all server events to registered handlers
      const serverEvents = [
        'DUEL_CREATED', 'DUEL_READY', 'DUEL_ERROR',
        'COUNTDOWN', 'QUESTION', 'SCORE_UPDATE',
        'DUEL_END', 'PLAYER_DISCONNECTED', 'PLAYER_RECONNECTED',
      ];
      for (const event of serverEvents) {
        this.socket.on(event, (data: any) => {
          if (event === 'DUEL_CREATED' && data?.inviteToken) this.lastInviteToken = data.inviteToken;
          this.emit(event, data);
        });
      }
      // After socket.io reconnects on its own, rejoin so the server re-attaches this player
      // (otherwise the grace period runs out and the duel is forfeited).
      this.socket.io.on('reconnect', () => {
        if (this.lastInviteToken) this.socket?.emit('JOIN_DUEL', { inviteToken: this.lastInviteToken });
      });
    });
  }

  disconnect() {
    this.lastInviteToken = null;
    this.socket?.disconnect();
    this.socket = null;
    this.handlers.clear();
  }

  // ── Outbound messages ─────────────────────────────────────────────────

  createDuel(topic: string, rounds: number) {
    this.socket?.emit('CREATE_DUEL', { topic, rounds });
  }

  /** Join (or rejoin after a reconnect) by invite token. The server never accepts a bare room id. */
  joinDuel(inviteToken: string) {
    this.lastInviteToken = inviteToken;
    this.socket?.emit('JOIN_DUEL', { inviteToken });
  }

  submitAnswer(roomId: string, questionId: string, choice: number, elapsedMs: number) {
    this.socket?.emit('ANSWER', { roomId, questionId, choice, elapsedMs });
  }


  // ── Event bus ─────────────────────────────────────────────────────────

  on(event: string, handler: DuelEventHandler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
    // Return unsubscribe function
    return () => {
      const list = this.handlers.get(event) ?? [];
      this.handlers.set(event, list.filter((h) => h !== handler));
    };
  }

  private emit(event: string, data: any) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(data);
    }
  }
}
