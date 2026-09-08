import { IsEnum, IsInt, IsUUID, Max, Min } from 'class-validator';
import { FundType } from '@prisma/client';

// ₦200,000 in a single walk-in entry is already generous for a daily/weekly
// cash contribution — anything above this almost certainly means a typo
// (an extra zero) or something worth a second look, not routine use.
const MAX_WALKIN_KOBO = 20_000_000;

export class LogWalkInDto {
  @IsUUID()
  memberId: string;

  @IsEnum(FundType)
  fundType: FundType;

  // In kobo — e.g. ₦1,000 is sent as 100000.
  @IsInt()
  @Min(1000)
  @Max(MAX_WALKIN_KOBO)
  amount: number;
}
