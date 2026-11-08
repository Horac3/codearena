// apps/extension/src/services/auth.service.ts
import * as vscode from 'vscode';
import { randomBytes } from 'crypto';

const TOKEN_KEY = 'codearena.jwt';
const STATE_KEY = 'codearena.oauthState';
const STATE_TTL_MS = 10 * 60 * 1000;

export class AuthService {
  constructor(private context: vscode.ExtensionContext) {}

  /** Start a sign-in: a random state that the auth callback must bring back. */
  async beginLogin(): Promise<string> {
    const state = randomBytes(32).toString('hex');
    await this.context.globalState.update(STATE_KEY, { state, createdAt: Date.now() });
    return state;
  }

  /**
   * Accept a token from the vscode:// callback only if it carries the state this extension
   * generated (single use, 10 minutes). This stops any web page from opening the auth link
   * with an attacker's token and silently signing the user into the attacker's account.
   */
  async completeLogin(token: string, state: string | null): Promise<boolean> {
    const pending = this.context.globalState.get<{ state: string; createdAt: number }>(STATE_KEY);
    await this.context.globalState.update(STATE_KEY, undefined);
    if (!pending || !state || pending.state !== state || Date.now() - pending.createdAt > STATE_TTL_MS) {
      return false;
    }
    await this.setToken(token);
    return true;
  }

  async setToken(token: string): Promise<void> {
    // SecretStorage is encrypted on disk — safe for JWTs
    await this.context.secrets.store(TOKEN_KEY, token);
    await this.context.globalState.update('codearena.authed', true);
  }

  async getToken(): Promise<string | undefined> {
    return this.context.secrets.get(TOKEN_KEY);
  }

  async clearToken(): Promise<void> {
    await this.context.secrets.delete(TOKEN_KEY);
    await this.context.globalState.update('codearena.authed', false);
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
