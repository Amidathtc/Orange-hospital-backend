import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateStaffDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsString()
  @MinLength(10)
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
