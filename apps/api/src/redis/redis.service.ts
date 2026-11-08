// apps/api/src/redis/redis.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis(this.config.get<string>('REDIS_URL', 'redis://localhost:6379'), {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error', err));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  get redis(): Redis {
    return this.client;
  }

  // ── Convenience helpers ──────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Take a short-lived lock (SET NX EX). Returns true for exactly one caller until it expires.
   * Used so crons do their work once even when several API instances run them.
   */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const ok = await this.client.set(`lock:${key}`, '1', 'EX', ttlSeconds, 'NX');
    return ok === 'OK';
  }

  /** Connection options for BullMQ, derived from the same REDIS_URL as this client. */
  bullConnection() {
    return redisConnectionOptions(this.config.get<string>('REDIS_URL', 'redis://localhost:6379'));
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }
}

export function redisConnectionOptions(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.pathname && u.pathname !== '/' ? { db: Number(u.pathname.slice(1)) || 0 } : {}),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
