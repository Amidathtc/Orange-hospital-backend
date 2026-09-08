import { Module } from '@nestjs/common';
import { DrawRequestsService } from './draw-requests.service';
import { DrawRequestsController } from './draw-requests.controller';

@Module({
  controllers: [DrawRequestsController],
  providers: [DrawRequestsService],
})
export class DrawRequestsModule {}
