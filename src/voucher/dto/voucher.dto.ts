import { ApiProperty } from '@nestjs/swagger';

export class VoucherDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'SUMMER2024' })
  code!: string;

  @ApiProperty({ required: false })
  discountAmount!: number | null;

  @ApiProperty({ required: false })
  discountPercentage!: number | null;

  @ApiProperty({ required: false })
  maxDiscountAmount!: number | null;

  @ApiProperty()
  minOrderValue!: number;

  @ApiProperty()
  validFrom!: Date;

  @ApiProperty()
  validTo!: Date;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ required: false })
  userProfileId!: string | null;

  @ApiProperty({ default: false })
  isCollectible!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
