import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../config/env.schema';

export interface AuthenticatedUser {
  userId: string;
}

export interface JwtPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

/**
 * Verifies tokens this API issued itself (HS256 over JWT_SECRET).
 *
 * budgetwise-api verifies Supabase-issued ES256 tokens against a JWKS endpoint
 * because it is genuinely multi-user. This tool has one operator, so a Supabase
 * project would be infrastructure bought for nothing. If it ever grows real
 * accounts, lifting budgetwise's jwt.strategy.ts is the migration.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return { userId: payload.sub };
  }
}
