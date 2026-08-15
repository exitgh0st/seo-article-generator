import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './config/env.schema';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ArticlesModule } from './articles/articles.module';
import { ResearchModule } from './research/research.module';
import { PublishModule } from './publish/publish.module';
import { ToolsModule } from './tools/tools.module';
import { GenerationModule } from './generation/generation.module';
import { FeedsModule } from './feeds/feeds.module';
import { HealthModule } from './health/health.module';

const isProduction = process.env.NODE_ENV === 'production';
const defaultLogLevel = isProduction ? 'info' : 'debug';
const runtimeRequire = createRequire(__filename);

/**
 * Optionally loads pino-pretty for human-readable dev logs.
 * Returns undefined in production (standard JSON) or when pino-pretty is not installed.
 */
function resolveDevTransport() {
  if (isProduction) {
    return undefined;
  }

  try {
    return {
      target: runtimeRequire.resolve('pino-pretty'),
      options: {
        singleLine: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  } catch {
    // Keep local boot resilient when the optional pretty-printer package is not installed.
    console.warn(
      '[Logger] pino-pretty is not installed; falling back to standard pino logs.',
    );
    return undefined;
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? defaultLogLevel,
        transport: resolveDevTransport(),
        // Pass through an existing X-Request-ID from the client/proxy, or generate a fresh UUID.
        genReqId: (request: IncomingMessage, response: ServerResponse) => {
          const headerValue = request.headers['x-request-id'];
          const requestId = Array.isArray(headerValue)
            ? headerValue[0]
            : headerValue;

          if (requestId) {
            response.setHeader('x-request-id', requestId);
            return requestId;
          }

          const generatedId = randomUUID();
          response.setHeader('x-request-id', generatedId);
          return generatedId;
        },
      },
    }),
    // SentryModule is conditionally included so the app boots cleanly without a DSN in dev.
    ...(process.env.SENTRY_DSN ? [SentryModule.forRoot()] : []),
    ThrottlerModule.forRoot({
      errorMessage: 'Too many requests. Please try again in a moment.',
      throttlers: [{ ttl: 60_000, limit: 100 }],
    }),
    PrismaModule,
    AuthModule,
    ArticlesModule,
    ResearchModule,
    PublishModule,
    ToolsModule,
    GenerationModule,
    FeedsModule,
    HealthModule,
  ],
  providers: [
    // Guard order matters: ThrottlerGuard runs first (rate limit), then JwtAuthGuard (auth).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
