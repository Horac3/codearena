// apps/extension/src/providers/leaderboard.provider.ts
import * as vscode from 'vscode';
import { ApiService } from '../services/api.service';

export class LeaderboardProvider implements vscode.TreeDataProvider<LeaderboardItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<LeaderboardItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private entries: any[] = [];

  constructor(private api: ApiService) {}

  async refresh() {
    try {
      this.entries = await this.api.getLeaderboard();
    } catch {
      this.entries = [];
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(el: LeaderboardItem) { return el; }

  getChildren(): LeaderboardItem[] {
    if (this.entries.length === 0) {
      const item = new vscode.TreeItem('Sign in to view rankings');
      item.iconPath = new vscode.ThemeIcon('info');
      return [item as any];
    }
    return this.entries.slice(0, 10).map((e) => new LeaderboardItem(e));
  }
}

class LeaderboardItem extends vscode.TreeItem {
  constructor(entry: any) {
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[entry.rank - 1] ?? `#${entry.rank}`;
    super(`${medal} ${entry.username}`, vscode.TreeItemCollapsibleState.None);
    this.description = `${entry.weeklyXp} XP · 🔥${entry.streak}`;
    this.tooltip = `Level ${entry.level} · ${entry.weeklyXp} weekly XP`;
    this.iconPath = new vscode.ThemeIcon('account');
  }
}
