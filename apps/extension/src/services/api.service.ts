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
      throw new Error(await errorMessage(res));
    }
    return res.json() as Promise<T>;
  }

  // ── Daily set — cached for the (UTC) day in globalState ─────────────────

  async getDailySet(): Promise<any[]> {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `daily:${today}`;
    const cached = this.context.globalState.get<any[]>(cacheKey);
    if (cached && cached.length > 0) return cached;

    const fresh = await this.fetch<any[]>('/questions/daily');
    await this.context.globalState.update(cacheKey, fresh);
    return fresh;
  }

  /** The server scores the answers and returns the correct ones with explanations. */
  async submitDaily(answers: Record<string, number>): Promise<any> {
    return this.fetch('/questions/daily/submit', {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });
  }

  // ── Weekly competition ────────────────────────────────────────────────

  async getWeekly(): Promise<any> {
    return this.fetch('/weekly/active');
  }

  async submitWeekly(answers: Record<string, number>): Promise<any> {
    return this.fetch('/weekly/submit', {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });
  }

  // ── User ──────────────────────────────────────────────────────────────

  async getMe(): Promise<any> {
    return this.fetch('/users/me');
  }

  async getRank(): Promise<any> {
    return this.fetch('/users/me/rank');
  }

  // ── Leaderboard ───────────────────────────────────────────────────────

  async getLeaderboard(): Promise<any[]> {
    return this.fetch('/leaderboard/weekly');
  }

  // ── Code execution (queued on the server; poll until it finishes) ──────

  async submitCode(questionId: string, language: string, code: string): Promise<any> {
    const { jobId } = await this.fetch<{ jobId: string }>('/execute', {
      method: 'POST',
      body: JSON.stringify({ questionId, language, code }),
    });

    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const job = await this.fetch<{ completed: boolean; status: string; result?: any }>(`/execute/${jobId}`);
      if (!job.completed) continue;
      if (job.status === 'failed') throw new Error(job.result?.error ?? 'Execution failed');
      return job.result;
    }
    throw new Error('Timed out waiting for the code runner');
  }
}

async function errorMessage(res: Response): Promise<string> {
  const body = await res.text();
  try {
    const parsed = JSON.parse(body);
    const msg = Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message;
    if (msg) return String(msg);
  } catch {
    /* not JSON */
  }
  return `API error ${res.status}`;
}
