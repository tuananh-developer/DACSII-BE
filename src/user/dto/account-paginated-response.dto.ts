import { ApiProperty } from '@nestjs/swagger';
import { AccountResponseDto } from './account-response.dto';

export class AccountPaginatedResponseDto {
  @ApiProperty({ type: [AccountResponseDto] })
  data!: AccountResponseDto[];

  @ApiProperty()
  total!: number;
}
