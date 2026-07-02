import { ApiProperty } from '@nestjs/swagger';

/**
 * @class UserResponseDto
 * @description DTO chứa thông tin tối giản của người dùng trả về cho client.
 */
export class UserResponseDto {
  @ApiProperty({ example: 'uuid-123-456' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  full_name!: string;

  @ApiProperty({ example: '/uploads/avatar.jpg', required: false })
  avatar_url?: string;

  @ApiProperty({ example: 'CUSTOMER' })
  role!: string;

  @ApiProperty({ example: true })
  is_profile_complete!: boolean;

  @ApiProperty({ example: true })
  is_active!: boolean;

  @ApiProperty({
    description: 'Thông tin chi nhánh (nếu có)',
    required: false,
    example: { branchId: 'uuid-branch-789' }
  })
  branch?: {
    branchId?: string;
  };
}
