import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

/**
 * @module DatabaseModule
 * @description Module chịu trách nhiệm cấu hình và cung cấp kết nối cơ sở dữ liệu cho toàn bộ ứng dụng.
 * Nó sử dụng TypeOrmModule.forRootAsync để đọc cấu hình từ ConfigService,
 * cho phép cấu hình kết nối một cách linh hoạt thông qua các biến môi trường.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        autoLoadEntities: true, // Tự động load các file entity
        synchronize: true, // Không tự động đồng bộ CSDL,
        ssl: {
          rejectUnauthorized: true,
        },
      }),
    }),
  ],
  exports: [TypeOrmModule], // Xuất TypeOrmModule để các module khác có thể dùng forFeature
})
export class DatabaseModule {}
