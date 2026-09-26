import {
  ConflictException,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { Role, FundType, Frequency } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { RegisterMemberDto } from './dto/register-member.dto';
import { ReferralsQueryDto } from './dto/referrals-query.dto';

// Defaults matching Orange Health's Ajo scheme: ₦50/day = 5000 kobo/day.
const DEFAULT_HEALTH_AMOUNT_KOBO = 5_000;
const DEFAULT_GENERAL_AMOUNT_KOBO = 5_000;

@Injectable()
export class MarketerService {
  constructor(private prisma: PrismaService) {}

  // Marketer registers a member on their behalf. The member has no password
  // yet — they should set their own through the forgot-password / assisted-reset
  // flow once reception verifies them in person (or via SMS if you add that later).
  async registerMember(marketerId: string, dto: RegisterMemberDto) {
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existing) {
      throw new ConflictException('An account with this phone number already exists.');
    }

    // Placeholder hash — the member cannot log in with this. They must go
    // through assisted-reset or forgot-password before their account is usable.
    // Using a random irreversible string ensures no one can accidentally log in.
    const unusableHash = `UNSET:${Date.now()}:${Math.random()}`;
    const now = new Date();

    const member = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        passwordHash: unusableHash,
        role: Role.MEMBER,
        referredBy: marketerId,
        registeredAt: now,
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
      select: {
        id: true,
        fullName: true,
        phone: true,
        referredBy: true,
        registeredAt: true,
      },
    });

    return member;
  }

  // Paginated list of members this marketer has referred — no financial data.
  async getMyReferrals(marketerId: string, query: ReferralsQueryDto) {
    const { page = 1, limit = 20, search, sort = 'registeredAt', order = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where = {
      referredBy: marketerId,
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort]: order },
        select: {
          id: true,
          fullName: true,
          phone: true,
          registeredAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Lightweight member lookup — for duplicate checking before registering.
  // Only returns id, fullName, phone — never financial data.
  async searchMembers(search: string, limit: number = 10) {
    if (!search || search.trim().length < 2) {
      throw new BadRequestException('search must be at least 2 characters.');
    }

    const cap = Math.min(limit, 10); // hard cap at 10

    const data = await this.prisma.user.findMany({
      where: {
        role: Role.MEMBER,
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      },
      take: cap,
      select: {
        id: true,
        fullName: true,
        phone: true,
      },
    });

    return { data };
  }

  // Aggregated referral stats for the authenticated marketer.
  async getStats(marketerId: string) {
    const now = new Date();

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday as start
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [allTime, thisMonth, thisWeek] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { referredBy: marketerId } }),
      this.prisma.user.count({
        where: {
          referredBy: marketerId,
          registeredAt: { gte: startOfMonth },
        },
      }),
      this.prisma.user.count({
        where: {
          referredBy: marketerId,
          registeredAt: { gte: startOfWeek },
        },
      }),
    ]);

    return {
      totalReferrals: allTime,
      thisMonth,
      thisWeek,
      allTime,
    };
  }

  // Marketer's own profile — no financial or sensitive fields.
  async getProfile(marketerId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: marketerId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    return user;
  }
}
