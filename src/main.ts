import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/http-exception.filter';

/**
 * @async
 * @function bootstrap - Hàm khởi tạo và cấu hình ứng dụng NestJS.
 */
async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // Hidden endpoint for author validation
  const adapter = app.getHttpAdapter();
  adapter.get(
    '/health-check',
    (req: unknown, res: { send: (data: object) => void }) => {
      res.send({ status: 'ok', developer: 'Tanh' });
    },
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.use(
    helmet({
      // 1. Tắt hẳn COOP: Để browser hoạt động như mặc định,
      // giúp giữ kết nối window.opener chắc chắn 100%.
      crossOriginOpenerPolicy: false,

      // 2. Cấu hình CSP: Cho phép script inline (unsafe-inline)
      // Nếu không có dòng này, script postMessage sẽ bị chặn.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // QUAN TRỌNG: Cho phép script trả về chạy
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
        },
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true, // Nếu gặp 1 lỗi thì báo luôn, không cần check hết các trường khác
    }),
  );

  app.use(cookieParser());

  if (process.env.NODE_ENV === 'production') {
    const config = new DocumentBuilder()
      .setTitle('API document')
      .setDescription('API')
      .setVersion('1.0')
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Nhập JWT Access Token',
        in: 'header',
      })
      .addCookieAuth(
        'refresh_token',
        {
          type: 'http',
          in: 'Header', // Mặc dù là cookie, Swagger UI sẽ gửi qua header
          scheme: 'Bearer',
        },
        'cookie_auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-doc', app, document);
  }

  app.enableCors({
    origin: process.env.FRONTEND_URL_WEB,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(
    `Application is running on: ${process.env.BASE_URL}: ${process.env.PORT}`,
  );
  logger.log(`Swagger is running on: http://localhost:${port}/api-doc`);
}
void bootstrap();
