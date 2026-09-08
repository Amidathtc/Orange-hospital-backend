import { IsEnum, IsInt, IsString, Min, MinLength } from 'class-validator';
import { FundType } from '@prisma/client';

export class CreateDrawRequestDto {
  @IsEnum(FundType)
  fundType: FundType;

  // In kobo.
  @IsInt()
  @Min(1000)
  amount: number;

  @IsString()
  @MinLength(5)
  reason: string;
}
