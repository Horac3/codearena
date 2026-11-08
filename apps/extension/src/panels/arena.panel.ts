// apps/extension/src/panels/arena.panel.ts
import * as vscode from 'vscode';
import { ApiService } from '../services/api.service';
import { DuelService } from '../services/duel.service';
import { getWebviewContent } from './webview-content';

type PanelMode = 'daily' | 'practice' | 'duel-lobby' | 'duel-active' | 'weekly' | 'rank';

// Server → webview duel events, forwarded as-is.
const DUEL_EVENTS = [
  'DUEL_CREATED', 'DUEL_ERROR', 'DUEL_READY', 'COUNTDOWN', 'QUESTION',
  'SCORE_UPDATE', 'DUEL_END', 'PLAYER_DISCONNECTED', 'PLAYER_RECONNECTED',
];

export class ArenaPanel {
  private static current: ArenaPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private duelUnsubs: Array<() => void> = [];
  private duelRoomId: string | null = null;

  // Messages sent before the webview script has loaded would be dropped, so they wait for READY.
  private webviewReady = false;
  private outbox: Array<{ type: string; payload?: unknown }> = [];

  private constructor(
    private context: vscode.ExtensionContext,
    private api: ApiService,
    private duelSvc: DuelService | undefined,
    mode: PanelMode,
    duelToken?: string,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'codearena',
      'CodeArena ⚡',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      },
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg).catch((e) => this.send('ERROR', { message: errorText(e) })),
      null,
      this.disposables,
    );

    void this.loadMode(mode, duelToken);
  }

  // ── Static openers ────────────────────────────────────────────────────

  static openDaily(context: vscode.ExtensionContext, api: ApiService) {
    ArenaPanel.open(context, api, undefined, 'daily');
  }

  static openPractice(context: vscode.ExtensionContext, api: ApiService) {
    ArenaPanel.open(context, api, undefined, 'practice');
  }

  static openWeekly(context: vscode.ExtensionContext, api: ApiService) {
    ArenaPanel.open(context, api, undefined, 'weekly');
  }

  static openRank(context: vscode.ExtensionContext, api: ApiService) {
    ArenaPanel.open(context, api, undefined, 'rank');
  }

  static openDuelLobby(context: vscode.ExtensionContext, api: ApiService, duel: DuelService) {
    ArenaPanel.open(context, api, duel, 'duel-lobby');
  }

  static openDuel(context: vscode.ExtensionContext, api: ApiService, duel: DuelService, token: string) {
    ArenaPanel.open(context, api, duel, 'duel-active', token);
  }

  private static open(
    context: vscode.ExtensionContext,
    api: ApiService,
    duel: DuelService | undefined,
    mode: PanelMode,
    token?: string,
  ) {
    if (ArenaPanel.current) {
      if (duel) ArenaPanel.current.duelSvc = duel;
      ArenaPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      void ArenaPanel.current.loadMode(mode, token);
    } else {
      ArenaPanel.current = new ArenaPanel(context, api, duel, mode, token);
    }
  }

  // ── Mode loader ───────────────────────────────────────────────────────

  private async loadMode(mode: PanelMode, duelToken?: string) {
    this.webviewReady = false;
    this.outbox = [];
    this.panel.webview.html = getWebviewContent(mode, this.panel.webview, this.context);

    try {
      switch (mode) {
        case 'daily': {
          const questions = await this.api.getDailySet();
          this.send('DAILY_LOADED', { questions });
          break;
        }
        case 'practice':
          this.send('PRACTICE');
          break;
        case 'weekly':
          this.send('WEEKLY_LOADED', await this.api.getWeekly());
          break;
        case 'rank':
          this.send('RANK_LOADED', await this.api.getRank());
          break;
        case 'duel-lobby':
          this.send('DUEL_LOBBY');
          break;
        case 'duel-active': {
          if (!this.duelSvc || !duelToken) break;
          this.send('DUEL_JOINING');
          await this.ensureDuelConnection();
          this.duelSvc.joinDuel(duelToken);
          break;
        }
      }
    } catch (e) {
      this.send('ERROR', { message: errorText(e) });
    }
  }

  // ── Duel wiring (once per panel, for creator and joiner alike) ─────────

  private async ensureDuelConnection() {
    if (!this.duelSvc) throw new Error('Duels are not available');
    await this.duelSvc.connect();
    if (this.duelUnsubs.length > 0) return;

    for (const event of DUEL_EVENTS) {
      this.duelUnsubs.push(this.duelSvc.on(event, (data) => {
        if (event === 'DUEL_READY' && data?.roomId) this.duelRoomId = data.roomId;
        if (event === 'DUEL_CREATED') this.onDuelCreated(data);
        this.send(event, data);
      }));
    }
  }

  private onDuelCreated(data: { roomId: string; inviteLink: string }) {
    this.duelRoomId = data.roomId;
    void vscode.env.clipboard.writeText(data.inviteLink);
    vscode.window.showInformationMessage(
      '⚡ Duel invite link copied to clipboard!',
      'Share via browser',
    ).then((action) => {
      if (action) vscode.env.openExternal(vscode.Uri.parse(data.inviteLink));
    });
  }

  // ── Message handler (webview → extension) ─────────────────────────────

  private async handleMessage(msg: { type: string; payload?: any }) {
    switch (msg.type) {
      case 'READY':
        this.webviewReady = true;
        for (const m of this.outbox.splice(0)) this.panel.webview.postMessage(m);
        break;

      case 'DAILY_SUBMIT': {
        try {
          const result = await this.api.submitDaily(msg.payload?.answers ?? {});
          this.send('DAILY_RESULT', result);
        } catch (e) {
          this.send('DAILY_ERROR', { message: errorText(e) });
        }
        break;
      }

      case 'WEEKLY_SUBMIT': {
        const result = await this.api.submitWeekly(msg.payload?.answers ?? {});
        this.send('WEEKLY_RESULT', result);
        break;
      }

      case 'SUBMIT_ANSWER': {
        const { questionId, choice, elapsedMs } = msg.payload ?? {};
        if (this.duelRoomId) this.duelSvc?.submitAnswer(this.duelRoomId, questionId, choice, elapsedMs);
        break;
      }

      case 'CREATE_DUEL': {
        const { topic, rounds } = msg.payload ?? {};
        await this.ensureDuelConnection();
        this.duelSvc?.createDuel(topic, rounds);
        break;
      }

      case 'SUBMIT_CODE': {
        const { questionId, language, code } = msg.payload ?? {};
        try {
          const result = await this.api.submitCode(questionId, language, code);
          this.send('EXECUTION_RESULT', result);
        } catch (e) {
          this.send('EXECUTION_ERROR', { message: errorText(e) });
        }
        break;
      }

      case 'OPEN_DAILY':      await this.loadMode('daily'); break;
      case 'OPEN_PRACTICE':   await this.loadMode('practice'); break;
      case 'OPEN_DUEL_LOBBY': await this.loadMode('duel-lobby'); break;
      case 'OPEN_WEEKLY':     await this.loadMode('weekly'); break;
      case 'OPEN_RANK':       await this.loadMode('rank'); break;
    }
  }

  private send(type: string, payload?: unknown) {
    const msg = { type, payload };
    if (this.webviewReady) this.panel.webview.postMessage(msg);
    else this.outbox.push(msg);
  }

  private dispose() {
    ArenaPanel.current = undefined;
    this.duelUnsubs.forEach((fn) => fn());
    this.duelUnsubs = [];
    this.duelSvc?.disconnect();
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
