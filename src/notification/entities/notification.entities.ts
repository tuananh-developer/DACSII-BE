import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserProfile } from '@/user/entities/users-profile.entity';
import { ApiProperty } from '@nestjs/swagger';

/**
 * @class Notification
 * @description Đại diện cho bảng `notifications` trong cơ sở dữ liệu.
 * Lưu trữ thông tin về một thông báo được gửi đến người dùng.
 */
@Entity({ name: 'notifications' })
export class Notification {
  /**
   * ID duy nhất của thông báo, được tạo tự động dưới dạng UUID.
   */
  @ApiProperty({ description: 'ID duy nhất của thông báo', format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Tiêu đề của thông báo.
   */
  @ApiProperty({
    description: 'Tiêu đề thông báo',
    example: 'Thanh toán thành công',
  })
  @Column()
  title!: string;

  /**
   * Nội dung chi tiết của thông báo.
   */
  @ApiProperty({
    description: 'Nội dung chi tiết',
    example: 'Đơn đặt sân #123 của bạn đã được xác nhận.',
  })
  @Column('text')
  content!: string;

  /**
   * Trạng thái đã đọc của thông báo.
   * `true` nếu người dùng đã đọc, `false` nếu chưa. Mặc định là `false`.
   */
  @ApiProperty({ description: 'Trạng thái đã đọc', example: false })
  @Column({ name: 'is_read', default: false })
  isRead!: boolean;

  /**
   * Dấu thời gian khi thông báo được tạo.
   */
  @ApiProperty({ description: 'Thời điểm tạo thông báo' })
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  /**
   * Mối quan hệ Nhiều-Một với thực thể UserProfile.
   * Mỗi thông báo thuộc về một người nhận (recipient) duy nhất.
   */
  @ManyToOne(() => UserProfile)
  @JoinColumn({ name: 'recipient_id' })
  recipient!: UserProfile;
}
