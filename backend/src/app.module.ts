import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { FundsModule } from './funds/funds.module';
import { TransactionsModule } from './transactions/transactions.module';
import { DrawRequestsModule } from './draw-requests/draw-requests.module';
import { NextOfKinModule } from './next-of-kin/next-of-kin.module';
import { BeneficiaryClaimsModule } from './beneficiary-claims/beneficiary-claims.module';
import { MarketerModule } from './marketer/marketer.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Applies globally: max 20 requests per IP per minute. Generous enough for
    // normal use, tight enough to blunt a scripted password-guessing attempt
    // against a phone number.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    PrismaModule,
    EmailModule,
    AuthModule,
    FundsModule,
    TransactionsModule,
    DrawRequestsModule,
    NextOfKinModule,
    BeneficiaryClaimsModule,
    MarketerModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
