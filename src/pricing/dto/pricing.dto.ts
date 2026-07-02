import { ApiProperty } from '@nestjs/swagger';
import { FieldTypeDto } from '@/field/dto/field-type.dto';

export class TimeSlotDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: '05:00:00' })
  start_time!: string;

  @ApiProperty({ example: '07:00:00' })
  end_time!: string;

  @ApiProperty({ example: 250000 })
  price!: number;

  @ApiProperty({ example: false })
  is_peak_hour!: boolean;

  @ApiProperty({ type: () => FieldTypeDto })
  fieldType!: FieldTypeDto;
}
