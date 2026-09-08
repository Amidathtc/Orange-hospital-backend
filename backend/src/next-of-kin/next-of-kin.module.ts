import { Module } from '@nestjs/common';
import { NextOfKinService } from './next-of-kin.service';
import { NextOfKinController } from './next-of-kin.controller';

@Module({
  controllers: [NextOfKinController],
  providers: [NextOfKinService],
})
export class NextOfKinModule {}
