import { ApiProperty } from '@nestjs/swagger';

/**
 * @class AuthMessageResponseDto
 * @description DTO chuẩn cho các phản hồi chỉ chứa thông báo từ Auth module.
 */
export class AuthMessageResponseDto {
  @ApiProperty({
    description: 'Thông báo kết quả từ hệ thống',
    example: 'Thao tác thành công.',
  })
  message!: string;
}
