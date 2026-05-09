// apps/extension/src/extension.ts
import * as vscode from 'vscode';
import { AuthService }      from './services/auth.service';
import { ApiService }       from './services/api.service';
import { DuelService }      from './services/duel.service';
import { PomodoroService }  from './services/pomodoro.service';
import { ArenaPanel }       from './panels/arena.panel';
import { MenuProvider }     from './providers/menu.provider';
import { LeaderboardProvider } from './providers/leaderboard.provider';
import { StatusBarManager } from './utils/status-bar';

export function activate(context: vscode.ExtensionContext) {
  // ── Core services ──────────────────────────────────────────────────────
  const auth      = new AuthService(context);
  const api       = new ApiService(context, auth);
  const duel      = new DuelService(context, auth);
  const status    = new StatusBarManager(context, api);

  // Pomodoro — on break start, nudge the user toward Daily Blitz
  const pomodoro  = new PomodoroService(context, () => {
    if (auth.isAuthenticated()) {
      // onBreakStart: panel is opened automatically if autoPromptBlitz is true
      // (handled inside PomodoroService via showInformationMessage)
    }
  });

  // ── Sidebar providers ──────────────────────────────────────────────────
  const menuProvider        = new MenuProvider(auth);
  const leaderboardProvider = new LeaderboardProvider(api);

  vscode.window.registerTreeDataProvider('codearena.menu',        menuProvider);
  vscode.window.registerTreeDataProvider('codearena.leaderboard', leaderboardProvider);

  // ── URI handler — vscode://codearena.codearena/... ────────────────────
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri) {
        // Auth callback
        if (uri.path === '/auth') {
          const token = new URLSearchParams(uri.query).get('token');
          if (token) {
            await auth.setToken(token);
            await status.refresh();
            menuProvider.refresh();
            leaderboardProvider.refresh();
            vscode.window.showInformationMessage('⚡ CodeArena: Signed in! Ready to compete.');
          }
        }
        // Duel invite
        if (uri.path.startsWith('/duel/')) {
          const token = uri.path.replace('/duel/', '');
          if (!auth.isAuthenticated()) {
            vscode.window.showInformationMessage(
              '⚡ Sign in to accept this duel.', 'Sign in',
            ).then(a => { if (a) vscode.commands.executeCommand('codearena.login'); });
            return;
          }
          ArenaPanel.openDuel(context, api, duel, token);
        }
      },
    }),
  );

  // ── Commands ──────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('codearena.openDaily', () => {
      if (!auth.isAuthenticated()) { promptLogin(); return; }
      ArenaPanel.openDaily(context, api);
    }),

    vscode.commands.registerCommand('codearena.openDuel', () => {
      if (!auth.isAuthenticated()) { promptLogin(); return; }
      ArenaPanel.openDuelLobby(context, api, duel);
    }),

    vscode.commands.registerCommand('codearena.openPractice', () => {
      if (!auth.isAuthenticated()) { promptLogin(); return; }
      ArenaPanel.openPractice(context, api);
    }),

    vscode.commands.registerCommand('codearena.openWeekly', () => {
      if (!auth.isAuthenticated()) { promptLogin(); return; }
      ArenaPanel.openWeekly(context, api);
    }),

    vscode.commands.registerCommand('codearena.openRank', () => {
      if (!auth.isAuthenticated()) { promptLogin(); return; }
      ArenaPanel.openRank(context, api);
    }),

    vscode.commands.registerCommand('codearena.login', () => {
      const apiUrl = vscode.workspace
        .getConfiguration('codearena')
        .get<string>('apiUrl', 'https://api.codearena.dev');
      vscode.env.openExternal(vscode.Uri.parse(`${apiUrl}/auth/github`));
    }),

    vscode.commands.registerCommand('codearena.logout', async () => {
      await auth.clearToken();
      status.refresh();
      menuProvider.refresh();
      vscode.window.showInformationMessage('CodeArena: Signed out.');
    }),

    // Pomodoro controls
    vscode.commands.registerCommand('codearena.pomodoroControl', () => {
      const state = pomodoro.getState();
      if (state.phase === 'idle') {
        pomodoro.start();
      } else {
        vscode.window.showQuickPick(
          ['⏸ Pause', '▶ Resume', '⏹ Reset', '⚙ Settings'],
          { placeHolder: 'Pomodoro control' },
        ).then(choice => {
          if (!choice) return;
          if (choice.includes('Pause'))   pomodoro.pause();
          if (choice.includes('Resume'))  pomodoro.resume();
          if (choice.includes('Reset'))   pomodoro.reset();
          if (choice.includes('Settings')) openPomodoroSettings(pomodoro);
        });
      }
    }),

    vscode.commands.registerCommand('codearena.pomodoroStart', () => pomodoro.start()),
    vscode.commands.registerCommand('codearena.pomodoroReset', () => pomodoro.reset()),
  );

  // Auto-refresh if already authenticated
  if (auth.isAuthenticated()) {
    status.refresh();
    leaderboardProvider.refresh();
  }
}

export function deactivate() {}

function promptLogin() {
  vscode.window.showInformationMessage(
    '⚡ CodeArena: Sign in to start competing.', 'Sign in with GitHub',
  ).then(a => { if (a) vscode.commands.executeCommand('codearena.login'); });
}

function openPomodoroSettings(pomodoro: PomodoroService) {
  const settings = pomodoro.getSettings();
  vscode.window.showInputBox({
    prompt: 'Work session duration (minutes)',
    value:  String(settings.workMinutes),
    validateInput: v => (isNaN(Number(v)) || Number(v) < 1) ? 'Enter a number > 0' : undefined,
  }).then(val => {
    if (val) pomodoro.updateSettings({ workMinutes: Number(val) });
  });
}
