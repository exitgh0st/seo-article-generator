import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './jwt.strategy';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // Tighter than the global limit: this is the one endpoint worth guessing at.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange the admin password for a bearer token.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.password);
  }

  @ApiBearerAuth()
  // Guessable in the same way login is, once someone has a token.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Change the admin password. Invalidates every other token and returns a replacement for this session.',
  })
  changePassword(@Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(dto.currentPassword, dto.newPassword);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({
    summary:
      'Verify the current token is still valid, and describe the session it belongs to.',
  })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return {
      userId: user.userId,
      passwordChangedAt: await this.authService.passwordChangedAt(),
      // Seconds, from the token's own `exp` claim. Null only if a token were
      // ever minted without one, which `issue()` does not do.
      expiresAt: user.expiresAt ?? null,
    };
  }
}
