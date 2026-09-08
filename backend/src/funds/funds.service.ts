import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { FundType } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { UpdateFrequencyDto } from './dto/update-frequency.dto';

@Injectable()
export class FundsService {
  constructor(private prisma: PrismaService) {}

  // A member's own two funds — what the Member dashboard reads on load.
  async getMyFunds(userId: string) {
    return this.prisma.fund.findMany({
      where: { userId },
      orderBy: { type: 'asc' },
    });
  }

  async updateFrequency(userId: string, dto: UpdateFrequencyDto) {
    const fund = await this.prisma.fund.findUnique({
      where: { userId_type: { userId, type: dto.type } },
    });

    if (!fund) {
      // Shouldn't happen in practice since signup always creates both funds,
      // but guards against a bad userId or a partially-migrated account.
      throw new NotFoundException(`No ${dto.type} fund found for this member.`);
    }

    return this.prisma.fund.update({
      where: { id: fund.id },
      data: {
        frequency: dto.frequency,
        amount: dto.amount,
      },
    });
  }

  // Receptionist front-desk lookup: find a member by their own ID.
  // Receptionists never see this for themselves — only the RolesGuard-protected
  // controller route decides who's allowed to call this.
  async getFundsForUser(userId: string) {
    const funds = await this.prisma.fund.findMany({ where: { userId } });

    if (funds.length === 0) {
      throw new NotFoundException('No funds found for this member.');
    }

    return funds;
  }

  // Front desk searches by phone number, since that's what a walk-in member
  // actually knows — not their internal user ID.
  async findMemberByPhone(phone: string) {
    const member = await this.prisma.user.findFirst({
      where: { phone, role: 'MEMBER' },
      select: {
        id: true,
        fullName: true,
        phone: true,
        funds: true,
      },
    });

    if (!member) {
      throw new NotFoundException('No member found with that phone number.');
    }

    return member;
  }

  // Admin dashboard stats: total pooled per fund type, across everyone.
  async getSummary() {
    const grouped = await this.prisma.fund.groupBy({
      by: ['type'],
      _sum: { balance: true },
      _count: { _all: true },
    });

    const totalMembers = await this.prisma.user.count({
      where: { role: 'MEMBER' },
    });

    const summary = {
      totalMembers,
      healthFundTotal: 0,
      generalFundTotal: 0,
    };

    for (const row of grouped) {
      if (row.type === FundType.HEALTH) {
        summary.healthFundTotal = row._sum.balance ?? 0;
      } else if (row.type === FundType.GENERAL) {
        summary.generalFundTotal = row._sum.balance ?? 0;
      }
    }

    return summary;
  }
}
