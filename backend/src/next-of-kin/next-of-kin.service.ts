import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpsertNextOfKinDto } from './dto/upsert-next-of-kin.dto';

@Injectable()
export class NextOfKinService {
  constructor(private prisma: PrismaService) {}

  async getMine(userId: string) {
    return this.prisma.nextOfKin.findUnique({ where: { userId } });
  }

  // A member setting/editing their own next-of-kin through the app —
  // no witness needed here since they're doing it themselves, authenticated.
  // Still logged to history, since self-edits are exactly the kind of change
  // that needs a paper trail (see: someone using a family member's unlocked phone).
  async upsertMine(userId: string, dto: UpsertNextOfKinDto) {
    return this.upsertWithHistory(userId, dto, 'SELF', userId, null);
  }

  // For a member without a smartphone: reception fills this in on their behalf,
  // in person, and the staff name is stamped on the record as the trust anchor.
  async upsertWitnessed(
    memberId: string,
    staffId: string,
    staffName: string,
    dto: UpsertNextOfKinDto,
  ) {
    return this.upsertWithHistory(memberId, dto, 'RECEPTIONIST', staffId, staffName);
  }

  private async upsertWithHistory(
    userId: string,
    dto: UpsertNextOfKinDto,
    changedByRole: 'SELF' | 'RECEPTIONIST',
    changedByUserId: string,
    witnessedBy: string | null,
  ) {
    const existing = await this.prisma.nextOfKin.findUnique({ where: { userId } });

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.nextOfKin.upsert({
        where: { userId },
        update: { ...dto, witnessedBy },
        create: { userId, ...dto, witnessedBy },
      });

      // Snapshot whatever it was BEFORE this change, so a suspicious edit
      // right before a claim is visible, not silently overwritten.
      await tx.nextOfKinHistory.create({
        data: {
          nextOfKinId: record.id,
          previousName: existing?.fullName ?? null,
          previousPhone: existing?.phone ?? null,
          previousRel: existing?.relationship ?? null,
          changedByUserId,
          changedByRole,
        },
      });

      return record;
    });
  }

  // Admin-facing: full change history for a member, used when reviewing
  // a death/payout claim — flags recent changes for extra scrutiny.
  async getHistoryForUser(userId: string) {
    const kin = await this.prisma.nextOfKin.findUnique({ where: { userId } });
    if (!kin) return { current: null, history: [] };

    const history = await this.prisma.nextOfKinHistory.findMany({
      where: { nextOfKinId: kin.id },
      orderBy: { changedAt: 'desc' },
    });

    return { current: kin, history };
  }
}
