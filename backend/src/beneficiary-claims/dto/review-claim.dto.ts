import { IsIn, IsOptional, IsString } from 'class-validator';

export class ReviewClaimDto {
  @IsIn(['APPROVED', 'DECLINED'])
  decision: 'APPROVED' | 'DECLINED';

  // Where the admin records what proof was shown — a death certificate,
  // family confirmation, whatever Dr. Megbuwawon's process actually is.
  @IsOptional()
  @IsString()
  notes?: string;
}
