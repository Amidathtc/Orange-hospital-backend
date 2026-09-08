import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DrawRequestsService } from './draw-requests.service';
import { CreateDrawRequestDto } from './dto/create-draw-request.dto';
import { ReviewDrawRequestDto } from './dto/review-draw-request.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('draw-requests')
export class DrawRequestsController {
  constructor(private drawRequestsService: DrawRequestsService) {}

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateDrawRequestDto) {
    return this.drawRequestsService.create(user.id, dto);
  }

  @Get('me')
  getMine(@CurrentUser() user: { id: string }) {
    return this.drawRequestsService.getMine(user.id);
  }

  @Roles(Role.ADMIN)
  @Get('pending')
  listPending() {
    return this.drawRequestsService.listPending();
  }

  @Roles(Role.ADMIN)
  @Patch(':id/review')
  review(
    @CurrentUser() admin: { id: string },
    @Param('id') id: string,
    @Body() dto: ReviewDrawRequestDto,
  ) {
    return this.drawRequestsService.review(id, admin.id, dto);
  }
}
