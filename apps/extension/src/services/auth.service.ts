// apps/extension/src/services/auth.service.ts
import * as vscode from 'vscode';

const TOKEN_KEY = 'codearena.jwt';

export class AuthService {
  constructor(private context: vscode.ExtensionContext) {}

  async setToken(token: string): Promise<void> {
    // SecretStorage is encrypted on disk — safe for JWTs
    await this.context.secrets.store(TOKEN_KEY, token);
  }

  async getToken(): Promise<string | undefined> {
    return this.context.secrets.get(TOKEN_KEY);
  }

  async clearToken(): Promise<void> {
    await this.context.secrets.delete(TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    // Sync check using globalState flag (updated when token is set/cleared)
    return this.context.globalState.get<boolean>('codearena.authed', false);
  }

  async getAuthHeader(): Promise<Record<string, string>> {
    const token = await this.getToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }
}
