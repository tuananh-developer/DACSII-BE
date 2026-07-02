import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';

/**
 * @class LoginResponseDto
 * @description DTO cho phản hồi đăng nhập thành công.
 */
export class LoginResponseDto {
  @ApiProperty({ description: 'JWT Access Token dùng để truy cập các tài nguyên bảo mật' })
  accessToken!: string;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}
