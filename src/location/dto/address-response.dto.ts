import { ApiProperty } from '@nestjs/swagger';

export class AddressResponseDto {
  @ApiProperty({ description: 'ID duy nhất của địa chỉ', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Số nhà, tên đường', example: '123 Võ Văn Ngân' })
  street!: string;

  @ApiProperty({ description: 'Vĩ độ', example: 10.853, required: false })
  latitude!: number | null;

  @ApiProperty({ description: 'Kinh độ', example: 106.77, required: false })
  longitude!: number | null;

  @ApiProperty({ description: 'Tên phường/xã' })
  ward_name!: string;

  @ApiProperty({ description: 'Tên thành phố' })
  city_name!: string;
}
