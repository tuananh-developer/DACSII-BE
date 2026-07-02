// dto/create-employee.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Gender } from '../enum/gender.enum';
import { RoleEnum } from '../../auth/enums/role.enum';

export class CreateEmployeeDto {
  @ApiProperty({
    description: 'Email của nhân viên',
    example: 'staff@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    description: 'Mật khẩu của nhân viên (tối thiểu 6 ký tự)',
    example: 'password123',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @ApiProperty({ description: 'Họ và tên đầy đủ', example: 'Lê Thị B' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ description: 'Số điện thoại', example: '0912345678' })
  @IsString()
  @IsNotEmpty()
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Giới tính',
    enum: Gender,
    example: 'female',
  })
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ description: 'Tiểu sử ngắn', required: false })
  @IsOptional()
  bio?: string;

  // Trường này không còn được sử dụng và sẽ bị bỏ qua. Branch ID được lấy tự động từ người tạo.
  @ApiPropertyOptional({
    description:
      '[DEPRECATED] Trường này không còn được sử dụng. ID chi nhánh được lấy tự động từ người tạo.',
    format: 'uuid',
  })
  @IsString()
  @IsOptional()
  branchId?: string;

  @ApiProperty({
    description: 'Vai trò của nhân viên',
    enum: [RoleEnum.Manager, RoleEnum.Staff],
    example: RoleEnum.Staff,
  })
  @IsEnum([RoleEnum.Manager, RoleEnum.Staff], {
    message: 'Vai trò phải là "branch_manager" hoặc "staff"',
  })
  @IsNotEmpty()
  role!: RoleEnum.Manager | RoleEnum.Staff;
}
