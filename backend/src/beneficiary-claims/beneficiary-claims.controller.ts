import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BeneficiaryClaimsService } from './beneficiary-claims.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { ReviewClaimDto } from './dto/review-claim.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.RECEPTIONIST, Role.ADMIN)
@Controller('beneficiary-claims')
export class BeneficiaryClaimsController {
  constructor(private claimsService: BeneficiaryClaimsService) {}

  // Reception logs this when someone shows up in person claiming to be
  // a deceased member's next-of-kin. No money moves at this step.
  @Post()
  create(@Body() dto: CreateClaimDto) {
    return this.claimsService.create(dto);
  }

  @Roles(Role.ADMIN)
  @Get('pending')
  listPending() {
    return this.claimsService.listPending();
  }

  // Everything the admin needs to decide: the claim, the next-of-kin
  // history, and a flag for how recently it was changed.
  @Roles(Role.ADMIN)
  @Get(':id/review-context')
  getReviewContext(@Param('id') id: string) {
    return this.claimsService.getReviewContext(id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/review')
  review(
    @CurrentUser() admin: { id: string },
    @Param('id') id: string,
    @Body() dto: ReviewClaimDto,
  ) {
    return this.claimsService.review(id, admin.id, dto);
  }
}
