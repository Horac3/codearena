// Global test setup — runs once before all integration tests.
// Sets environment variables pointing at the test Docker containers
// and ensures the test database has the latest schema.

import { execSync } from 'child_process';

export default async function setup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3001';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    'postgresql://codearena:testpassword@localhost:5433/codearena_test';
  process.env.REDIS_URL =
    process.env.TEST_REDIS_URL || 'redis://localhost:6380';
  process.env.QUESTIONS_DIR =
    process.env.TEST_QUESTIONS_DIR ||
    require('path').join(__dirname, '../../../questions');
  process.env.JUDGE0_URL = process.env.JUDGE0_URL || 'http://localhost:3099';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use';

  // Run Prisma migrations on the test database
  try {
    execSync('npx prisma migrate deploy --schema=./prisma/schema.prisma', {
      cwd: require('path').join(__dirname, '..'),
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      timeout: 30_000,
    });
  } catch (err: any) {
    // If migration deploy fails (e.g. first time), try db push instead
    try {
      execSync(
        'npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss',
        {
          cwd: require('path').join(__dirname, '..'),
          stdio: 'pipe',
          env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
          timeout: 30_000,
        },
      );
    } catch (pushErr: any) {
      console.error(
        'Failed to sync test database schema. Is docker-compose.test.yml running?',
      );
      console.error(pushErr.stderr?.toString() || pushErr.message);
      throw pushErr;
    }
  }
}
