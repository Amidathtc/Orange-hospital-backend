import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DrawRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateDrawRequestDto } from './dto/create-draw-request.dto';
import { ReviewDrawRequestDto } from './dto/review-draw-request.dto';

@Injectable()
export class DrawRequestsService {
  constructor(private prisma: PrismaService) {}

  // Works against whichever fund the member picked — Health (for treatment)
  // or General (their own savings).
  async create(memberId: string, dto: CreateDrawRequestDto) {
    const fund = await this.prisma.fund.findUnique({
      where: { userId_type: { userId: memberId, type: dto.fundType } },
    });

    if (!fund) {
      throw new BadRequestException(`No ${dto.fundType} fund found for this user.`);
    }

    if (fund.balance < dto.amount) {
      throw new BadRequestException(
        `Insufficient balance. Please fund your ${dto.fundType} Ajo account to proceed. Current balance: ₦${(fund.balance / 100).toLocaleString()}, requested: ₦${(dto.amount / 100).toLocaleString()}.`,
      );
    }

    const pendingRequests = await this.prisma.drawRequest.aggregate({
      where: { memberId, fundType: dto.fundType, status: DrawRequestStatus.PENDING },
      _sum: { amount: true },
    });

    const pendingTotal = pendingRequests._sum.amount ?? 0;
    const availableBalance = fund.balance - pendingTotal;

    if (availableBalance < dto.amount) {
      throw new BadRequestException(
        `Insufficient available balance. You already have pending draw requests totaling ₦${(pendingTotal / 100).toLocaleString()}. Please wait for review or fund your account.`,
      );
    }


    return this.prisma.drawRequest.create({
      data: {
        memberId,
        fundType: dto.fundType,
        amount: dto.amount,
        reason: dto.reason,
        status: DrawRequestStatus.PENDING,
      },
    });
  }


  async getMine(memberId: string) {
    return this.prisma.drawRequest.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Admin dashboard: the pending queue Dr. Megbuwawon actually reviews.
  async listPending() {
    return this.prisma.drawRequest.findMany({
      where: { status: DrawRequestStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      include: {
        member: { select: { id: true, fullName: true, phone: true } },
      },
    });
  }

  async review(requestId: string, adminId: string, dto: ReviewDrawRequestDto) {
    const request = await this.prisma.drawRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Draw request not found.');
    }

    if (request.status !== DrawRequestStatus.PENDING) {
      throw new BadRequestException('This request has already been reviewed.');
    }

    if (dto.decision === 'DECLINED') {
      return this.prisma.drawRequest.update({
        where: { id: requestId },
        data: {
          status: DrawRequestStatus.DECLINED,
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });
    }

    // APPROVED: the balance check and the decrement must happen as ONE atomic
    // operation, not a read followed by a separate write. If they're separate,
    // two concurrent approvals can both read the same starting balance before
    // either write lands, and both get approved even without enough money for both.
    return this.prisma.$transaction(async (tx) => {
      const fund = await tx.fund.findUnique({
        where: { userId_type: { userId: request.memberId, type: request.fundType } },
      });

      if (!fund) {
        throw new BadRequestException('This member has no fund of that type on record.');
      }

      const result = await tx.fund.updateMany({
        where: { id: fund.id, balance: { gte: request.amount } },
        data: { balance: { decrement: request.amount } },
      });

      if (result.count === 0) {
        throw new BadRequestException(
          "This member's fund balance is insufficient to approve this amount.",
        );
      }

      return tx.drawRequest.update({
        where: { id: requestId },
        data: {
          status: DrawRequestStatus.APPROVED,
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });
    });
  }
}
