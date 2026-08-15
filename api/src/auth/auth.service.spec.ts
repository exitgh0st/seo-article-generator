import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';

/**
 * One password guards the whole editor, so the rules that decide who holds a
 * valid session are worth pinning down.
 *
 * Two cases are load-bearing. A wrong current password must be a 400 and not a
 * 401: the app's HTTP interceptor signs the operator out on any 401 carrying a
 * token, so a 401 here would end the session over a typo. And `assertTokenFresh`
 * must accept a token whose `iat` shares a second with `passwordChangedAt` —
 * `iat` has second resolution, so the token issued *by* a password change would
 * otherwise reject itself the moment it was used.
 */

const SEED_HASH = bcrypt.hashSync('seeded-from-the-env', 4);

function serviceWith(row: {
  passwordHash: string;
  passwordChangedAt?: Date;
} | null) {
  let stored = row
    ? {
        id: 1,
        passwordHash: row.passwordHash,
        passwordChangedAt: row.passwordChangedAt ?? new Date(0),
        updatedAt: new Date(),
      }
    : null;

  const adminCredential = {
    findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
    upsert: jest.fn().mockImplementation(({ create }: { create: unknown }) => {
      stored = {
        id: 1,
        passwordChangedAt: new Date(0),
        updatedAt: new Date(),
        ...(create as { passwordHash: string }),
      } as typeof stored;
      return Promise.resolve(stored);
    }),
    update: jest.fn().mockImplementation(({ data }: { data: unknown }) => {
      stored = { ...stored!, ...(data as object) } as typeof stored;
      return Promise.resolve(stored);
    }),
  };

  const prisma = { adminCredential } as unknown as PrismaService;
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
  } as unknown as JwtService;
  const config = {
    getOrThrow: jest.fn().mockReturnValue(SEED_HASH),
  } as unknown as ConfigService<Env, true>;

  return {
    service: new AuthService(jwt, prisma, config),
    adminCredential,
    stored: () => stored,
  };
}

/** Seconds, matching the resolution of a JWT `iat` claim. */
const secondsOf = (date: Date) => Math.floor(date.getTime() / 1000);

describe('AuthService', () => {
  describe('login', () => {
    it('compares against the database row, not the environment variable', async () => {
      const { service } = serviceWith({
        passwordHash: bcrypt.hashSync('the-changed-password', 4),
      });

      await expect(service.login('the-changed-password')).resolves.toEqual({
        token: 'signed.jwt.token',
        expiresIn: 7 * 24 * 60 * 60,
      });
      // The value the env var was seeded with must no longer open the door.
      await expect(service.login('seeded-from-the-env')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('seeds the row from ADMIN_PASSWORD_HASH when it does not exist yet', async () => {
      const { service, adminCredential, stored } = serviceWith(null);

      await expect(service.login('seeded-from-the-env')).resolves.toMatchObject({
        token: 'signed.jwt.token',
      });
      expect(adminCredential.upsert).toHaveBeenCalledTimes(1);
      expect(stored()!.passwordHash).toBe(SEED_HASH);
    });

    it('rejects the wrong password with a 401', async () => {
      const { service } = serviceWith({
        passwordHash: bcrypt.hashSync('correct-horse', 4),
      });

      await expect(service.login('battery-staple')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('changePassword', () => {
    it('rejects a wrong current password with a 400, never a 401', async () => {
      const { service, adminCredential } = serviceWith({
        passwordHash: bcrypt.hashSync('the-real-one', 4),
      });

      const rejection = service.changePassword('a-typo-here', 'a-fine-new-password');

      await expect(rejection).rejects.toBeInstanceOf(BadRequestException);
      // A 401 would trip the app's interceptor and sign the operator out.
      await expect(rejection).rejects.not.toBeInstanceOf(UnauthorizedException);
      expect(adminCredential.update).not.toHaveBeenCalled();
    });

    it('rejects a new password identical to the current one', async () => {
      const { service, adminCredential } = serviceWith({
        passwordHash: bcrypt.hashSync('unchanged-password', 4),
      });

      await expect(
        service.changePassword('unchanged-password', 'unchanged-password'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(adminCredential.update).not.toHaveBeenCalled();
    });

    it('stores the new hash, bumps passwordChangedAt and returns a token', async () => {
      // Anchored to the clock rather than a literal: the assertion is that the
      // column moved forward, and a fixed date would decide the outcome by
      // whether it happened to fall before or after the day the test runs.
      const before = new Date(Date.now() - 60_000);
      const { service, stored } = serviceWith({
        passwordHash: bcrypt.hashSync('the-old-password', 4),
        passwordChangedAt: before,
      });

      await expect(
        service.changePassword('the-old-password', 'the-new-password'),
      ).resolves.toMatchObject({ token: 'signed.jwt.token' });

      const row = stored()!;
      expect(bcrypt.compareSync('the-new-password', row.passwordHash)).toBe(true);
      expect(bcrypt.compareSync('the-old-password', row.passwordHash)).toBe(false);
      expect(row.passwordChangedAt.getTime()).toBeGreaterThan(before.getTime());
    });

    it('leaves the changing session able to authenticate', async () => {
      const { service, stored } = serviceWith({
        passwordHash: bcrypt.hashSync('the-old-password', 4),
      });

      await service.changePassword('the-old-password', 'the-new-password');

      // The replacement token is minted in the same second as the change.
      const iat = secondsOf(stored()!.passwordChangedAt);
      await expect(
        service.assertTokenFresh({ sub: 'admin', iat }),
      ).resolves.toBeUndefined();
    });
  });

  describe('assertTokenFresh', () => {
    const changedAt = new Date('2026-08-16T12:00:00.000Z');

    it('rejects a token issued before the password changed', async () => {
      const { service } = serviceWith({
        passwordHash: SEED_HASH,
        passwordChangedAt: changedAt,
      });

      await expect(
        service.assertTokenFresh({ sub: 'admin', iat: secondsOf(changedAt) - 1 }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('accepts a token issued in the same second as the change', async () => {
      const { service } = serviceWith({
        passwordHash: SEED_HASH,
        passwordChangedAt: changedAt,
      });

      await expect(
        service.assertTokenFresh({ sub: 'admin', iat: secondsOf(changedAt) }),
      ).resolves.toBeUndefined();
    });

    it('accepts a token issued after the change', async () => {
      const { service } = serviceWith({
        passwordHash: SEED_HASH,
        passwordChangedAt: changedAt,
      });

      await expect(
        service.assertTokenFresh({ sub: 'admin', iat: secondsOf(changedAt) + 60 }),
      ).resolves.toBeUndefined();
    });

    it('rejects a token with no iat claim at all', async () => {
      const { service } = serviceWith({ passwordHash: SEED_HASH });

      await expect(
        service.assertTokenFresh({ sub: 'admin' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
