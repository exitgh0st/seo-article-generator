import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * The 12-character minimum is stated here and again in scripts/hash-password.mjs.
 * That script is plain `.mjs` run outside the Nest build and cannot import this
 * file, so the number lives in both places — change one and change the other.
 *
 * LoginDto deliberately has no such minimum: it must accept whatever password was
 * set before this rule existed, or an old deployment could not sign in at all.
 */
export class ChangePasswordDto {
  @ApiProperty({ description: 'The password currently in use.' })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ description: 'The replacement password. At least 12 characters.' })
  @IsString()
  @MinLength(12, { message: 'The new password must be at least 12 characters' })
  newPassword!: string;
}
