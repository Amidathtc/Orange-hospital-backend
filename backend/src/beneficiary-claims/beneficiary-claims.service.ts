import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClaimStatus, FundType } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { ReviewClaimDto } from './dto/review-claim.dto';

@Injectable()
export class BeneficiaryClaimsService {
  constructor(private prisma: PrismaService) {}

  // Reception or admin logs this when someone physically shows up claiming
  // to be a deceased member's next-of-kin. Submitting a claim does NOT move
  // any money — it only starts the review.
  async create(dto: CreateClaimDto) {
    const member = await this.prisma.user.findUnique({
      where: { id: dto.deceasedMemberId },
    });

    if (!member) {
      throw new NotFoundException('Member not found.');
    }

    return this.prisma.beneficiaryClaim.create({
      data: {
        deceasedMemberId: dto.deceasedMemberId,
        claimantName: dto.claimantName,
        claimantPhone: dto.claimantPhone,
        claimantRelationship: dto.claimantRelationship,
        amount: dto.amount,
        status: ClaimStatus.PENDING,
      },
    });
  }

  async listPending() {
    return this.prisma.beneficiaryClaim.findMany({
      where: { status: ClaimStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      include: {
        deceasedMember: { select: { id: true, fullName: true, phone: true } },
      },
    });
  }

  // Everything an admin needs to make an informed decision, in one call:
  // the claim itself, and the full next-of-kin change history so a recent,
  // suspicious edit is visible rather than hidden behind whatever's current.
  async getReviewContext(claimId: string) {
    const claim = await this.prisma.beneficiaryClaim.findUnique({
      where: { id: claimId },
      include: {
        deceasedMember: { select: { id: true, fullName: true, phone: true, deceasedAt: true } },
      },
    });

    if (!claim) {
      throw new NotFoundException('Claim not found.');
    }

    const nextOfKin = await this.prisma.nextOfKin.findUnique({
      where: { userId: claim.deceasedMemberId },
    });

    const history = nextOfKin
      ? await this.prisma.nextOfKinHistory.findMany({
          where: { nextOfKinId: nextOfKin.id },
          orderBy: { changedAt: 'desc' },
        })
      : [];

    // A simple, honest signal — not an automatic block, just something
    // to put in front of the admin: was this changed recently?
    const daysSinceLastChange = nextOfKin
      ? Math.floor((Date.now() - nextOfKin.updatedAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // If this member was already marked deceased by a PRIOR approved claim,
    // the admin needs to know before approving another one — it means
    // someone already collected a payout against this account.
    const priorClaimWarning = claim.deceasedMember.deceasedAt
      ? `This member was already marked deceased on ${claim.deceasedMember.deceasedAt.toDateString()} — check whether a payout already happened before approving this one.`
      : null;

    return { claim, nextOfKinOnFile: nextOfKin, history, daysSinceLastChange, priorClaimWarning };
  }

  async review(claimId: string, adminId: string, dto: ReviewClaimDto) {
    const claim = await this.prisma.beneficiaryClaim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      throw new NotFoundException('Claim not found.');
    }

    if (claim.status !== ClaimStatus.PENDING) {
      throw new BadRequestException('This claim has already been reviewed.');
    }

    if (dto.decision === 'DECLINED') {
      return this.prisma.beneficiaryClaim.update({
        where: { id: claimId },
        data: {
          status: ClaimStatus.DECLINED,
          notes: dto.notes,
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });
    }

    // APPROVED: same atomic pattern as draw requests — the balance check
    // and the decrement happen as one database operation, so two claims
    // (or a claim racing a draw request) can't both succeed past what's
    // actually available.
    return this.prisma.$transaction(async (tx) => {
      const generalFund = await tx.fund.findUnique({
        where: { userId_type: { userId: claim.deceasedMemberId, type: FundType.GENERAL } },
      });

      if (!generalFund) {
        throw new BadRequestException('This member has no General Ajo fund on record.');
      }

      const result = await tx.fund.updateMany({
        where: { id: generalFund.id, balance: { gte: claim.amount } },
        data: { balance: { decrement: claim.amount } },
      });

      if (result.count === 0) {
        throw new BadRequestException(
          "The General Ajo balance is insufficient to approve this claim amount.",
        );
      }

      const updatedClaim = await tx.beneficiaryClaim.update({
        where: { id: claimId },
        data: {
          status: ClaimStatus.APPROVED,
          notes: dto.notes,
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });

      // Lock the account — there's no legitimate reason for further
      // logins or contributions on it once a payout has been made.
      await tx.user.update({
        where: { id: claim.deceasedMemberId },
        data: { deceasedAt: new Date() },
      });

      return updatedClaim;
    });
  }
}
