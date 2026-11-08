// apps/api/src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

export function checkJwtSecret(env: NodeJS.ProcessEnv): string | null {
  const secret = env.JWT_SECRET;
  if (secret && secret.length >= 32) return null;
  return 'JWT_SECRET is missing or shorter than 32 characters. Generate one with: openssl rand -hex 64';
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const production = process.env.NODE_ENV === 'production';

  // A weak secret lets anyone mint tokens for any user, so production refuses to start.
  const secretProblem = checkJwtSecret(process.env);
  if (secretProblem) {
    if (production) {
      logger.error(secretProblem);
      process.exit(1);
    }
    logger.warn(secretProblem);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  // Behind nginx: use X-Forwarded-For for the client IP (rate limiting)
  app.set('trust proxy', 1);
  // Small request bodies: the largest legitimate payload is a code submission (≤ 20k chars)
  app.useBodyParser('json', { limit: '64kb' });
  app.useBodyParser('urlencoded', { limit: '16kb', extended: false });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  });

  // API docs are for development; set SWAGGER_ENABLED=true to expose them in production.
  const swagger = !production || process.env.SWAGGER_ENABLED === 'true';
  if (swagger) {
    const config = new DocumentBuilder()
      .setTitle('CodeArena API')
      .setDescription('REST + WebSocket backend for the CodeArena VS Code extension')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`CodeArena API running on :${port}`);
  if (swagger) logger.log(`Swagger docs at http://localhost:${port}/docs`);
}

if (require.main === module) bootstrap();
