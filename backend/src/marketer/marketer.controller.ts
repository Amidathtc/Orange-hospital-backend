import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MarketerService } from './marketer.service';
import { RegisterMemberDto } from './dto/register-member.dto';
import { ReferralsQueryDto } from './dto/referrals-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MARKETER)
@Controller('marketer')
export class MarketerController {
  constructor(private marketerService: MarketerService) {}

  // Register a new member on behalf of the marketer — ties referredBy to the
  // marketer's own id so the referral is always accurate, never self-reported.
  @Post('register-member')
  @HttpCode(HttpStatus.CREATED)
  registerMember(
    @CurrentUser() user: { id: string },
    @Body() dto: RegisterMemberDto,
  ) {
    return this.marketerService.registerMember(user.id, dto);
  }

  // Paginated, searchable list of this marketer's own referrals only.
  @Get('referrals')
  getMyReferrals(
    @CurrentUser() user: { id: string },
    @Query() query: ReferralsQueryDto,
  ) {
    return this.marketerService.getMyReferrals(user.id, query);
  }

  // Lightweight all-member search — for duplicate checking before registering.
  // Hard-capped at 10 results; requires at least 2 characters.
  @Get('members')
  searchMembers(
    @Query('search') search: string,
    @Query('limit') limit?: string,
  ) {
    return this.marketerService.searchMembers(search, limit ? parseInt(limit, 10) : 10);
  }

  // Aggregated referral counts for the marketer's dashboard stat cards.
  @Get('stats')
  getStats(@CurrentUser() user: { id: string }) {
    return this.marketerService.getStats(user.id);
  }

  // Marketer's own profile — name, phone, role, join date. Nothing financial.
  @Get('profile')
  getProfile(@CurrentUser() user: { id: string }) {
    return this.marketerService.getProfile(user.id);
  }
}
