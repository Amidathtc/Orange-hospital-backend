import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { PaystackService } from './paystack.service';
import { MonnifyService } from './monnify.service';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService, PaystackService, MonnifyService],
})
export class TransactionsModule {}

