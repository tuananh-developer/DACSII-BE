import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '../enum/gender.enum';
import { AddressResponseDto } from '@/location/dto/address-response.dto';

export class UserProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  full_name!: string;

  @ApiProperty({
    description: 'Ngày sinh của người dùng',
    example: '2000-01-20',
    required: false,
  })
  date_of_birth!: Date | null;

  @ApiProperty({ enum: Gender, example: Gender.MALE, required: false })
  gender?: Gender | null;

  @ApiProperty({
    description: 'Số điện thoại của người dùng',
    example: '0987654321',
    required: false,
  })
  phone_number!: string;

  @ApiProperty({
    example: '/uploads/avatar.jpg',
    required: false,
  })
  avatar_url?: string;

  @ApiProperty({ example: 'Thích đá bóng', required: false })
  bio?: string | null;

  @ApiProperty({
    description: 'Cờ báo hiệu hồ sơ đã hoàn chỉnh hay chưa',
    example: true,
  })
  is_profile_complete!: boolean;

  @ApiProperty()
  created_at!: Date;

  @ApiProperty()
  updated_at!: Date;

  @ApiProperty({ type: AddressResponseDto, required: false })
  address!: AddressResponseDto | null;
}
