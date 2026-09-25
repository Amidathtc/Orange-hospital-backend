import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransactionSource, TransactionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { PaystackService } from './paystack.service';
import { MonnifyService } from './monnify.service';
import { LogWalkInDto } from './dto/log-walk-in.dto';
import { InitiateContributionDto } from './dto/initiate-contribution.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
    private monnify: MonnifyService,
    private config: ConfigService,
  ) {}


  // Receptionist front-desk flow: cash is already in hand, so this is
  // recorded as SUCCESS immediately and the balance updates right away.
  async logWalkIn(staffId: string, dto: LogWalkInDto) {
    const fund = await this.prisma.fund.findUnique({
      where: { userId_type: { userId: dto.memberId, type: dto.fundType } },
      include: { user: { select: { deceasedAt: true } } },
    });

    if (!fund) {
      throw new NotFoundException('This member has no fund of that type.');
    }

    if (fund.user.deceasedAt) {
      // Once a claim's been approved, there's no legitimate reason for more
      // money to land in this account — reception shouldn't be able to add to it.
      throw new BadRequestException('This member\'s account is no longer active.');
    }

    // Wrapped in a transaction so the balance update and the audit record
    // either both happen or neither does — no partial state if something fails midway.
    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          fundId: fund.id,
          amount: dto.amount,
          source: TransactionSource.WALK_IN,
          status: TransactionStatus.SUCCESS,
          loggedById: staffId,
        },
      });

      await tx.fund.update({
        where: { id: fund.id },
        data: { balance: { increment: dto.amount } },
      });

      return transaction;
    });
  }

  // Member-initiated flow, step 1: create a PENDING transaction and get a
  // Paystack checkout link. Balance does NOT change yet — only the webhook does that,
  // since that's the only source we actually trust to confirm money moved.
  async initiateContribution(
    userId: string,
    userEmail: string | null,
    dto: InitiateContributionDto,
  ) {
    if (!userEmail) {
      throw new BadRequestException(
        'An email address is required to pay by card, transfer, or USSD.',
      );
    }

    const fund = await this.prisma.fund.findUnique({
      where: { userId_type: { userId, type: dto.fundType } },
    });

    if (!fund) {
      throw new NotFoundException('Fund not found for this member.');
    }

    const reference = `oha_${randomUUID()}`;

    const transaction = await this.prisma.transaction.create({
      data: {
        fundId: fund.id,
        amount: dto.amount,
        source: TransactionSource.PAYSTACK,
        status: TransactionStatus.PENDING,
        paystackRef: reference,
      },
    });

    const { authorizationUrl } = await this.paystack.initializeTransaction(
      userEmail,
      dto.amount,
      reference,
      `${this.config.get<string>('FRONTEND_URL')}/member?payment=complete`,
    );

    return { transactionId: transaction.id, authorizationUrl, reference };
  }

  async initiateMonnifyContribution(
    userId: string,
    userFullName: string,
    userEmail: string | null,
    dto: InitiateContributionDto,
  ) {
    if (!userEmail) {
      throw new BadRequestException(
        'An email address is required for Monnify payments.',
      );
    }

    const fund = await this.prisma.fund.findUnique({
      where: { userId_type: { userId, type: dto.fundType } },
    });

    if (!fund) {
      throw new NotFoundException('Fund not found for this member.');
    }

    const reference = `mon_${randomUUID()}`;

    const transaction = await this.prisma.transaction.create({
      data: {
        fundId: fund.id,
        amount: dto.amount,
        source: TransactionSource.MONNIFY,
        status: TransactionStatus.PENDING,
        paystackRef: reference,
      },
    });

    const { checkoutUrl, transactionReference } = await this.monnify.initializeTransaction(
      userFullName,
      userEmail,
      dto.amount,
      reference,
      `${this.config.get<string>('FRONTEND_URL')}/member?payment=complete`,
    );

    return {
      transactionId: transaction.id,
      authorizationUrl: checkoutUrl,
      reference,
      transactionReference,
    };
  }

  // Step 2: Paystack calls this after payment. This is the ONLY place
  // a Paystack-sourced balance actually changes — never trust the frontend
  // telling us a payment succeeded, only the signed webhook.
  async handlePaystackWebhook(rawBody: Buffer, signature: string | undefined) {
    const isValid = this.paystack.verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature.');
    }

    const event = JSON.parse(rawBody.toString('utf8'));

    if (event.event !== 'charge.success') {
      return { received: true }; // ignore anything that isn't a successful charge
    }

    const reference = event.data.reference;

    const transaction = await this.prisma.transaction.findUnique({
      where: { paystackRef: reference },
    });

    if (!transaction) {
      // Don't throw here — Paystack will retry on non-2xx responses.
      // A reference we don't recognize isn't worth retrying over.
      return { received: true };
    }

    // Idempotency guard: Paystack can send the same webhook more than once.
    // Without this check, a retried webhook would double-credit the balance.
    if (transaction.status === TransactionStatus.SUCCESS) {
      return { received: true };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { status: TransactionStatus.SUCCESS },
      });

      await tx.fund.update({
        where: { id: transaction.fundId },
        data: { balance: { increment: transaction.amount } },
      });
    });

    return { received: true };
  }

  async handleMonnifyWebhook(payload: any) {
    if (payload.eventType !== 'SUCCESSFUL_TRANSACTION') {
      return { received: true };
    }

    const eventData = payload.eventData;
    if (!eventData) return { received: true };

    const { paymentReference, amountPaid, paidOn, transactionReference, transactionHash } = eventData;

    const isValid = this.monnify.verifyWebhookHash(
      paymentReference,
      amountPaid,
      paidOn,
      transactionReference,
      transactionHash,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid Monnify webhook signature hash.');
    }

    const transaction = await this.prisma.transaction.findUnique({
      where: { paystackRef: paymentReference },
    });

    if (!transaction) {
      return { received: true };
    }

    if (transaction.status === TransactionStatus.SUCCESS) {
      return { received: true };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { status: TransactionStatus.SUCCESS },
      });

      await tx.fund.update({
        where: { id: transaction.fundId },
        data: { balance: { increment: transaction.amount } },
      });
    });

    return { received: true };
  }


  async getMyTransactions(userId: string) {
    return this.prisma.transaction.findMany({
      where: { fund: { userId } },
      orderBy: { createdAt: 'desc' },
      include: { fund: { select: { type: true } } },
    });
  }

  // Admin visibility tool: walk-in totals grouped by which staff member logged
  // them, most recent first. This is the actual protection against a staff
  // member crediting fake "contributions" to an account they control —
  // software can't stop that outright (cash handling always requires trust),
  // but it can make an unusual pattern impossible to miss.
  async getWalkInSummaryByStaff() {
    const walkIns = await this.prisma.transaction.findMany({
      where: { source: TransactionSource.WALK_IN, status: TransactionStatus.SUCCESS },
      include: { loggedBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const byStaffAndDay = new Map<
      string,
      { staffName: string; date: string; total: number; count: number }
    >();

    for (const txn of walkIns) {
      const staffName = txn.loggedBy?.fullName ?? 'Unknown';
      const date = txn.createdAt.toISOString().slice(0, 10);
      const key = `${txn.loggedById}_${date}`;

      const existing = byStaffAndDay.get(key);
      if (existing) {
        existing.total += txn.amount;
        existing.count += 1;
      } else {
        byStaffAndDay.set(key, { staffName, date, total: txn.amount, count: 1 });
      }
    }

    return Array.from(byStaffAndDay.values()).sort((a, b) => b.date.localeCompare(a.date));
  }
}
