import { ApiProperty } from '@nestjs/swagger';
import { ReviewDto } from './review.dto';
import { ReviewPaginationMetaDto } from './review-pagination-meta.dto';

export class ReviewPaginatedResponseDto {
  @ApiProperty({ type: [ReviewDto] })
  data!: ReviewDto[];

  @ApiProperty({ type: ReviewPaginationMetaDto })
  meta!: ReviewPaginationMetaDto;
}
