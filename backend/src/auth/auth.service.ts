import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Role, FundType, Frequency, AuthTokenType } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

const SALT_ROUNDS = 12;

// Defaults matching Orange Health's real Ajo Health scheme: ₦50/day = 5000 kobo/day.
const DEFAULT_HEALTH_AMOUNT_KOBO = 5_000;
const DEFAULT_GENERAL_AMOUNT_KOBO = 5_000;

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
  ) {}

  async signup(dto: SignupDto) {
    const existingPhone = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (existingPhone) {
      throw new ConflictException('An account with this phone number already exists.');
    }

    const existingEmail = dto.email
      ? await this.prisma.user.findUnique({ where: { email: dto.email } })
      : null;
    if (existingEmail) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    // Public signup can never self-assign ADMIN or RECEPTIONIST — always MEMBER here.
    // Staff accounts get created separately by an admin, through a protected route.
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        passwordHash,
        role: Role.MEMBER,
        funds: {
          create: [
            {
              type: FundType.HEALTH,
              amount: DEFAULT_HEALTH_AMOUNT_KOBO,
              frequency: Frequency.DAILY,
              balance: 0,
            },
            {
              type: FundType.GENERAL,
              amount: DEFAULT_GENERAL_AMOUNT_KOBO,
              frequency: Frequency.DAILY,
              balance: 0,
            },
          ],
        },
      },
    });

    // Best-effort, and only if they gave an email — a member without one
    // simply has no verification step, not a broken signup.
    if (user.email) {
      await this.sendVerificationEmail(user.id, user.email, user.fullName).catch(() => undefined);
    }

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    // Deliberately vague error — never confirm whether the phone number
    // itself was the wrong part. Keeps us from leaking which numbers are registered.
    if (!user) {
      throw new UnauthorizedException('Incorrect phone number or password.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Incorrect phone number or password.');
    }

    if (user.deceasedAt) {
      // Account is locked following an approved beneficiary claim — there's
      // no legitimate reason for further activity on it.
      throw new UnauthorizedException('This account is no longer active.');
    }

    return this.buildAuthResponse(user);
  }

  // Admin-only: creates a RECEPTIONIST or ADMIN account. Deliberately separate
  // from public signup, which can only ever produce MEMBER accounts — this is
  // the only path a staff account can be created through.
  async createStaffAccount(dto: {
    fullName: string;
    phone: string;
    email?: string;
    password: string;
    role: Role;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existing) {
      throw new ConflictException('An account with this phone number already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        passwordHash,
        role: dto.role,
        // Staff accounts don't get member funds — they're not contributing members.
      },
    });

    if (user.email) {
      await this.sendVerificationEmail(user.id, user.email, user.fullName).catch(() => undefined);
    }

    return { id: user.id, fullName: user.fullName, phone: user.phone, role: user.role };
  }

  async verifyEmail(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);

    const token = await this.prisma.authToken.findUnique({ where: { tokenHash } });

    if (!token || token.type !== AuthTokenType.EMAIL_VERIFICATION) {
      throw new BadRequestException('This verification link is invalid.');
    }
    if (token.usedAt) {
      throw new BadRequestException('This verification link has already been used.');
    }
    if (token.expiresAt < new Date()) {
      throw new BadRequestException('This verification link has expired.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.authToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { verified: true };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always return the same response whether or not the email exists —
    // otherwise this endpoint becomes a way to check which emails are registered.
    if (user && user.email) {
      await this.sendPasswordResetEmail(user.id, user.email, user.fullName).catch(() => undefined);
    }

    return { message: 'If that email is registered, a reset link has been sent.' };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = this.hashToken(rawToken);

    const token = await this.prisma.authToken.findUnique({ where: { tokenHash } });

    if (!token || token.type !== AuthTokenType.PASSWORD_RESET) {
      throw new BadRequestException('This reset link is invalid.');
    }
    if (token.usedAt) {
      throw new BadRequestException('This reset link has already been used.');
    }
    if (token.expiresAt < new Date()) {
      throw new BadRequestException('This reset link has expired. Request a new one.');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: token.userId },
        data: { passwordHash },
      }),
      this.prisma.authToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate any other outstanding reset tokens for this user — if two
      // reset emails were requested, using one should kill the other.
      this.prisma.authToken.updateMany({
        where: {
          userId: token.userId,
          type: AuthTokenType.PASSWORD_RESET,
          usedAt: null,
          id: { not: token.id },
        },
        data: { usedAt: new Date() },
      }),
    ]);

    return { reset: true };
  }

  // For a member with no email: the in-person equivalent of "forgot password."
  // Reception verifies who they are physically — same trust model as next-of-kin
  // witnessing — and sets a new password directly. staffId is recorded for
  // accountability, the same way a walk-in contribution is tagged to who logged it.
  async assistedPasswordReset(staffId: string, memberId: string, newPassword: string) {
    const member = await this.prisma.user.findUnique({ where: { id: memberId } });

    if (!member || member.role !== Role.MEMBER) {
      throw new BadRequestException('Member not found.');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: memberId },
      data: { passwordHash },
    });

    return { reset: true, resetBy: staffId };
  }

  private async sendVerificationEmail(userId: string, email: string, fullName: string) {
    const rawToken = await this.createToken(userId, AuthTokenType.EMAIL_VERIFICATION, EMAIL_VERIFICATION_TTL_MS);
    const link = `${this.config.get<string>('FRONTEND_URL')}/verify-email?token=${rawToken}`;
    await this.emailService.sendVerificationEmail(email, fullName, link);
  }

  private async sendPasswordResetEmail(userId: string, email: string, fullName: string) {
    const rawToken = await this.createToken(userId, AuthTokenType.PASSWORD_RESET, PASSWORD_RESET_TTL_MS);
    const link = `${this.config.get<string>('FRONTEND_URL')}/reset-password?token=${rawToken}`;
    await this.emailService.sendPasswordResetEmail(email, fullName, link);
  }

  // The raw token goes in the email link. Only its SHA-256 hash is stored —
  // so even a full database leak can't be used to verify emails or reset
  // passwords, the same principle as never storing plaintext passwords.
  private async createToken(userId: string, type: AuthTokenType, ttlMs: number): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    await this.prisma.authToken.create({
      data: {
        userId,
        type,
        tokenHash,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });

    return rawToken;
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      role: user.role,
      emailVerified: Boolean(user.emailVerifiedAt),
      createdAt: user.createdAt,
    };
  }

  private buildAuthResponse(user: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    role: Role;
    emailVerifiedAt?: Date | null;
  }) {
    // Staff tokens expire faster than member tokens — if a receptionist is
    // let go or a device is compromised, the window of exposure is a day,
    // not a full week. Members keep the longer window since re-logging-in
    // often for a low-friction app matters more for them.
    const expiresIn = user.role === Role.MEMBER ? '7d' : '1d';
    const token = this.jwt.sign({ sub: user.id, role: user.role }, { expiresIn });

    return {
      accessToken: token,
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        role: user.role,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
    };
  }
}

