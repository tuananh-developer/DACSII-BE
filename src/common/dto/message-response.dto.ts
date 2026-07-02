import { ApiProperty } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty({
    description: 'Thông báo từ hệ thống',
    example: 'Thao tác thành công.',
  })
  message!: string;
}
