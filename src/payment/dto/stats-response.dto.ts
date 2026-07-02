import { ApiProperty } from '@nestjs/swagger';

export class StatsResponseDto {
  @ApiProperty({ example: 15000000 })
  revenue!: number;

  @ApiProperty({
    example: {
      pending: 5,
      completed: 10,
      failed: 2,
    },
  })
  transactions!: Record<string, number>;
}
