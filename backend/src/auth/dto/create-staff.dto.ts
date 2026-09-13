import { IsEmail, IsEnum, IsOptional, IsString, MinLength, Matches } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateStaffDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsString()
  @Matches(/^0\d{10}$/, { message: 'Phone number must be an 11-digit number starting with 0 (e.g., 08012345678)' })
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(Role, { message: 'role must be RECEPTIONIST or ADMIN' })
  role: Role;
}

