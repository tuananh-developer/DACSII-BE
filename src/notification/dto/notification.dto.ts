import { ApiProperty } from '@nestjs/swagger';

export class NotificationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Thanh toán thành công' })
  title!: string;

  @ApiProperty({ example: 'Đơn đặt sân #123 của bạn đã được xác nhận.' })
  content!: string;

  @ApiProperty({ example: false })
  isRead!: boolean;

  @ApiProperty()
  createdAt!: Date;
}
