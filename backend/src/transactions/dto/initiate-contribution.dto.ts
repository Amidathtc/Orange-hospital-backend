import { IsEnum, IsInt, Min } from 'class-validator';
import { FundType } from '@prisma/client';

export class InitiateContributionDto {
  @IsEnum(FundType)
  fundType: FundType;

  // In kobo — lets a member pay for multiple days/weeks at once (the "3x" chips from the demo).
  @IsInt()
  @Min(1000)
  amount: number;
}
