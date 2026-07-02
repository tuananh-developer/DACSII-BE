import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '@/common/dto/pagination-meta.dto';

export class ReviewPaginationMetaDto extends PaginationMetaDto {
  @ApiProperty({ example: 4.5 })
  averageRating!: number;
}
