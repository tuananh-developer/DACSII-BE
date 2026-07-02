import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, IsInt } from 'class-validator';

/**
 * @class UpdateAddressDto
 * @description DTO để cập nhật thông tin địa chỉ.
 */
export class UpdateAddressDto {
  @ApiProperty({ description: 'Số nhà, tên đường', example: '123 Võ Văn Ngân' })
  @IsString()
  @MaxLength(255)
  street!: string;

  @ApiProperty({ description: 'ID của Thành phố' })
  @IsInt()
  cityId!: number;

  @ApiProperty({ description: 'ID của Phường/Xã' })
  @IsInt()
  wardId!: number;
}
