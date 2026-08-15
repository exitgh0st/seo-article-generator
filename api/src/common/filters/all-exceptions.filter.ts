import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Response } from 'express';

/**
 * Catches every unhandled exception across the application.
 *
 * - NestJS `HttpException` → pass the original status and body through as-is.
 * - Unhandled errors → log, report to Sentry, and return 500.
 *   In production the stack trace is stripped from the response to avoid leaking internals.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const isProd = process.env.NODE_ENV === 'production';

    // An SSE response has already committed its headers and status. Writing a
    // JSON body onto the stream would corrupt the frame the client is parsing,
    // so surface the failure as a final `error` event and close instead.
    if (response.headersSent) {
      const message =
        exception instanceof Error ? exception.message : String(exception);
      this.logger.error(`Exception after headers sent: ${message}`);
      if (!isProd) {
        this.logger.error(
          exception instanceof Error ? (exception.stack ?? '') : '',
        );
      }
      if (Sentry.isEnabled()) {
        Sentry.captureException(exception);
      }
      try {
        response.write(
          `event: error\ndata: ${JSON.stringify({
            message: isProd ? 'Internal server error' : message,
          })}\n\n`,
        );
      } catch {
        // The socket is already gone; nothing further to do.
      }
      response.end();
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      this.logger.warn(
        `HttpException ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`,
      );
      if (exception.stack) {
        this.logger.warn(exception.stack);
      }

      // Normalize string responses to the standard { statusCode, message } shape
      response.status(status).json(
        typeof body === 'string'
          ? {
              statusCode: status,
              message: body,
            }
          : body,
      );
      return;
    }

    const errorMessage =
      exception instanceof Error ? exception.message : String(exception);
    const errorStack = exception instanceof Error ? exception.stack : undefined;

    if (Sentry.isEnabled()) {
      Sentry.captureException(exception);
    }

    this.logger.error('Unhandled exception', errorStack ?? errorMessage);

    // Hide stack trace and raw error message in production to avoid information leakage
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
      isProd
        ? {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Internal server error',
          }
        : {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: errorMessage,
            ...(errorStack ? { stack: errorStack } : {}),
          },
    );
  }
}
