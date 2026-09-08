import { IsIn } from 'class-validator';

export class ReviewDrawRequestDto {
  @IsIn(['APPROVED', 'DECLINED'])
  decision: 'APPROVED' | 'DECLINED';
}
