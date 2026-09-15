import { Body, Controller, Get, Post, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AssistedResetDto } from './dto/assisted-reset.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: { id: string }) {
    return this.authService.getMe(user.id);
  }

  // Tighter than the app-wide default — signup doesn't need to be attempted
  // more than a handful of times per minute by a real person.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  signup(@Body() dto: SignupDto) {

    return this.authService.signup(dto);
  }

  // Same reasoning — this is exactly the endpoint a password-guessing script targets.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Only an existing admin can create a receptionist or admin account.
  // This is deliberately the ONLY way a staff account comes into existence.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('create-staff')
  createStaff(@Body() dto: CreateStaffDto) {
    return this.authService.createStaffAccount(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() dto: ForgotPasswordDto) {
    return this.authService.resendVerificationEmail(dto.email);
  }


  // Same throttle reasoning as login — this is the endpoint that sends an
  // email, so it's also the one someone could try to spam.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  // The in-person fallback for a member with no email on file — reception
  // or admin verifies who they are physically, then sets a new password.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Post('assisted-reset')
  assistedReset(@CurrentUser() staff: { id: string }, @Body() dto: AssistedResetDto) {
    return this.authService.assistedPasswordReset(staff.id, dto.memberId, dto.newPassword);
  }
}
