import { Module } from '@nestjs/common';
import { FieldsService } from './fields.service';
import { HttpModule } from '@nestjs/axios';
import { FieldsController } from './fields.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Field } from './entities/field.entity';
import { FieldType } from './entities/field-types.entity';
import { LocationModule } from '@/location/locations.module';
import { UsersModule } from '@/user/users.module';
import { AuthModule } from '@/auth/auth.module';
import { FieldImage } from './entities/field-image.entity';
import { Ward } from '@/location/entities/ward.entity';
import { City } from '@/location/entities/city.entity';
import { Utility } from '../utility/entities/utility.entity';
import { Branch } from '@/branch/entities/branch.entity';
import { FieldTypeService } from './field-type.service';
import { FieldTypeController } from './field-type.controller';
import { TimeSlot } from '../pricing/entities/time-slot.entity';
import { UploadModule } from '@/upload/upload.module';

/**
 * @module FieldsModule
 * @description
 * Module này đóng gói tất cả các chức năng liên quan đến quản lý sân bóng.
 * Nó bao gồm các controllers, services, và entities cần thiết để thực hiện các thao tác CRUD
 * và các logic nghiệp vụ khác liên quan đến sân bóng, loại sân, hình ảnh, và tiện ích.
 */
@Module({
  imports: [
    // Đăng ký các entities liên quan đến sân bóng với TypeORM.
    TypeOrmModule.forFeature([
      Field,
      FieldType,
      FieldImage,
      Utility,
      Ward,
      City,
      Branch,
      TimeSlot,
    ]),
    // Import HttpModule để có thể inject HttpService
    HttpModule,
    // Import LocationModule để có thể sử dụng các service/entity liên quan đến địa chỉ.
    LocationModule,
    // Import AuthModule để sử dụng các Guards (JwtAuthGuard, RolesGuard) trong FieldsController.
    AuthModule,
    // Import UsersModule để có thể truy cập UsersService, cần thiết để lấy thông tin chủ sân (owner).
    UsersModule,
    // Import UploadModule để cung cấp UploadService, xử lý việc tải lên hình ảnh sân bóng.
    UploadModule,
  ],
  // Cung cấp FieldsService và FieldTypeService để xử lý logic nghiệp vụ.
  providers: [FieldsService, FieldTypeService],
  // Đăng ký FieldsController và FieldTypeController để xử lý các request HTTP.
  controllers: [FieldsController, FieldTypeController],
  // Export FieldsService để các module khác (ví dụ: BookingsModule) có thể sử dụng.
  exports: [FieldsService],
})
export class FieldsModule {}
