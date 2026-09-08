import { IsString, MinLength } from 'class-validator';

export class UpsertNextOfKinDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsString()
  @MinLength(2)
  relationship: string;

  @IsString()
  @MinLength(10)
  phone: string;
}
