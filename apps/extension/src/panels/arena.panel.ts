// apps/extension/src/panels/arena.panel.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { ApiService } from '../services/api.service';
import { DuelService } from '../services/duel.service';
import { getWebviewContent } from './webview-content';

type PanelMode = 'daily' | 'practice' | 'duel-lobby' | 'duel-active';

export class ArenaPanel {
  private static current: ArenaPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

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
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'media')),
        ],
      },
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    this.loadMode(mode, duelToken);
  }

  // ── Static openers ────────────────────────────────────────────────────

  static openDaily(context: vscode.ExtensionContext, api: ApiService) {
    ArenaPanel.open(context, api, undefined, 'daily');
  }

  static openPractice(context: vscode.ExtensionContext, api: ApiService) {
    ArenaPanel.open(context, api, undefined, 'practice');
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
      ArenaPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      ArenaPanel.current.loadMode(mode, token);
    } else {
      ArenaPanel.current = new ArenaPanel(context, api, duel, mode, token);
    }
  }

  // ── Mode loader ───────────────────────────────────────────────────────

  private async loadMode(mode: PanelMode, duelToken?: string) {
    this.panel.webview.html = getWebviewContent(mode, this.panel.webview, this.context);

    switch (mode) {
      case 'daily': {
        const questions = await this.api.getDailySet();
        this.send('DAILY_LOADED', { questions });
        break;
      }
      case 'duel-active': {
        if (!this.duelSvc || !duelToken) break;
        const invite = await this.api.getDuelInvite(duelToken);
        this.send('DUEL_INVITE_LOADED', { invite });
        await this.duelSvc.connect();
        this.wireDuelEvents(invite.id);
        this.duelSvc.joinDuel(invite.id);
        break;
      }
    }
  }

  // ── Duel event wiring ─────────────────────────────────────────────────

  private duelUnsubs: Array<() => void> = [];

  private wireDuelEvents(roomId: string) {
    if (!this.duelSvc) return;
    const events = ['DUEL_READY', 'COUNTDOWN', 'QUESTION', 'SCORE_UPDATE', 'DUEL_END', 'PLAYER_DISCONNECTED'];
    for (const event of events) {
      const unsub = this.duelSvc.on(event, (data) => this.send(event, data));
      this.duelUnsubs.push(unsub);
    }
  }

  // ── Message handler (webview → extension) ─────────────────────────────

  private async handleMessage(msg: { type: string; payload?: any }) {
    switch (msg.type) {
      case 'SUBMIT_ANSWER': {
        const { roomId, questionId, choice, elapsedMs } = msg.payload;
        this.duelSvc?.submitAnswer(roomId, questionId, choice, elapsedMs);
        break;
      }

      case 'CREATE_DUEL': {
        const { topic, rounds } = msg.payload;
        await this.duelSvc?.connect();
        this.duelSvc?.on('DUEL_CREATED', (data) => {
          this.send('DUEL_CREATED', data);
          vscode.env.clipboard.writeText(data.inviteLink);
          vscode.window.showInformationMessage(
            '⚡ Duel invite link copied to clipboard!',
            'Share via browser',
          ).then((action) => {
            if (action) vscode.env.openExternal(vscode.Uri.parse(data.inviteLink));
          });
        });
        this.duelSvc?.createDuel(topic, rounds);
        break;
      }

      case 'SUBMIT_CODE': {
        const { questionId, language, code } = msg.payload;
        try {
          const result = await this.api.submitCode(questionId, language, code);
          this.send('EXECUTION_RESULT', result);
        } catch (e: any) {
          this.send('EXECUTION_ERROR', { message: e.message });
        }
        break;
      }

      case 'OPEN_DAILY':
        this.loadMode('daily');
        break;

      case 'OPEN_PRACTICE':
        this.loadMode('practice');
        break;

      case 'OPEN_DUEL_LOBBY':
        this.loadMode('duel-lobby');
        break;

      case 'QUESTION_TIMEOUT': {
        const { roomId, questionId } = msg.payload;
        this.duelSvc?.signalTimeout(roomId, questionId);
        break;
      }
    }
  }

  private send(type: string, payload?: any) {
    this.panel.webview.postMessage({ type, payload });
  }

  private dispose() {
    ArenaPanel.current = undefined;
    this.duelUnsubs.forEach((fn) => fn());
    this.duelSvc?.disconnect();
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

// Appended methods for weekly competition and rank profile views
// These patch onto the existing ArenaPanel class at module level
// by extending the static interface pattern already in place.
// In the compiled build, add these calls inside the class body.
// For now they are registered as module-level exports and wired
// in extension.ts via the static factory pattern.

export function openWeeklyPanel(
  context: vscode.ExtensionContext,
  api: ApiService,
) {
  // Re-uses ArenaPanel — mode is handled by message routing in webview
  (ArenaPanel as any).open(context, api, undefined, 'weekly');
}

export function openRankPanel(
  context: vscode.ExtensionContext,
  api: ApiService,
) {
  (ArenaPanel as any).open(context, api, undefined, 'rank');
}
