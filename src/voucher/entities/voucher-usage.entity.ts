import { UserProfile } from '@/user/entities/users-profile.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Voucher } from './voucher.entity';

@Entity({ name: 'voucher_usages' })
@Index(['userProfileId', 'voucherId'], { unique: true })
export class VoucherUsage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => UserProfile)
  @JoinColumn({ name: 'user_profile_id' })
  userProfile!: UserProfile;

  @Column({ name: 'user_profile_id' })
  userProfileId!: string;

  @ManyToOne(() => Voucher)
  @JoinColumn({ name: 'voucher_id' })
  voucher!: Voucher;

  @Column({ name: 'voucher_id' })
  voucherId!: string;

  @CreateDateColumn({ name: 'used_at' })
  usedAt!: Date;

  @Column({ name: 'booking_id', nullable: true })
  bookingId!: string;
}
