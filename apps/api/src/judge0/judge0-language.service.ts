// apps/api/src/judge0/judge0-language.service.ts
// Fetches Judge0 /languages at startup and caches the ID map.
// Falls back to hardcoded defaults if Judge0 is unreachable.

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const FALLBACK_MAP: Record<string, number> = {
  javascript: 93,
  typescript: 94,
  python: 71,
  go: 95,
};

interface Judge0Language {
  id: number;
  name: string;
}

@Injectable()
export class Judge0LanguageService implements OnModuleInit {
  private readonly logger = new Logger(Judge0LanguageService.name);
  private languageMap: Record<string, number> = { ...FALLBACK_MAP };
  private resolved = false;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    try {
      this.languageMap = await this.fetchLanguages();
      this.resolved = true;
      this.logger.log(`Resolved ${Object.keys(this.languageMap).length} Judge0 language IDs from /languages`);
    } catch (e: any) {
      this.logger.warn(
        `Could not fetch Judge0 /languages (${e.message || e}). Using fallback IDs. ` +
        `Set JUDGE0_URL if Judge0 is running.`,
      );
    }
  }

  resolve(language: string): number {
    const id = this.languageMap[language];
    if (id === undefined) {
      throw new Error(`Language "${language}" not found in Judge0 language map`);
    }
    return id;
  }

  isResolved(): boolean {
    return this.resolved;
  }

  private async fetchLanguages(): Promise<Record<string, number>> {
    const baseUrl = this.config.get<string>('JUDGE0_URL', 'http://judge0:2358');
    const token = this.config.get<string>('JUDGE0_AUTH_TOKEN');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${baseUrl}/languages`, { headers, signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      throw new Error(`Judge0 /languages returned ${response.status}: ${response.statusText}`);
    }

    const languages = (await response.json()) as Judge0Language[];
    const map: Record<string, number> = {};

    for (const entry of languages) {
      const name = entry.name.toLowerCase();

      if (name.includes('javascript')) {
        if (name.includes('node')) continue;
        if (!map['javascript']) map['javascript'] = entry.id;
      }
      if (name.includes('typescript')) {
        if (!map['typescript']) map['typescript'] = entry.id;
      }
      if (name.startsWith('python') || name.startsWith('python3')) {
        if (name.includes('python2')) continue;
        if (!map['python']) map['python'] = entry.id;
      }
      if (name.startsWith('go')) {
        if (!map['go']) map['go'] = entry.id;
      }
      if (name.includes('java')) {
        if (name.includes('java 8') || name.includes('java 11')) continue;
        if (!map['java']) map['java'] = entry.id;
      }
    }

    if (Object.keys(map).length === 0) {
      throw new Error('Zero languages resolved from Judge0 /languages response');
    }

    return map;
  }
}
