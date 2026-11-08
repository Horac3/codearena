// apps/api/src/notifications/notifications.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface NotificationPayload {
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Store a notification and publish it to connected clients.
   * Pass `db` when calling from inside a transaction so the row is written on the same
   * connection (a second connection could block on the transaction's row locks).
   */
  async send(
    userId: string,
    payload: NotificationPayload,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await db.notification.create({
      data: { userId, ...payload },
    });
    // Pub/sub so connected WebSocket clients get it in real time
    await this.redis.redis.publish(
      `notifications:${userId}`,
      JSON.stringify(payload),
    );
  }

  async getUnread(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId, read: false },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async markRead(userId: string, notificationId: string) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }
}
