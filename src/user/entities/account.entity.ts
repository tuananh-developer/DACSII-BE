import {
  Entity,
  Column,
  JoinColumn,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserProfile } from './users-profile.entity';
import { Exclude } from 'class-transformer';
import { AccountStatus } from '../enum/account-status.enum';
import { AuthProvider } from '../enum/auth-provider.enum';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from './role.entity';

/**
 * @enum Roles
 * @class Account
 * @description Đại diện cho bảng `accounts` trong cơ sở dữ liệu.
 * Lưu trữ thông tin xác thực và trạng thái cốt lõi của người dùng.
 */
@Entity({ name: 'accounts' })
export class Account {
  /**
   * ID duy nhất của tài khoản, được tạo tự động dưới dạng UUID.
   */
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Địa chỉ email của người dùng, là duy nhất trong hệ thống.
   */
  @ApiProperty({ example: 'user@example.com' })
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  /**
   * Mật khẩu đã được hash của người dùng. Có thể là null nếu đăng ký qua OAuth.
   */
  @Column({ type: 'varchar', length: 255, nullable: true }) // Mật khẩu có thể null nếu dùng OAuth
  @Exclude()
  password_hash!: string | null;

  /**
   * Nhà cung cấp xác thực đã được sử dụng để tạo tài khoản (ví dụ: 'credentials', 'google').
   */
  @ApiProperty({ enum: AuthProvider, example: AuthProvider.CREDENTIALS })
  @Column({
    type: 'enum',
    enum: AuthProvider,
    default: AuthProvider.CREDENTIALS,
  })
  provider!: AuthProvider;

  /**
   * Trạng thái hiện tại của tài khoản (ví dụ: 'active', 'suspended').
   */
  @ApiProperty({ enum: AccountStatus, example: AccountStatus.ACTIVE })
  @Column({
    type: 'varchar',
    length: 20,
    default: 'active',
  })
  status!: AccountStatus;

  /**
   * Cờ cho biết tài khoản đã được xác thực email hay chưa.
   */
  @ApiProperty({ example: true })
  @Column({ type: 'boolean', default: false })
  is_verified!: boolean;

  /**
   * Dấu thời gian của lần đăng nhập cuối cùng.
   */
  @ApiProperty()
  @Column({ type: 'timestamp', nullable: true })
  last_login!: Date;

  /**
   * Cờ cho biết xác thực hai yếu tố (2FA) có được bật hay không.
   */
  @ApiProperty({ example: false })
  @Column({ type: 'boolean', default: false })
  two_factor_enabled!: boolean;

  /**
   * Khóa bí mật được sử dụng để tạo mã 2FA.
   */
  @Exclude()
  @Column({ type: 'varchar', nullable: true })
  two_factor_secret!: string;

  /**
   * Các mã khôi phục 2FA (thường được lưu dưới dạng hash hoặc chuỗi đã mã hóa).
   */
  @Exclude()
  @Column({ type: 'text', nullable: true })
  two_factor_recovery_codes!: string | null;

  /**
   * Mã xác thực tạm thời được gửi qua email để hoàn tất đăng ký.
   */
  @Exclude()
  @Column({ type: 'varchar', length: 100, nullable: true })
  verification_code!: string | null;

  /**
   * Dấu thời gian khi mã xác thực hết hạn.
   */
  @Exclude()
  @Column({ type: 'datetime', nullable: true })
  verification_code_expires_at!: Date | null;

  /**
   * Refresh token đã được hash, dùng để quản lý phiên đăng nhập.
   */
  @Column({ type: 'varchar', default: null })
  @Exclude()
  hashed_refresh_token!: string | null;

  /**
   * Google OAuth access token, dùng để revoke khi logout.
   */
  @Column({ name: 'google_access_token', type: 'text', nullable: true })
  @Exclude()
  google_access_token?: string | null;

  /**
   * Token dùng cho việc đặt lại mật khẩu, bản hash được lưu để bảo mật.
   */
  @Exclude()
  @Column({
    name: 'password_reset_token',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  password_reset_token?: string | null;

  /**
   * Dấu thời gian khi token đặt lại mật khẩu hết hạn.
   */
  @Exclude()
  @Column({ name: 'password_reset_expires', type: 'datetime', nullable: true })
  password_reset_expires?: Date | null;

  /**
   * Dấu thời gian khi tài khoản được tạo.
   */
  @ApiProperty()
  @CreateDateColumn({
    name: 'created_at',
  })
  created_at!: Date;

  /**
   * Dấu thời gian khi tài khoản được cập nhật lần cuối.
   */
  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date;

  /**
   * Vai trò của tài khoản trong hệ thống.
   */
  @ApiProperty({ type: () => Role })
  @ManyToOne(() => Role, (role) => role.accounts)
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  /**
   * Mối quan hệ một-một với UserProfile, chứa thông tin hồ sơ chi tiết.
   * `cascade: true` đảm bảo UserProfile được lưu cùng lúc với Account.
   */
  @ApiProperty({ type: () => UserProfile })
  @OneToOne(() => UserProfile, (userProfile) => userProfile.account, {
    cascade: true,
  })
  @JoinColumn({ name: 'user_profile_id' })
  userProfile!: UserProfile;
}
