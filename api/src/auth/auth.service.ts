import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { Env } from '../config/env.schema';

export interface LoginResult {
  token: string;
  /** Seconds until the token expires. */
  expiresIn: number;
}

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Single-operator authentication. One password, hashed in the environment, traded
 * for a JWT this API signs and verifies itself.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly passwordHash: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.passwordHash = config.getOrThrow<string>('ADMIN_PASSWORD_HASH');
  }

  async login(password: string): Promise<LoginResult> {
    const ok = await bcrypt.compare(password, this.passwordHash);

    if (!ok) {
      // Logged without the attempted value. Rate limiting is handled by the
      // global ThrottlerGuard.
      this.logger.warn('Failed login attempt');
      throw new UnauthorizedException('Incorrect password');
    }

    const token = await this.jwt.signAsync(
      { sub: 'admin' },
      { expiresIn: TOKEN_TTL_SECONDS },
    );

    return { token, expiresIn: TOKEN_TTL_SECONDS };
  }
}
