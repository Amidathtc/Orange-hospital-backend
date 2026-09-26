import { IsOptional, IsString, IsIn, MinLength, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ReferralsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;

  @IsOptional()
  @IsIn(['registeredAt', 'fullName'])
  sort?: 'registeredAt' | 'fullName' = 'registeredAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}
