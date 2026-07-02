import { ApiProperty } from '@nestjs/swagger';

export class VoucherCheckResponseDto {
  @ApiProperty({ example: true })
  isValid!: boolean;

  @ApiProperty({ example: 'SUMMER2024' })
  code!: string;

  @ApiProperty({ example: 50000 })
  discountAmount!: number;

  @ApiProperty({ example: 450000 })
  finalAmount!: number;

  @ApiProperty({ example: 'Áp dụng mã giảm giá thành công' })
  message!: string;
}
