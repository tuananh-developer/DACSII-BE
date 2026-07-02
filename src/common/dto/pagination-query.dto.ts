import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, description: 'Số thứ tự trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Trang phải bắt đầu từ 1' })
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, default: 10, description: 'Số lượng kết quả trên mỗi trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Số lượng mỗi trang phải lớn hơn 0' })
  limit?: number = 10;
}
