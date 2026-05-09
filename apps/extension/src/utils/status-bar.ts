// apps/extension/src/utils/status-bar.ts
import * as vscode from 'vscode';
import { ApiService } from '../services/api.service';

export class StatusBarManager {
  private item: vscode.StatusBarItem;

  constructor(
    private context: vscode.ExtensionContext,
    private api: ApiService,
  ) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.command = 'codearena.openDaily';
    this.item.tooltip = 'CodeArena — click to open Daily Blitz';
    context.subscriptions.push(this.item);
  }

  async refresh() {
    const show = vscode.workspace
      .getConfiguration('codearena')
      .get<boolean>('showStatusBar', true);

    if (!show) { this.item.hide(); return; }

    try {
      const me = await this.api.getMe();
      this.item.text = `⚡ 🔥${me.streak}  #${me.level}`;
      this.item.show();
    } catch {
      this.item.hide();
    }
  }
}
