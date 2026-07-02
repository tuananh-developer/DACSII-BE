import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from './pagination-meta.dto';

export abstract class PaginatedResponseDto<T> {
  abstract data: T[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
