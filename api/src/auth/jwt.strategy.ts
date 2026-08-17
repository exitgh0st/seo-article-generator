import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';
import type { Env } from '../config/env.schema';

export interface AuthenticatedUser {
  userId: string;
  /** The token's `exp` claim, in seconds. Surfaced by GET /auth/me so the
   *  settings screen can say when this session ends without decoding the JWT. */
  expiresAt?: number;
}

export interface JwtPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

/**
 * Verifies tokens this API issued itself (HS256 over JWT_SECRET), then checks
 * them against the password's last change.
 *
 * The second half is not decoration. Tokens are stateless and last seven days, so
 * without it changing the password would leave every session already open still
 * working — including the one on the device the change was meant to lock out.
 * `AuthService.assertTokenFresh` compares the `iat` claim against
 * AdminCredential.passwordChangedAt and rejects anything older.
 *
 * budgetwise-api verifies Supabase-issued ES256 tokens against a JWKS endpoint
 * because it is genuinely multi-user. This tool has one operator, so a Supabase
 * project would be infrastructure bought for nothing. If it ever grows real
 * accounts, lifting budgetwise's jwt.strategy.ts is the migration.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Env, true>,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    await this.auth.assertTokenFresh(payload);
    return { userId: payload.sub, expiresAt: payload.exp };
  }
}
