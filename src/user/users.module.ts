import { Module, BadRequestException, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Account } from './entities/account.entity';
import { UserProfile } from './entities/users-profile.entity';
import { Role } from './entities/role.entity';
import { Address } from '../location/entities/address.entity';
import { Branch } from '@/branch/entities/branch.entity';
import { UsersController } from './users.controller';
import { NotificationsModule } from '@/notification/notifications.module';
import { BranchModule } from '@/branch/branch.module'; // Giả định BranchModule tồn tại và export BranchModule

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, UserProfile, Role, Address, Branch]),
    // Sử dụng forwardRef để phá vỡ circular dependency với NotificationsModule
    // Lý do: NotificationsModule import UsersModule, và UsersModule có thể cần NotificationsModule trong tương lai.
    forwardRef(() => BranchModule), // Thêm forwardRef cho BranchModule để giải quyết các phụ thuộc vòng tiềm ẩn
    forwardRef(() => NotificationsModule),
    MulterModule.registerAsync({
      useFactory: () => ({
        storage: diskStorage({
          destination: './uploads',
          filename: (req, file, callback) => {
            const uniqueSuffix =
              Date.now() + '-' + Math.round(Math.random() * 1e9);
            const extension = extname(file.originalname);
            const filename = `${file.fieldname}-${uniqueSuffix}${extension}`;
            callback(null, filename);
          },
        }),

        limits: {
          fileSize: 5 * 1024 * 1024, // Giới hạn kích thước file tối đa 5MB
        },

        fileFilter: (req, file, callback) => {
          if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
            return callback(
              new BadRequestException('Chỉ cho phép tải lên file ảnh!'),
              false,
            );
          }
          callback(null, true);
        },
      }),
    }),
  ],
  providers: [UsersService],
  exports: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
