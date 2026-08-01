import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { CloudinaryModule } from '@/cloudinary/cloudinary.module';

@Module({
  imports: [CloudinaryModule],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
