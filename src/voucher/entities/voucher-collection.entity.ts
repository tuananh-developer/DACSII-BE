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
import { ApiProperty } from '@nestjs/swagger';

@Entity({ name: 'voucher_collections' })
@Index(['userProfileId', 'voucherId'], { unique: true })
export class VoucherCollection {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => UserProfile)
  @JoinColumn({ name: 'user_profile_id' })
  userProfile!: UserProfile;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'user_profile_id' })
  userProfileId!: string;

  @ManyToOne(() => Voucher)
  @JoinColumn({ name: 'voucher_id' })
  voucher!: Voucher;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'voucher_id' })
  voucherId!: string;

  @ApiProperty({ description: 'Ngày thu thập' })
  @CreateDateColumn({ name: 'collected_at' })
  collectedAt!: Date;
}
