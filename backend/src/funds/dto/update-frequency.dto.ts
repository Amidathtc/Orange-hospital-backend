import { IsEnum, IsInt, Min } from 'class-validator';
import { FundType, Frequency } from '@prisma/client';

export class UpdateFrequencyDto {
  @IsEnum(FundType)
  type: FundType;

  @IsEnum(Frequency)
  frequency: Frequency;

  // Amount in kobo, per contribution cycle (e.g. 5000 = ₦50/day if frequency is DAILY).
  @IsInt()
  @Min(1000) // ₦10 floor — keeps someone from setting an effectively-zero plan by mistake
  amount: number;
}
