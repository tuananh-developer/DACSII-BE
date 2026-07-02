import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  Query,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  UseGuards,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BookingService } from '@/booking/booking.service';
import { BookingStatus } from '@/booking/enums/booking-status.enum';
import { User } from '@/auth/decorator/users.decorator';
import { AuthenticatedUser } from '@/auth/interface/authenicated-user.interface';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { VnpayIpnDto } from './dto/vnpay-ipn.dto';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/role.guard';
import { Roles } from '@/auth/decorator/roles.decorator';
import { RoleEnum } from '@/auth/enums/role.enum';
import { SkipThrottle } from '@nestjs/throttler';
import { VnpayReturnDto } from './dto/vnpay-return.dto';
import { ConfigService } from '@nestjs/config';

import { StatsResponseDto } from './dto/stats-response.dto';
import { RevenueChartItemDto } from './dto/revenue-chart-item.dto';
import { PaymentUrlResponseDto } from './dto/payment-url-response.dto';

/**
 * @controller PaymentController
 * @description Xử lý các yêu cầu HTTP liên quan đến thanh toán.
 * Chịu trách nhiệm tích hợp với cổng thanh toán VNPAY, bao gồm tạo URL thanh toán,
 * xử lý URL trả về (return URL) và URL thông báo tức thì (IPN).
 * Đồng thời cung cấp các endpoint cho việc thống kê doanh thu.
 */
