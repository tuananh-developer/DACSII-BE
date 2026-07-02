import { ApiProperty } from '@nestjs/swagger';
import { UtilityType } from '../enums/utility-type.enum';

export class UtilityDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Wi-Fi miễn phí' })
  name!: string;

  @ApiProperty({ required: false, example: 'https://example.com/icons/wifi.png' })
  iconUrl!: string;

  @ApiProperty({ required: false, example: 20000 })
  price!: number;

  @ApiProperty({ enum: UtilityType })
  type!: UtilityType;
}
