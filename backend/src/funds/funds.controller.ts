import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FundsService } from './funds.service';
import { UpdateFrequencyDto } from './dto/update-frequency.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('funds')
export class FundsController {
  constructor(private fundsService: FundsService) {}

  // Any logged-in member — no @Roles() means it's open to whoever is authenticated,
  // and getMyFunds only ever looks up the caller's own userId, never anyone else's.
  @Get('me')
  getMyFunds(@CurrentUser() user: { id: string }) {
    return this.fundsService.getMyFunds(user.id);
  }

  @Patch('me/frequency')
  updateFrequency(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateFrequencyDto,
  ) {
    return this.fundsService.updateFrequency(user.id, dto);
  }

  // Front-desk lookup — receptionist pulls up a member's funds before logging a walk-in payment.
  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Get('user/:userId')
  getFundsForUser(@Param('userId') userId: string) {
    return this.fundsService.getFundsForUser(userId);
  }

  // Front-desk search by phone — this is what reception actually types in.
  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Get('lookup')
  findMemberByPhone(@Query('phone') phone: string) {
    return this.fundsService.findMemberByPhone(phone);
  }

  // Admin dashboard stat cards: total members, total in each fund.
  @Roles(Role.ADMIN)
  @Get('summary')
  getSummary() {
    return this.fundsService.getSummary();
  }
}
