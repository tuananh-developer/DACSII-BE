import { ApiProperty } from '@nestjs/swagger';

/**
 * @class TokenResponseDto
 * @description DTO trả về khi làm mới token thành công.
 */
export class TokenResponseDto {
  @ApiProperty({ description: 'JWT Access Token mới' })
  accessToken!: string;
}