@ApiTags('Payment (Thanh toán & Thống kê)')
@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);
  /**
   * @constructor
   * @param {PaymentService} paymentService - Service xử lý logic thanh toán.
   * @param {BookingService} bookingService - Service để truy vấn thông tin đặt sân.
   * @param {ConfigService} configService - Service để lấy thông tin cấu hình.
   */
  constructor(
    private readonly paymentService: PaymentService,
    private readonly bookingService: BookingService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * @route POST /payment/create_payment_url
   * @description (Public) Tạo URL thanh toán VNPAY for một đơn đặt sân đã tồn tại.
   * Thường được dùng khi người dùng muốn thử thanh toán lại cho một đơn hàng đang ở trạng thái `PENDING`.
   * @param {string} bookingId - ID của đơn đặt sân cần tạo link thanh toán.
   * @param {Request} req - Đối tượng request để lấy địa chỉ IP của người dùng.
   * @returns {Promise<PaymentUrlResponseDto>} - Một đối tượng chứa URL thanh toán VNPAY.
   * @throws {NotFoundException} Nếu không tìm thấy đơn đặt sân hoặc thông tin thanh toán tương ứng.
   * @throws {BadRequestException} Nếu đơn đặt sân đã được xử lý (đã thanh toán hoặc hủy).
   */
  @Post('create_payment_url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '(Public) Tạo URL thanh toán VNPAY cho đơn đặt sân',
  })
  @SkipThrottle()
  @ApiBody({
    schema: { properties: { bookingId: { type: 'string', format: 'uuid' } } },
  })
  @ApiResponse({
    status: 200,
    description: 'Trả về URL thanh toán VNPAY.',
    type: PaymentUrlResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy đơn đặt sân hoặc thông tin thanh toán.',
  })
  @ApiResponse({
    status: 400,
    description: 'Đơn đặt sân đã được xử lý trước đó.',
  })
  async createPaymentUrl(
    @Body('bookingId') bookingId: string,
    @Body('platform') platform: 'web' | 'mobile' = 'web',
    @Req() req: Request,
  ): Promise<PaymentUrlResponseDto> {
    this.logger.log(`Received request to create VNPAY URL for booking ID: ${bookingId}`);
    this.logger.debug(` platform: ${platform} in createPaymentUrl`);
    // 1. Tìm đơn hàng để lấy số tiền CHÍNH XÁC trong DB
    const booking = await this.bookingService.findOne(bookingId);
    if (!booking) {
      this.logger.warn(`Booking ${bookingId} not found.`);
      throw new NotFoundException('Không tìm thấy đơn đặt sân.');
    }

    if (booking.status === BookingStatus.COMPLETED) {
      this.logger.warn(`Booking ${bookingId} is already completed, cannot create new payment URL.`);
      throw new BadRequestException(
        'Đơn đặt sân đã được xác nhận hoặc hoàn thành.',
      );
    }

    // 2. Lấy số tiền CHUẨN từ bảng Payment (đã trừ Voucher)
    const payment = await this.paymentService.findByBookingId(bookingId);
    if (!payment) {
      this.logger.warn(`Payment info not found for booking ${bookingId}.`);
      throw new NotFoundException(
        'Không tìm thấy thông tin thanh toán cho đơn đặt sân.',
      );
    }

    // 3. Lấy IP
    let ipAddr =
      req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    if (Array.isArray(ipAddr)) {
      ipAddr = ipAddr[0];
    }
    const ip = ipAddr ? ipAddr.toString() : '127.0.0.1';
    this.logger.debug(`Client IP for booking ${bookingId}: ${ip}`);

    this.logger.debug(`Creating VNPAY URL with amount: ${payment.finalAmount}, orderId: ${bookingId}, platform: ${platform}`);
    // 4. Tạo URL
    const url = this.paymentService.createVnPayUrl(
      Number(payment.finalAmount),
      booking.id,
      ip,
      platform,
    );
    this.logger.log(`VNPAY URL created for booking ${bookingId}`);
    return { url };
  }

  /**
   * @route GET /payment/vnpay_return
   * @description Endpoint mà VNPAY chuyển hướng người dùng về sau khi hoàn tất thanh toán.
   * Xác thực chữ ký (checksum), điều hướng người dùng về frontend với kết quả giao dịch.
   */
  @Get('vnpay_return')
  @ApiOperation({ summary: '(VNPAY) Xử lý URL trả về cho phía Client' })
  @SkipThrottle()
  @ApiResponse({
    status: 302,
    description: 'Điều hướng về frontend với kết quả thanh toán.',
  })
  async vnpayReturn(
    @Query() query: VnpayReturnDto & { platform?: string },
    @Res() res: Response,
  ) {
    this.logger.log(`Received VNPAY return callback with query: ${JSON.stringify(query)}`);

    // Gọi service để kiểm tra chữ ký (secure hash) và trạng thái giao dịch
    const result = this.paymentService.verifyReturnUrl(
      query as unknown as Record<string, any>,
    );

    const platform = query.platform || 'web';
    this.logger.log(`VNPAY return platform: ${query.platform ? query.platform : 'not specified, default to web'}`);

    const WEB_URL = this.configService.get<string>('FRONTEND_URL_WEB');
    const MOBILE_DEEP_LINK = this.configService.get<string>('FRONTEND_URL_MOBILE');
    const redirectBase = platform === 'mobile' ? MOBILE_DEEP_LINK : WEB_URL;

    const bookingId = query.vnp_TxnRef;

    // Tìm thông tin booking để lấy mã ngắn (code)
    const booking = await this.bookingService.findOne(bookingId);
    const bookingCode = booking?.code || bookingId;

    this.logger.debug(`[VNPAY_RETURN] redirectBase="${redirectBase}" | WEB_URL="${WEB_URL}" | MOBILE_DEEP_LINK="${MOBILE_DEEP_LINK}" | platform="${platform}"`);

    // Nếu verify thành công, cập nhật trạng thái booking và payment
    if (result.isSuccess) {
      try {
        // Gọi handleIpn để cập nhật database (không await để redirect ngay)
        this.logger.log(`Payment verified successfully, triggering background update for ${bookingId}`);
        void this.paymentService.handleIpn(query as unknown as VnpayIpnDto);
      } catch (updateError: any) {
        this.logger.warn(`Failed to trigger background update for ${bookingId}: ${updateError}`);
      }

      this.logger.log(`VNPAY return successful for booking ${bookingId}, redirecting to ${platform}...`);
      // Truyền cả UUID và Mã ngắn sang FE
      return res.redirect(`${redirectBase}/payment-success?bookingId=${bookingId}&code=${bookingCode}`);
    } else {
      this.logger.warn(`VNPAY return failed for booking ${bookingId}. Error: ${result.message}`);
      return res.redirect(`${redirectBase}/payment-failed?bookingId=${bookingId}&code=${bookingCode}&message=${encodeURIComponent(result.message)}`);
    }
  }

  /**
   * @route GET /payment/vnpay_ipn
   * @description (Quan trọng) Endpoint để nhận Instant Payment Notification (IPN) từ server VNPAY.
   * Đây là một yêu cầu server-to-server, dùng để cập nhật trạng thái cuối cùng và đáng tin cậy của đơn hàng.
   * Luồng này đảm bảo đơn hàng được cập nhật kể cả khi người dùng tắt trình duyệt sau khi thanh toán.
   */
  @Get('vnpay_ipn')
  @ApiOperation({
    summary:
      '(VNPAY) Xử lý IPN để cập nhật trạng thái đơn hàng (Server-to-Server)',
  })
  @ApiResponse({
    status: 200,
    description: 'Phản hồi cho server VNPAY biết đã nhận và xử lý.',
  })
  vnpayIpn(
    @Query() query: VnpayIpnDto,
  ): Promise<{ RspCode: string; Message: string }> {
    this.logger.log(`Received VNPAY IPN callback with query: ${JSON.stringify(query)}`);
    return this.paymentService.handleIpn(query);
  }

  /**
   * @route GET /payment/stats/overview
   * @description Lấy thống kê tổng quan về doanh thu đặt sân.
   * - Admin: Xem toàn bộ hệ thống hoặc lọc theo chi nhánh.
   * - Manager: Chỉ xem chi nhánh của mình.
   * @param {AuthenticatedUser} user - Người dùng đang thực hiện yêu cầu.
   * @param {string} [startDate] - Ngày bắt đầu để lọc (YYYY-MM-DD).
   * @param {string} [endDate] - Ngày kết thúc để lọc (YYYY-MM-DD).
   * @param {string} [branchId] - (Chỉ Admin) ID của chi nhánh muốn lọc.
   * @returns {Promise<StatsResponseDto>} - Một đối tượng chứa tổng doanh thu và số lượng giao dịch theo từng trạng thái.
   */
  @Get('stats/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin, RoleEnum.Manager) // Cho phép cả Admin và Manager
  @ApiBearerAuth()
  @ApiOperation({
    summary: '(Admin/Manager) Lấy thống kê tổng quan doanh thu đặt sân',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Ngày bắt đầu (YYYY-MM-DD)',
    type: String,
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Ngày kết thúc (YYYY-MM-DD)',
    type: String,
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    description: '(Chỉ Admin) Lọc theo ID chi nhánh cụ thể',
  })
  @ApiResponse({
    status: 200,
    type: StatsResponseDto,
    description: 'Trả về dữ liệu thống kê thành công.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden resource.' })
  async getAdminStats(
    @User() user: AuthenticatedUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchId') branchId?: string,
  ): Promise<StatsResponseDto> {
    this.logger.log(`Fetching admin stats for user ${user.id} with role ${user.role.name}. StartDate: ${startDate}, EndDate: ${endDate}, BranchId: ${branchId}`);
    const userBranchId = user.branch_id || undefined;
    // Nếu là Manager, chỉ được xem chi nhánh của mình và không được dùng filter branchId
    if (user.role.name === (RoleEnum.Manager as string)) {
      this.logger.debug(`User is manager, filtering by own branchId: ${userBranchId}`);
      return this.paymentService.getStats(startDate, endDate, userBranchId);
    }
    // Admin có thể xem tất cả hoặc lọc theo chi nhánh
    this.logger.debug(`User is admin, filtering by branchId: ${branchId}`);
    return this.paymentService.getStats(startDate, endDate, branchId);
  }

  /**
   * @route GET /payment/chart
   * @description Lấy dữ liệu doanh thu đặt sân hàng tháng trong một năm để vẽ biểu đồ.
   * - Admin: Xem toàn bộ hệ thống hoặc lọc theo chi nhánh.
   * - Manager: Chỉ xem chi nhánh của mình.
   * @param {AuthenticatedUser} user - Người dùng đang thực hiện yêu cầu.
   * @param {number} [year] - Năm cần lấy dữ liệu (mặc định là năm hiện tại).
   * @param {string} [branchId] - (Chỉ Admin) ID của chi nhánh muốn lọc.
   * @returns {Promise<RevenueChartItemDto[]>} - Mảng dữ liệu doanh thu theo từng tháng.
   */
  @Get('chart')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin, RoleEnum.Manager) // Cho phép cả Admin và Manager
  @ApiBearerAuth()
  @ApiOperation({
    summary: '(Admin/Manager) Lấy dữ liệu doanh thu hàng tháng cho biểu đồ',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    description: 'Năm cần xem (mặc định là năm hiện tại)',
    type: Number,
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    description: '(Chỉ Admin) Lọc theo ID chi nhánh cụ thể',
  })
  @ApiResponse({
    status: 200,
    type: [RevenueChartItemDto],
    description: 'Trả về dữ liệu biểu đồ thành công.',
  })
  async getRevenueChart(
    @User() user: AuthenticatedUser,
    @Query('year') year: number = new Date().getFullYear(),
    @Query('branchId') branchId?: string,
  ): Promise<RevenueChartItemDto[]> {
    this.logger.log(`Fetching revenue chart for user ${user.id} with role ${user.role.name}. Year: ${year}, BranchId: ${branchId}`);
    const userBranchId = user.branch_id || undefined;
    const targetBranchId = user.role.name === (RoleEnum.Manager as string) ? userBranchId : branchId;
    this.logger.debug(`Target branchId for chart: ${targetBranchId}`);
    return this.paymentService.getRevenueChart(year, targetBranchId);
  }
}
