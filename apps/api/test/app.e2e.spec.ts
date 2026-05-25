// Basic app bootstrap integration test.
// Verifies the NestJS application module compiles and connects to
// the test database and Redis. This is the minimal smoke-test for
// the entire dependency injection graph.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AppModule (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('app module compiles and boots', () => {
    expect(app).toBeDefined();
  });

  it('connects to the test database', async () => {
    // A raw query verifies the DB connection is alive
    const result: any = await prisma.$queryRaw`SELECT 1 as ok`;
    expect(result[0]?.ok).toBe(1);
  });

  it('Prisma models are queryable', async () => {
    // Verify the User model exists (table should be empty)
    const count = await prisma.user.count();
    expect(typeof count).toBe('number');
    expect(count).toBe(0);
  });
});
