# Backend - API Đặt Sân Bóng (DACS II)

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<p align="center">
  Backend API được xây dựng bằng <a href="http://nestjs.com/" target="blank">NestJS</a> cho dự án ứng dụng đặt sân bóng đá.
</p>

## 📜 Giới thiệu

Đây là mã nguồn backend cho dự án Đồ án cơ sở ngành 2 (DACS II). Hệ thống cung cấp các API cần thiết để quản lý người dùng, sân bóng, lịch đặt, thanh toán, và nhiều tính năng khác.

## ✨ Tính năng nổi bật

- **Quản lý người dùng & Xác thực:** Đăng ký, đăng nhập (Email/Password, Google), quản lý hồ sơ, phân quyền.
- **Quản lý sân bóng:** Tạo, xem, cập nhật, xóa thông tin sân, tìm kiếm sân theo vị trí, thời gian.
- **Đặt sân (Booking):** Xử lý logic đặt sân theo khung giờ, đảm bảo không bị trùng lặp (sử dụng transaction và locking).
- **Thanh toán:** Tích hợp cổng thanh toán VNPay để xử lý giao dịch.
- **Quản lý Voucher:** Tạo và áp dụng mã giảm giá.
- **Đánh giá & Phản hồi:** Người dùng có thể đánh giá sân bóng và gửi phản hồi.
- **Thông báo:** Hệ thống thông báo real-time qua WebSocket (Socket.IO).
- **Bảo mật:** Tích hợp `helmet`, `rate-limiting` (throttler), và `CORS` để tăng cường bảo mật.

## 🛡️ Bảo mật

Hệ thống được xây dựng với nhiều lớp bảo vệ để đảm bảo an toàn dữ liệu và chống lại các hình thức tấn công phổ biến:

- **HTTP Headers với `helmet`**: Tự động thiết lập các HTTP header bảo mật (như `X-Content-Type-Options`, `Strict-Transport-Security`, `X-Frame-Options`) để bảo vệ ứng dụng khỏi các lỗ hổng như Clickjacking và XSS.
- **CORS (Cross-Origin Resource Sharing)**: Cấu hình chặt chẽ để chỉ cho phép các yêu cầu từ địa chỉ frontend (`FRONTEND_URL_WEB`), ngăn chặn các trang web không mong muốn truy cập tài nguyên.
- **Rate Limiting (Giới hạn yêu cầu)**: Sử dụng `@nestjs/throttler` để chống lại các cuộc tấn công brute-force vào các endpoint nhạy cảm như đăng nhập và đặt sân.
- **Validation Pipes**: Mọi dữ liệu đầu vào từ client đều được xác thực (`whitelist: true`, `forbidNonWhitelisted: true`), đảm bảo chỉ các dữ liệu hợp lệ mới được xử lý và ngăn chặn các payload độc hại.
- **Global Exception Filter**: Một bộ lọc lỗi toàn cục được áp dụng để bắt tất cả các lỗi, ngăn chặn việc rò rỉ thông tin nhạy cảm (như stack trace, đường dẫn file) ra phía client.
- **Data Serialization**: Sử dụng `ClassSerializerInterceptor` và decorator `@Exclude` để đảm bảo các thông tin nhạy cảm (ví dụ: `password_hash`, `phone_number`) không bao giờ bị lộ trong các phản hồi API.

## 🚀 Công nghệ sử dụng

- **Framework:** NestJS
- **Ngôn ngữ:** TypeScript
- **Cơ sở dữ liệu:** MySQL (quản lý qua TypeORM)
- **Xác thực:** JWT (Access & Refresh Tokens), OAuth 2.0 (Google)
- **Thanh toán:** VNPay
- **Real-time:** WebSocket (Socket.IO)
- **API Documentation:** Swagger
- **Validation:** `class-validator`, `class-transformer`

## ⚙️ Cài đặt và Chạy dự án

### 1. Yêu cầu

- Node.js (v18.x trở lên)
- npm hoặc yarn
- Một instance Mysql đang chạy

### 2. Cài đặt

```bash
# Clone repository
git clone <your-repository-url>
cd backend

# Cài đặt các dependencies
npm install
```

### 3. Cấu hình biến môi trường

Tạo một file `.env` ở thư mục gốc của backend và sao chép nội dung từ file `.env.example` (nếu có) hoặc sử dụng mẫu dưới đây.

```env
# Application
PORT=3001
FRONTEND_URL=http://localhost:4200

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_db_password
DB_DATABASE=your_db_name

# JWT Secrets
ACCESS_TOKEN_SECRET=your_access_token_secret
REFRESH_TOKEN_SECRET=your_refresh_token_secret
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Google OAuth 2.0
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/google/callback

# VNPay
VNP_TMNCODE=your_tmn_code
VNP_HASHSECRET=your_hash_secret
VNP_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNP_RETURNURL=http://localhost:3000/api/v1/payments/vnpay-return

# Mailer (Sử dụng cho việc gửi OTP, thông báo)
MAIL_HOST=smtp.gmail.com
MAIL_USER=your_email@gmail.com
MAIL_PASS=your_app_password # Mật khẩu ứng dụng của Gmail
MAIL_FROM="Your App Name" <no-reply@yourapp.com>
```

### 4. Chạy ứng dụng

```bash
# Chế độ development (với hot-reload)
npm run start:dev

# Chế độ production
npm run build
npm run start:prod
```

## 📚 API Documentation

Sau khi khởi động server, truy cập vào đường dẫn sau để xem tài liệu API được tạo bởi Swagger:

**<http://localhost:3000/api-doc>**

## 🧪 Chạy Tests

```bash
# Unit tests
npm run test

# End-to-end tests
npm run test:e2e

# Test coverage
npm run test:cov
```
