// apps/extension/src/services/api.service.ts
import * as vscode from 'vscode';
import { AuthService } from './auth.service';

export class ApiService {
  constructor(
    private context: vscode.ExtensionContext,
    private auth: AuthService,
  ) {}

  private get baseUrl(): string {
    return vscode.workspace
      .getConfiguration('codearena')
      .get<string>('apiUrl', 'https://api.codearena.never9to5ive.com');
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = await this.auth.getAuthHeader();
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...headers, ...options.headers },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Daily set — cache for 24h in globalState ──────────────────────────

  async getDailySet(): Promise<any[]> {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `daily:${today}`;
    const cached = this.context.globalState.get<any[]>(cacheKey);
    if (cached) return cached;

    const fresh = await this.fetch<any[]>('/questions/daily');
    await this.context.globalState.update(cacheKey, fresh);
    return fresh;
  }

  // ── User ──────────────────────────────────────────────────────────────

  async getMe(): Promise<any> {
    return this.fetch('/users/me');
  }

  // ── Leaderboard ───────────────────────────────────────────────────────

  async getLeaderboard(): Promise<any[]> {
    return this.fetch('/leaderboard/weekly');
  }

  // ── Duel invite ───────────────────────────────────────────────────────

  async getDuelInvite(token: string): Promise<any> {
    return this.fetch(`/duels/invite/${token}`);
  }

  // ── Code execution ────────────────────────────────────────────────────

  async submitCode(questionId: string, language: string, code: string): Promise<any> {
    return this.fetch('/execute', {
      method: 'POST',
      body: JSON.stringify({ questionId, language, code }),
    });
  }
}
