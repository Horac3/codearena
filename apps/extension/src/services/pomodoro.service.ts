// apps/extension/src/services/pomodoro.service.ts
// The Pomodoro timer lives entirely client-side in the extension.
// All state is stored in VS Code globalState — no API calls, works offline.
// Settings are cached locally so they never add server load.

import * as vscode from 'vscode';

export type PomodoroPhase = 'work' | 'break' | 'long-break' | 'idle';

export interface PomodoroSettings {
  workMinutes: number;       // default 25
  breakMinutes: number;      // default 5
  longBreakMinutes: number;  // default 15
  cyclesBeforeLong: number;  // default 4
  autoPromptBlitz: boolean;  // show Daily Blitz on break start
}

export interface PomodoroState {
  phase: PomodoroPhase;
  secondsRemaining: number;
  cyclesCompleted: number;
  settings: PomodoroSettings;
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes:       25,
  breakMinutes:      5,
  longBreakMinutes:  15,
  cyclesBeforeLong:  4,
  autoPromptBlitz:   true,
};

const STATE_KEY    = 'codearena.pomodoro.state';
const SETTINGS_KEY = 'codearena.pomodoro.settings';

export class PomodoroService {
  private timer: ReturnType<typeof setInterval> | undefined;
  private statusBar: vscode.StatusBarItem;
  private onBreakStart?: () => void;

  constructor(
    private context: vscode.ExtensionContext,
    onBreakStart?: () => void,
  ) {
    this.onBreakStart = onBreakStart;
    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99,
    );
    this.statusBar.command = 'codearena.pomodoroControl';
    context.subscriptions.push(this.statusBar);
    this.render();
  }

  // ── Public API ────────────────────────────────────────────────────────

  start() {
    const state = this.getState();
    if (state.phase !== 'idle') return; // already running

    this.setState({ ...state, phase: 'work', secondsRemaining: state.settings.workMinutes * 60 });
    this.tick();
    this.render();
  }

  pause() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.render();
  }

  resume() {
    if (this.timer) return;
    this.tick();
  }

  reset() {
    clearInterval(this.timer);
    this.timer = undefined;
    const settings = this.getSettings();
    this.setState({
      phase:            'idle',
      secondsRemaining: settings.workMinutes * 60,
      cyclesCompleted:  0,
      settings,
    });
    this.render();
  }

  updateSettings(partial: Partial<PomodoroSettings>) {
    const current = this.getSettings();
    const updated = { ...current, ...partial };
    this.context.globalState.update(SETTINGS_KEY, updated);
    // If idle, update the displayed time too
    const state = this.getState();
    if (state.phase === 'idle') {
      this.setState({ ...state, settings: updated, secondsRemaining: updated.workMinutes * 60 });
    }
    this.render();
    return updated;
  }

  getSettings(): PomodoroSettings {
    return this.context.globalState.get<PomodoroSettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
  }

  getState(): PomodoroState {
    return this.context.globalState.get<PomodoroState>(STATE_KEY) ?? {
      phase:            'idle',
      secondsRemaining: this.getSettings().workMinutes * 60,
      cyclesCompleted:  0,
      settings:         this.getSettings(),
    };
  }

  // ── Timer tick ────────────────────────────────────────────────────────

  private tick() {
    this.timer = setInterval(() => {
      const state = this.getState();
      if (state.secondsRemaining <= 1) {
        clearInterval(this.timer);
        this.timer = undefined;
        this.advance(state);
        return;
      }
      this.setState({ ...state, secondsRemaining: state.secondsRemaining - 1 });
      this.render();
    }, 1000);
  }

  private advance(state: PomodoroState) {
    const settings = state.settings;

    if (state.phase === 'work') {
      const cycles = state.cyclesCompleted + 1;
      const isLong = cycles % settings.cyclesBeforeLong === 0;
      const nextPhase: PomodoroPhase = isLong ? 'long-break' : 'break';
      const nextSecs = isLong
        ? settings.longBreakMinutes * 60
        : settings.breakMinutes * 60;

      this.setState({
        ...state,
        phase:            nextPhase,
        secondsRemaining: nextSecs,
        cyclesCompleted:  cycles,
      });

      // Notify the user and optionally prompt Daily Blitz
      vscode.window.showInformationMessage(
        `⚡ Work session complete! ${isLong ? 'Long break' : 'Short break'} time.`,
        ...(settings.autoPromptBlitz ? ['Open Daily Blitz'] : []),
      ).then(action => {
        if (action === 'Open Daily Blitz') {
          vscode.commands.executeCommand('codearena.openDaily');
        }
      });

      if (this.onBreakStart) this.onBreakStart();
      this.tick();

    } else {
      // Break ended — back to work
      this.setState({
        ...state,
        phase:            'work',
        secondsRemaining: settings.workMinutes * 60,
      });

      vscode.window.showInformationMessage(
        '⚡ Break over — back to work!',
        'Start session',
      );

      this.tick();
    }

    this.render();
  }

  // ── Status bar rendering ──────────────────────────────────────────────

  private render() {
    const state = this.getState();
    const mins  = Math.floor(state.secondsRemaining / 60);
    const secs  = state.secondsRemaining % 60;
    const time  = `${mins}:${String(secs).padStart(2, '0')}`;

    const icons: Record<PomodoroPhase, string> = {
      work:       '🍅',
      break:      '☕',
      'long-break': '🌿',
      idle:       '⏸',
    };

    const running = !!this.timer;
    const icon    = icons[state.phase];

    this.statusBar.text    = `${icon} ${time}`;
    this.statusBar.tooltip = this.buildTooltip(state, running);
    this.statusBar.show();
  }

  private buildTooltip(state: PomodoroState, running: boolean): string {
    const phase = {
      work:         'Work session',
      break:        'Short break',
      'long-break': 'Long break',
      idle:         'Idle',
    }[state.phase];

    return [
      `CodeArena Pomodoro — ${phase}`,
      `Cycles completed: ${state.cyclesCompleted}`,
      running ? 'Click to pause' : 'Click to start/resume',
    ].join('\n');
  }

  private setState(state: PomodoroState) {
    this.context.globalState.update(STATE_KEY, state);
  }
}
