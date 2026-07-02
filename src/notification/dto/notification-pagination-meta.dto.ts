import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '@/common/dto/pagination-meta.dto';

export class NotificationPaginationMetaDto extends PaginationMetaDto {
  @ApiProperty({ example: 5 })
  unreadCount!: number;
}
