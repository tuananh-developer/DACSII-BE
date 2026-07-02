import { ApiProperty } from '@nestjs/swagger';
import { NotificationDto } from './notification.dto';
import { NotificationPaginationMetaDto } from './notification-pagination-meta.dto';

export class NotificationPaginatedResponseDto {
  @ApiProperty({ type: [NotificationDto] })
  data!: NotificationDto[];

  @ApiProperty({ type: NotificationPaginationMetaDto })
  meta!: NotificationPaginationMetaDto;
}
