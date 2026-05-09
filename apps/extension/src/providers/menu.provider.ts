// apps/extension/src/providers/menu.provider.ts
import * as vscode from 'vscode';
import { AuthService } from '../services/auth.service';

export class MenuProvider implements vscode.TreeDataProvider<MenuItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MenuItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private auth: AuthService) {}

  refresh() { this._onDidChangeTreeData.fire(undefined); }

  getTreeItem(el: MenuItem) { return el; }

  getChildren(): MenuItem[] {
    if (!this.auth.isAuthenticated()) {
      return [
        new MenuItem('Sign in with GitHub', 'codearena.login', 'account', 'signin'),
      ];
    }

    return [
      new MenuItem('Daily Blitz',   'codearena.openDaily',    'flame',          'daily'),
      new MenuItem('Duel Mode',     'codearena.openDuel',     'sword',          'duel'),
      new MenuItem('Practice',      'codearena.openPractice', 'book',           'practice'),
      new MenuItem('Sign out',      'codearena.logout',       'sign-out',       'signout'),
    ];
  }
}

class MenuItem extends vscode.TreeItem {
  constructor(
    label: string,
    command: string,
    icon: string,
    public readonly itemId: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = { command, title: label };
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}
