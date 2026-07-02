import { ApiProperty } from '@nestjs/swagger';

export class RevenueChartItemDto {
  @ApiProperty({ example: 1 })
  month!: number;

  @ApiProperty({ example: 5000000 })
  revenue!: number;
}
