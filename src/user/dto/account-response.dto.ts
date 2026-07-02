import { ApiProperty } from '@nestjs/swagger';
import { AuthProvider } from '../enum/auth-provider.enum';
import { UserProfileResponseDto } from './user-profile-response.dto';
import { Role } from '../entities/role.entity';

export class AccountResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ enum: AuthProvider })
  provider!: AuthProvider;

  @ApiProperty()
  is_verified!: boolean;

  @ApiProperty({ required: false })
  last_login?: Date;

  @ApiProperty()
  created_at!: Date;

  @ApiProperty()
  updated_at!: Date;

  @ApiProperty({ type: () => Role })
  role!: Role;

  @ApiProperty()
  status!: boolean;

  @ApiProperty({ type: () => UserProfileResponseDto })
  userProfile!: UserProfileResponseDto;
}
