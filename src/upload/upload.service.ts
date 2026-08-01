import { CloudinaryService } from '@/cloudinary/cloudinary.service';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import fs from 'fs';
import path from 'path';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly cloudinaryService: CloudinaryService) {}

  async uploadImage(file: Express.Multer.File): Promise<string | undefined> {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      this.logger.log(`đẩy lên cloud: ${file.originalname}`);
      try {
        const result = await this.cloudinaryService.uploadFile(
          file,
          'datsan-prod',
        );
        return result?.secure_url as string;
      } catch (e: unknown) {
        if (e instanceof Error) {
          this.logger.error(`Lỗi: ${e.message}`, UploadService.name);
        }
        throw new InternalServerErrorException('Lỗi khi upload');
      }
    } else {
      this.logger.log(`Lưu local: ${file.originalname}`);
      try {
        const uploadDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        const fileName = `${uniqueSuffix}${ext}`;
        const filePath = path.join(uploadDir, fileName);

        await fs.promises.writeFile(filePath, file.buffer);

        return `${process.env.BASE_URL}/uploads/${fileName}`;
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error(`Lỗi khi lưu local: ${error.stack}`);
        }
        throw new InternalServerErrorException('Đã xảy ra lỗi khi lưu');
      }
    }
  }
}
