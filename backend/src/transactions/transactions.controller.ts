import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TransactionsService } from './transactions.service';
import { LogWalkInDto } from './dto/log-walk-in.dto';
import { InitiateContributionDto } from './dto/initiate-contribution.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  // Front desk logs a cash contribution for a member without a smartphone.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Post('walk-in')
  logWalkIn(@CurrentUser() staff: { id: string }, @Body() dto: LogWalkInDto) {
    return this.transactionsService.logWalkIn(staff.id, dto);
  }

  // Member starts a Paystack payment — returns the checkout link the frontend redirects to.
  @UseGuards(JwtAuthGuard)
  @Post('contribute')
  initiateContribution(
    @CurrentUser() user: { id: string; email?: string | null; phone: string },
    @Body() dto: InitiateContributionDto,
  ) {
    return this.transactionsService.initiateContribution(
      user.id,
      user.email ?? null,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMyTransactions(@CurrentUser() user: { id: string }) {
    return this.transactionsService.getMyTransactions(user.id);
  }

  // Reconciliation tool: lets Dr. Megbuwawon spot an unusual pattern from a
  // specific staff member — the actual defense against fabricated walk-in entries.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('walk-in-summary')
  getWalkInSummary() {
    return this.transactionsService.getWalkInSummaryByStaff();
  }

  // No auth guard here on purpose — Paystack calls this directly, not a logged-in user.
  // Trust comes entirely from the HMAC signature check inside the service, against the raw body.
  @Post('paystack/webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Req() req: Request & { rawBody: Buffer },
    @Headers('x-paystack-signature') signature: string,
  ) {
    return this.transactionsService.handlePaystackWebhook(req.rawBody, signature);
  }
}
