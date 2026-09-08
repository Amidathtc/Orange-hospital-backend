import { IsInt, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

const MAX_CLAIM_KOBO = 50_000_000; // ₦500,000 sanity ceiling per claim

export class CreateClaimDto {
  @IsUUID()
  deceasedMemberId: string;

  @IsString()
  @MinLength(2)
  claimantName: string;

  @IsString()
  @MinLength(10)
  claimantPhone: string;

  @IsString()
  @MinLength(2)
  claimantRelationship: string;

  // In kobo — capped at what the member's actual General Ajo balance allows,
  // re-checked atomically at approval regardless of what's requested here.
  @IsInt()
  @Min(1000)
  @Max(MAX_CLAIM_KOBO)
  amount: number;
}
