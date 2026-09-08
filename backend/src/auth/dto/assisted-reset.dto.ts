import { IsString, IsUUID, MinLength } from 'class-validator';

export class AssistedResetDto {
  @IsUUID()
  memberId: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
