import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as Sentry from '@sentry/nestjs';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import express from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { Env } from './config/env.schema';

async function bootstrap() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
    });
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService<Env, true>);

  app.enableShutdownHooks();
  app.useLogger(app.get(Logger));

  // Required behind a reverse proxy (Render, Railway, etc.) so req.ip and rate-limiting see the real client IP.
  app.set('trust proxy', true);

  app.use(
    helmet({
      // CSP is managed by the Angular frontend; disabling here avoids conflicts with the API.
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    compression({
      // No route emits server-sent events today — the generation UI polls
      // instead. The filter stays because it costs nothing and the failure it
      // prevents is silent: compression() holds bytes back waiting for a flush,
      // which turns a stream into one blob delivered at the end, and whoever
      // adds the first SSE route would debug that from scratch.
      filter: (req, res) =>
        res.getHeader('Content-Type') !== 'text/event-stream' &&
        compression.filter(req, res),
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.enableCors({
    origin: config
      .get('ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  });

  app.setGlobalPrefix('api', {
    // Crawler-facing files must sit at the site root, not under /api.
    exclude: ['sitemap.xml', 'rss.xml', 'robots.txt'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not declared in the DTO
      forbidNonWhitelisted: true, // Reject requests with extra unknown fields
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new LoggerErrorInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SEO Article Generator API')
    .setDescription(
      'Research briefs, article generation, SEO scoring, and publication.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Swagger UI is only exposed in non-production environments.
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
