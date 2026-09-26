import { Module } from '@nestjs/common';
import { MarketerController } from './marketer.controller';
import { MarketerService } from './marketer.service';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MarketerController],
  providers: [MarketerService],
})
export class MarketerModule {}
