import { IsString, MinLength, Matches } from 'class-validator';

export class RegisterMemberDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsString()
  @Matches(/^0\d{10}$/, {
    message: 'Phone number must be an 11-digit number starting with 0 (e.g., 08012345678)',
  })
  phone: string;
}
