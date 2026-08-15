import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { AdminCredential } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env.schema';
import type { JwtPayload } from './jwt.strategy';

export interface LoginResult {
  token: string;
  /** Seconds until the token expires. */
  expiresIn: number;
}

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Matches scripts/hash-password.mjs. Changing one means changing the other. */
export const BCRYPT_COST = 12;

/** The single row. There is one operator, so there is one credential. */
const CREDENTIAL_ID = 1;

/**
 * Single-operator authentication. One password, traded for a JWT this API signs
 * and verifies itself.
 *
 * The password used to be read straight out of `ADMIN_PASSWORD_HASH` and cached
 * in a field. It now lives in the AdminCredential row so it can be changed from
 * the app; the environment variable seeds that row the first time it is read and
 * is ignored afterwards.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly seedHash: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.seedHash = config.getOrThrow<string>('ADMIN_PASSWORD_HASH');
  }

  async login(password: string): Promise<LoginResult> {
    const credential = await this.credential();
    const ok = await bcrypt.compare(password, credential.passwordHash);

    if (!ok) {
      // Logged without the attempted value. Rate limiting is handled by the
      // global ThrottlerGuard.
      this.logger.warn('Failed login attempt');
      throw new UnauthorizedException('Incorrect password');
    }

    return this.issue();
  }

  /**
   * Replaces the password and returns a token to carry on with, so the operator
   * who made the change is not signed out by it. Every other token is.
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<LoginResult> {
    const credential = await this.credential();
    const ok = await bcrypt.compare(currentPassword, credential.passwordHash);

    if (!ok) {
      this.logger.warn('Failed password change: current password did not match');
      // Deliberately a 400, not a 401. The app's HTTP interceptor signs the
      // operator out and redirects to /login on any 401 carrying a token, so a
      // 401 here would end the session over a typo in a form field.
      throw new BadRequestException('The current password is not correct');
    }

    if (newPassword === currentPassword) {
      throw new BadRequestException(
        'The new password is the same as the current one',
      );
    }

    await this.prisma.adminCredential.update({
      where: { id: CREDENTIAL_ID },
      data: {
        passwordHash: await bcrypt.hash(newPassword, BCRYPT_COST),
        passwordChangedAt: new Date(),
      },
    });

    this.logger.log('Admin password changed; existing tokens invalidated');

    return this.issue();
  }

  /**
   * Rejects a token issued before the password last changed. Called by
   * JwtStrategy on every authenticated request, which is what makes a password
   * change sign out other devices — tokens are stateless and carry no session to
   * revoke.
   */
  async assertTokenFresh(payload: JwtPayload): Promise<void> {
    const { passwordChangedAt } = await this.credential();
    const changedAt = Math.floor(passwordChangedAt.getTime() / 1000);

    // Strictly less than: `iat` has second resolution, so the token minted by the
    // change itself shares a second with it and must survive.
    if (payload.iat === undefined || payload.iat < changedAt) {
      throw new UnauthorizedException('Token issued before the password changed');
    }
  }

  private async issue(): Promise<LoginResult> {
    const token = await this.jwt.signAsync(
      { sub: 'admin' },
      { expiresIn: TOKEN_TTL_SECONDS },
    );

    return { token, expiresIn: TOKEN_TTL_SECONDS };
  }

  /**
   * The credential row, seeded from `ADMIN_PASSWORD_HASH` if it does not exist yet.
   *
   * Read on every authenticated request rather than cached. It is one primary-key
   * lookup of one row against a database the request is going to touch anyway, and
   * a cache would let a token that a password change just revoked keep working for
   * the length of the cache — on another instance, or another process, which is
   * exactly the case the revocation exists for.
   */
  private async credential(): Promise<AdminCredential> {
    const existing = await this.prisma.adminCredential.findUnique({
      where: { id: CREDENTIAL_ID },
    });

    if (existing) return existing;

    // First read on a deployment that has never changed its password. `upsert`
    // rather than `create` so two concurrent requests cannot race into a
    // duplicate-key error.
    return this.prisma.adminCredential.upsert({
      where: { id: CREDENTIAL_ID },
      create: { id: CREDENTIAL_ID, passwordHash: this.seedHash },
      update: {},
    });
  }
}
