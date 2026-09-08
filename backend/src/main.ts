import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Only the real frontend can call this API — not "any origin", now that
  // this is heading toward a real deployment with real money moving through it.
  app.enableCors({ origin: process.env.FRONTEND_URL });

  // Strips unknown fields and rejects invalid ones on every DTO, automatically.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Orange Health Ajo API running on port ${port}`);
}
bootstrap();
