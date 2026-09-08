import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NextOfKinService } from './next-of-kin.service';
import { UpsertNextOfKinDto } from './dto/upsert-next-of-kin.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('next-of-kin')
export class NextOfKinController {
  constructor(private nextOfKinService: NextOfKinService) {}

  @Get('me')
  getMine(@CurrentUser() user: { id: string }) {
    return this.nextOfKinService.getMine(user.id);
  }

  @Put('me')
  upsertMine(@CurrentUser() user: { id: string }, @Body() dto: UpsertNextOfKinDto) {
    return this.nextOfKinService.upsertMine(user.id, dto);
  }

  // Reception fills this in, in person, for a member without a smartphone.
  // staff.id/fullName come from their own verified JWT — never trust a
  // client-supplied "witnessed by" name, or anyone could stamp any name on the record.
  @Roles(Role.RECEPTIONIST, Role.ADMIN)
  @Put('witness/:memberId')
  upsertWitnessed(
    @CurrentUser() staff: { id: string; fullName: string },
    @Param('memberId') memberId: string,
    @Body() dto: UpsertNextOfKinDto,
  ) {
    return this.nextOfKinService.upsertWitnessed(memberId, staff.id, staff.fullName, dto);
  }

  // Admin reviews this before approving a death/payout claim — shows every
  // past version, so a change made right before a claim doesn't slip through unnoticed.
  @Roles(Role.ADMIN)
  @Get('history/:userId')
  getHistory(@Param('userId') userId: string) {
    return this.nextOfKinService.getHistoryForUser(userId);
  }
}
