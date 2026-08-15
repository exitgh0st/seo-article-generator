import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AuthService } from './auth.service';
import type { AuthenticatedUser, JwtPayload } from './jwt.strategy';
import type { Env } from '../config/env.schema';

/**
 * Populates `request.user` when a valid bearer token is present, and does nothing
 * when it is absent or invalid.
 *
 * `@Public()` makes JwtAuthGuard skip a route entirely, so Passport never runs and
 * `request.user` is never set. The article read routes need to be reachable
 * anonymously *and* to widen their result set for the operator — a public route
 * that can still recognise its owner. This middleware is that seam.
 *
 * It deliberately never rejects. Authorization on these routes is the service's
 * status filter, not this middleware; a bad token simply means "anonymous".
 */
@Injectable()
export class OptionalJwtMiddleware implements NestMiddleware {
  private readonly secret: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  async use(req: Request, _res: Response, next: NextFunction) {
    const header = req.headers.authorization;

    if (header?.startsWith('Bearer ')) {
      try {
        const payload = this.jwt.verify<JwtPayload>(header.slice(7), {
          secret: this.secret,
          algorithms: ['HS256'],
        });
        // Same freshness check the strategy makes. Without it a token revoked by
        // a password change would still widen these reads to include drafts,
        // which is most of what the operator's session is worth.
        await this.auth.assertTokenFresh(payload);
        (req as Request & { user?: AuthenticatedUser }).user = {
          userId: payload.sub,
        };
      } catch {
        // Expired, revoked or forged — treat the caller as anonymous.
      }
    }

    next();
  }
}
