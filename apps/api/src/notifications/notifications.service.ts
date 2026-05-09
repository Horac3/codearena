// apps/api/src/notifications/notifications.service.ts
import { Injectable } from '@nestjs/common';
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

  async send(userId: string, payload: NotificationPayload): Promise<void> {
    await this.prisma.notification.create({
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
