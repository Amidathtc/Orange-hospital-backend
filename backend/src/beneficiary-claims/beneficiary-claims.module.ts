import { Module } from '@nestjs/common';
import { BeneficiaryClaimsService } from './beneficiary-claims.service';
import { BeneficiaryClaimsController } from './beneficiary-claims.controller';

@Module({
  controllers: [BeneficiaryClaimsController],
  providers: [BeneficiaryClaimsService],
})
export class BeneficiaryClaimsModule {}
