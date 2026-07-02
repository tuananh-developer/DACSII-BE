import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import vnpayConfig from './config/vnpay.config';
import * as crypto from 'crypto';
import qs from 'qs';
import moment from 'moment';
import { ConfigType } from '@nestjs/config';
import { BookingService } from '@/booking/booking.service';
import { BookingStatus } from '@/booking/enums/booking-status.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { Voucher } from '@/voucher/entities/voucher.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { VnpayIpnDto } from './dto/vnpay-ipn.dto';
import { NotificationService } from '@/notification/notification.service';
import { MailerService } from '@nestjs-modules/mailer';
import { EventGateway } from '@/event/event.gateway';
import * as QRCode from 'qrcode';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { VoucherService } from '@/voucher/voucher.service';

import { StatsResponseDto } from './dto/stats-response.dto';
import { RevenueChartItemDto } from './dto/revenue-chart-item.dto';

/**
 * @class PaymentService
 * @description Chịu trách nhiệm xử lý logic nghiệp vụ liên quan đến thanh toán và thống kê doanh thu.
 * - Tích hợp với cổng thanh toán VNPAY: tạo URL, xác thực return URL và xử lý IPN.
 * - Cung cấp các phương thức thống kê doanh thu theo thời gian và chi nhánh.
 */
@Injectable()
export class PaymentService {
  private logger = new Logger(PaymentService.name);

  /**
   * @constructor
   * @param vnpayConfiguration - Cấu hình VNPAY được inject.
   * @param bookingService - Service để tương tác với các đơn đặt sân.
   * @param paymentRepository - Repository để tương tác với bảng `payments`.
   * @param voucherRepository - Repository để tương tác với bảng `vouchers`.
   * @param notificationService - Service để tạo và gửi thông báo.
   * @param mailerService - Service để gửi email.
   * @param eventGateWay - Gateway để gửi sự kiện real-time.
   */
  constructor(
    @Inject(vnpayConfig.KEY)
    private readonly vnpayConfiguration: ConfigType<typeof vnpayConfig>,
    @Inject(forwardRef(() => BookingService))
    private readonly bookingService: BookingService,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Voucher)
    private readonly voucherRepository: Repository<Voucher>,
    private readonly voucherService: VoucherService,
    private readonly notificationService: NotificationService,
    private readonly mailerService: MailerService,
    private readonly eventGateWay: EventGateway,
    private readonly httpService: HttpService,
  ) { }

  /**
   * @method createVnPayUrl
   * @description Tạo URL thanh toán VNPAY với các tham số cần thiết.
   * @param {number} amount - Số tiền cần thanh toán.
   * @param {string} orderId - ID của đơn hàng (booking ID).
   * @param {string} ipAddr - Địa chỉ IP của người dùng.
   * @returns {string} - URL thanh toán VNPAY hoàn chỉnh.
   * @throws {Error} Nếu thiếu cấu hình VNPAY.
   */
  createVnPayUrl(amount: number, orderId: string, ipAddr: string, platform: string = 'web'): string {
    const { tmnCode, secretKey, url,returnUrl } = this.vnpayConfiguration;
    if (!secretKey) throw new Error('VNPAY Secret Key is missing');

    const baseUrl = returnUrl

    const seperator = baseUrl?.includes('?') ? '&' : '?';
    const finalReturnUrl = `${baseUrl}${seperator}platform=${platform}`;



    // 1. Config Params
    const vnp_Params: Record<string, number | string | undefined> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: orderId, // Đảm bảo mã này là duy nhất cho mỗi lần thanh toán
      vnp_OrderInfo: 'ThanhToanDonHangTest2',
      vnp_OrderType: 'other',
      vnp_Amount: Math.floor(amount * 100),
      vnp_ReturnUrl: finalReturnUrl,
      // vnp_BankCode: 'NCB', // Trong môi trường thật nên để null để user chọn bank
      vnp_IpAddr: ipAddr || '127.0.0.1', // Nên dùng IP thực của client
      vnp_CreateDate: moment(new Date()).format('YYYYMMDDHHmmss'),
    };

    // 2. Sắp xếp tham số (Manual Sort A-Z)
    // Bước này quan trọng để đảm bảo thứ tự
    const sortedKeys = Object.keys(vnp_Params).sort();
    const sortedParams: Record<string, any> = {};
    sortedKeys.forEach(key => {
      sortedParams[key] = vnp_Params[key];
    });

    // 3. Ký (FIX: Dùng qs.stringify để encode giá trị ngay tại bước này)
    // encode: true là mặc định, nhưng viết rõ ra để dễ kiểm soát
    const signData = qs.stringify(sortedParams, { encode: true });

    this.logger.debug(`🔑 Key đang dùng: ${secretKey?.substring(0, 5)}...`);
    this.logger.debug(`📝 Chuỗi mang đi ký (Encoded): ${signData}`);

    // 4. Hash (HMAC SHA512)
    const hmac = crypto.createHmac('sha512', secretKey ?? '');
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    // 5. Tạo URL
    // Thêm mã hash vào params
    sortedParams['vnp_SecureHash'] = signed;

    // Tạo URL cuối cùng (Lưu ý: không cần sort lại vì sortedParams đã sort rồi, nhưng qs stringify có thể đổi thứ tự nếu không cẩn thận, tuy nhiên URL param order không ảnh hưởng việc nhận diện hash của VNPay, chỉ ảnh hưởng lúc ký thôi)
    const finalUrl = url + '?' + qs.stringify(sortedParams, { encode: true });

    this.logger.debug(`🚀 Final URL: ${finalUrl}`);

    return finalUrl;
  }

  /**
   * @method verifyReturnUrl
   * @description Xác thực chữ ký (secure hash) từ VNPAY trả về trên URL phía client.
   * Chỉ dùng để hiển thị kết quả cho người dùng, không cập nhật CSDL.
   * @param {Record<string, any>} vnp_Params - Các tham số query từ VNPAY.
   * @returns {object} - Một đối tượng chứa kết quả xác thực.
   */
  verifyReturnUrl(vnp_Params: Record<string, any>) {
    const vnp_Params_Data: Record<string, string> = {};
    for (const key in vnp_Params) {
      if (key.startsWith('vnp_')) {
        vnp_Params_Data[key] = String(vnp_Params[key]);
      }
    }

    const secureHash = vnp_Params_Data['vnp_SecureHash'];

    delete vnp_Params_Data['vnp_SecureHash'];
    delete vnp_Params_Data['vnp_SecureHashType'];

    const sortedParams = this.sortObject(vnp_Params_Data);

    const { secretKey } = this.vnpayConfiguration;
    if (!secretKey) {
      throw new Error('VNPAY configuration is missing');
    }
    const signData = qs.stringify(sortedParams, { encode: false });
    const hmac = crypto.createHmac('sha512', secretKey ?? '');
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    const orderId = vnp_Params_Data['vnp_TxnRef'];
    const amount = vnp_Params_Data['vnp_Amount']
      ? parseInt(vnp_Params_Data['vnp_Amount']) / 100
      : 0;
    const responseCode = vnp_Params_Data['vnp_ResponseCode'];
    const payDate = vnp_Params_Data['vnp_PayDate'];

    if (secureHash === signed) {
      if (responseCode === '00') {
        return {
          isSuccess: true,
          message: 'Giao dịch thành công',
          orderId: orderId,
          amount: amount,
          rspCode: responseCode,
          payDate: payDate,
        };
      } else {
        return {
          isSuccess: false,
          message: `Giao dịch không thành công. Mã lỗi: ${responseCode}`,
          orderId: orderId,
          amount: amount,
          rspCode: responseCode,
        };
      }
    } else {
      return {
        isSuccess: false,
        message: 'Chữ ký không hợp lệ',
        orderId: orderId,
        amount: amount,
        rspCode: '97',
      };
    }
  }

  /**
   * @method handleIpn
   * @description Xử lý thông báo IPN (Instant Payment Notification) từ server VNPAY.
   * Đây là phương thức đáng tin cậy để cập nhật trạng thái cuối cùng của giao dịch.
   * @param {VnpayIpnDto} dto - DTO chứa dữ liệu IPN từ VNPAY.
   * @returns {Promise<{ RspCode: string; Message: string }>} - Phản hồi cho server VNPAY.
   */
  async handleIpn(
    dto: VnpayIpnDto,
  ): Promise<{ RspCode: string; Message: string }> {
    this.logger.log(
      `[IPN_START] Received VNPAY IPN callback. Raw DTO: ${JSON.stringify(
        dto,
      )}`,
    );

    const vnp_Params: Record<string, string> = {};
    const rawDto = dto as unknown as Record<string, unknown>;
    for (const key in rawDto) {
      if (key.startsWith('vnp_')) {
        vnp_Params[key] = String(rawDto[key]);
      }
    }

    const secureHash = vnp_Params['vnp_SecureHash'] || '';

    delete vnp_Params['vnp_SecureHash'];
    delete vnp_Params['vnp_SecureHashType'];

    const sortedParams = this.sortObject(vnp_Params);
    const secretKey = this.vnpayConfiguration.secretKey;
    if (!secretKey) {
      this.logger.error('[IPN_ERROR] VNPAY secret key is missing');
      return {
        RspCode: '99',
        Message: 'Internal server error: Missing secret key',
      };
    }

    const signData = qs.stringify(sortedParams, { encode: false });
    const hmac = crypto.createHmac('sha512', secretKey ?? '');
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    const bookingIdFromVnp = vnp_Params['vnp_TxnRef'] || '';
    const rspCode = vnp_Params['vnp_ResponseCode'] || '';
    const isSignatureValid = secureHash === signed;

    this.logger.log(
      `[IPN_VALIDATE] BookingID: ${bookingIdFromVnp} | RspCode: ${rspCode} | SignatureValid: ${isSignatureValid}`,
    );

    if (!isSignatureValid) {
      this.logger.error(
        `[IPN_FAIL] Invalid signature for booking ${bookingIdFromVnp}`,
      );
      return { RspCode: '97', Message: 'Chữ ký không hợp lệ' };
    }

    let bookingId = bookingIdFromVnp;
    if (bookingId.length === 32) {
      bookingId = `${bookingId.substring(0, 8)}-${bookingId.substring(
        8,
        12,
      )}-${bookingId.substring(12, 16)}-${bookingId.substring(
        16,
        20,
      )}-${bookingId.substring(20)}`;
    }
    const vnp_Amount = parseInt(vnp_Params['vnp_Amount'] || '0') / 100;

    const transactionNo =
      vnp_Params['vnp_TransactionNo'] ||
      vnp_Params['vnp_BankTranNo'];
    const bankCode = vnp_Params['vnp_BankCode'];
    const payDate = vnp_Params['vnp_PayDate'];

    try {
      const payment = await this.paymentRepository.findOne({
        where: { booking: { id: bookingId }, status: PaymentStatus.PENDING },
        relations: { 
          booking: { 
            userProfile: { account: true },
            field: { branch: { address: { ward: true, city: true } } }
          }
        },
      });

      if (!payment) {
        this.logger.warn(
          `[IPN_FAIL] Payment record not found for booking ${bookingId} with PENDING status. It might have been processed already.`,
        );
        // Check if it's already completed to confirm to VNPAY
        const alreadyCompletedPayment = await this.paymentRepository.findOneBy({
          booking: { id: bookingId },
          status: PaymentStatus.COMPLETED,
        });
        if (alreadyCompletedPayment) {
          return { RspCode: '00', Message: 'Confirm Success' }; // Already done
        }
        return { RspCode: '01', Message: 'Không tìm thấy đơn hàng' };
      }

      if (Number(payment.finalAmount) !== vnp_Amount) {
        this.logger.warn(
          `[IPN_FAIL] Amount mismatch for booking ${bookingId}. DB: ${payment.finalAmount}, VNPAY: ${vnp_Amount}`,
        );
        return { RspCode: '04', Message: 'Số tiền không khớp' };
      }

      const userEmail = payment.booking.userProfile.account?.email;
      const fullName = payment.booking.userProfile.full_name;
      const fieldName = payment.booking.field.name;
      const bookingCode = payment.booking.code; // Mã ngắn để người dùng dễ nhớ

      if (!userEmail) {
        this.logger.error(`[IPN_ERROR] Cannot find email for user profile ${payment.booking.userProfile.id}`);
      }

      const branchAddressObj = payment.booking.field.branch?.address;
      const fieldAddress = branchAddressObj
        ? `${branchAddressObj.street}, ${branchAddressObj.ward?.name || ''
          }, ${branchAddressObj.city?.name || ''}`
          .replace(/,\s*,/g, ',')
          .trim()
          .replace(/,\s*$/, '')
        : 'Đang cập nhật';

      const startTime = moment(payment.booking.start_time).format(
        'HH:mm [ngày] DD/MM/YYYY',
      );
      const endTime = moment(payment.booking.end_time).format(
        'HH:mm [ngày] DD/MM/YYYY',
      );
      const finalAmountStr = payment.finalAmount.toLocaleString('vi-VN', {
        style: 'currency',
        currency: 'VND',
      });

      if (rspCode == '00') {
        this.logger.log(
          `[IPN_SUCCESS] Processing successful payment for booking ${bookingId}`,
        );
        // --- GIAO DỊCH THÀNH CÔNG ---
        await this.bookingService.updateStatus(
          bookingId,
          BookingStatus.COMPLETED,
        );
        await this.updatePayment(
          payment,
          PaymentStatus.COMPLETED,
          transactionNo,
          bankCode,
          payDate,
        );

        await this.notificationService.createNotification({
          title: 'Thanh toán thành công',
          content: `Đơn đặt sân ${bookingId} của bạn đã được xác nhận.`,
          recipientId: payment.booking.userProfile.id,
        });

        const qrCodeBuffer = await QRCode.toBuffer(bookingCode);

        if (userEmail) {
          this.logger.log(`[IPN_INFO] Attempting to send success email to: ${userEmail}`);
          // KHÔNG await để gửi mail chạy ngầm
          void this.sendEmailSafely({
            to: userEmail,
            subject: 'Xác nhận đặt sân thành công',
            template: './booking-success',
            context: {
              full_name: fullName,
              fieldName: fieldName,
              fieldAddress: fieldAddress,
              startTime: startTime,
              endTime: endTime,
              finalAmount: finalAmountStr,
              bookingCode: bookingCode,
              frontendUrl: this.vnpayConfiguration.frontendUrl || 'http://localhost:3000',
              currentYear: new Date().getFullYear(),
            },
            attachments: [
              {
                filename: 'qrcode.png',
                content: qrCodeBuffer,
                cid: 'qrcode', // Tham chiếu trong template bằng src="cid:qrcode"
              },
            ],
          });
        }

        this.eventGateWay.notifyAdminsNewFeedback({
          message: `Có đơn đặt sân mới!`,
          bookingId: bookingId,
          field: fieldName,
          amount: finalAmountStr,
          time: new Date(),
        });
        this.logger.log(`[IPN_SUCCESS] Booking ${bookingId} confirmed.`);
      } else {
        this.logger.warn(
          `[IPN_FAIL] Processing FAILED payment for booking ${bookingId}. RspCode: ${rspCode}`,
        );
        // --- GIAO DỊCH THẤT BẠI ---
        await this.bookingService.updateStatus(
          bookingId,
          BookingStatus.CANCELLED,
        );
        await this.updatePayment(
          payment,
          PaymentStatus.FAILED,
          transactionNo,
          bankCode,
          payDate,
        );

        await this.notificationService.createNotification({
          title: 'Thanh toán thất bại',
          content: `Giao dịch cho đơn ${bookingId} không thành công.`,
          recipientId: payment.booking.userProfile.id,
        });

        const voucherUsage = await this.voucherService.getUsageByBookingId(bookingId);

        if (voucherUsage && voucherUsage.voucher) {
          await this.voucherRepository.increment(
            { id: voucherUsage.voucher.id },
            'quantity',
            1,
          );

          // Hoàn lại lượt sử dụng voucher cho người dùng
          await this.voucherService.cancelUsage(
            payment.booking.userProfile.id,
            voucherUsage.voucher.id,
          );

          this.logger.log(
            `[IPN_INFO] Voucher ${voucherUsage.voucher.code} for booking ${bookingId} has been refunded.`,
          );
        }

        if (userEmail) {
          // KHÔNG await để gửi mail chạy ngầm
          void this.sendEmailSafely({
            to: userEmail,
            subject: 'Thông báo giao dịch đặt sân thất bại',
            template: './booking-failed',
            context: {
              full_name: fullName,
              fieldName: fieldName,
              startTime: startTime,
              endTime: endTime,
              finalAmount: finalAmountStr,
              bookingId: bookingId,
              reason: 'Giao dịch bị hủy hoặc lỗi từ ngân hàng.',
            },
          });
        }
        this.logger.log(`[IPN_FAIL] Booking ${bookingId} has been cancelled.`);
      }

      return { RspCode: '00', Message: 'Xác nhận thành công' };
    } catch (error) {
      this.logger.error(
        `[VNPAY IPN CRITICAL ERROR] Unhandled error for Booking ID ${bookingId}:`,
        error instanceof Error ? error.stack : JSON.stringify(error),
      );
      return { RspCode: '99', Message: 'Lỗi không xác định' };
    }
  }
  /**
   * @method findByBookingId
   * @description Tìm một bản ghi thanh toán dựa trên ID của đơn đặt sân.
   * @param {string} bookingId - ID của đơn đặt sân.
   * @returns {Promise<Payment | null>} - Bản ghi thanh toán hoặc null nếu không tìm thấy.
   */
  async findByBookingId(bookingId: string): Promise<Payment | null> {
    return this.paymentRepository.findOne({
      where: { booking: { id: bookingId } }
    });
  }

  /**
   * @method getStats
   * @description Lấy thống kê tổng quan về doanh thu và số lượng giao dịch đặt sân.
   * @param {string} [startDate] - Ngày bắt đầu lọc (YYYY-MM-DD).
   * @param {string} [endDate] - Ngày kết thúc lọc (YYYY-MM-DD).
   * @param {string} [branchId] - ID của chi nhánh cần lọc.
   * @returns {Promise<StatsResponseDto>} - Đối tượng chứa `revenue` (tổng doanh thu) và `transactions` (số lượng theo trạng thái).
   */
  async getStats(startDate?: string, endDate?: string, branchId?: string): Promise<StatsResponseDto> {
    const query = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoin('payment.booking', 'booking')
      .leftJoin('booking.field', 'field')
      .leftJoin('field.branch', 'branch');

    if (startDate && endDate) {
      query.where('payment.createdAt BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });
    }

    if (branchId) {
      query.andWhere('branch.id = :branchId', { branchId });
    }

    // 1. Tổng doanh thu (Chỉ tính đơn COMPLETED)
    const revenue = await query
      .clone()
      .andWhere('payment.status = :status', { status: PaymentStatus.COMPLETED })
      .select('SUM(payment.finalAmount)', 'total')
      .getRawOne<{ total: string | null }>();

    // 2. Số lượng đơn theo trạng thái
    const statusCounts = await query
      .clone()
      .select('payment.status', 'status')
      .addSelect('COUNT(payment.id)', 'count')
      .groupBy('payment.status')
      .getRawMany<{ status: string; count: string }>();

    const transaction = statusCounts.reduce(
      (acc, curr) => {
        acc[curr.status] = Number(curr.count);
        return acc;
      },
      {} as Record<string, number>,
    );

    const dto = new StatsResponseDto();
    dto.revenue = Number(revenue?.total || 0);
    dto.transactions = transaction;
    return dto;
  }

  /**
   * @method getRevenueChart
   * @description Lấy dữ liệu doanh thu đặt sân theo từng tháng trong một năm để vẽ biểu đồ.
   * @param {number} year - Năm cần lấy dữ liệu.
   * @param {string} [branchId] - ID của chi nhánh cần lọc.
   * @returns {Promise<RevenueChartItemDto[]>} - Mảng dữ liệu doanh thu.
   */
  async getRevenueChart(year: number, branchId?: string): Promise<RevenueChartItemDto[]> {
    const query = this.paymentRepository
      .createQueryBuilder('payment')
      .select('MONTH(payment.createdAt)', 'month')
      .addSelect('SUM(payment.finalAmount)', 'revenue')
      .leftJoin('payment.booking', 'booking')
      .leftJoin('booking.field', 'field')
      .leftJoin('field.branch', 'branch')
      .where('payment.status = :status', { status: PaymentStatus.COMPLETED })
      .andWhere('YEAR(payment.createdAt) = :year', { year });

    if (branchId) {
      query.andWhere('branch.id = :branchId', { branchId });
    }

    query.groupBy('month').orderBy('month', 'ASC');

    const result = await query.getRawMany<{
      month: string | number;
      revenue: string | number;
    }>();

    return result.map((row) => ({
      month: Number(row.month),
      revenue: Number(row.revenue),
    }));
  }

  /**
   * Gửi yêu cầu hoàn tiền đến VNPAY.
   * @param payment Bản ghi thanh toán cần hoàn.
   * @param actor Người thực hiện hành động (ví dụ: user ID hoặc 'admin').
   * @param ipAddr Địa chỉ IP của người yêu cầu.
   * @returns Kết quả từ VNPAY.
   */
  async refundVnpayTransaction(
    payment: Payment,
    bookingId: string,
    actor: string,
    ipAddr: string,
  ): Promise<{ isSuccess: boolean; message: string; data?: any }> {
    const { tmnCode, secretKey, apiUrl } = this.vnpayConfiguration;
    if (!secretKey || !apiUrl) {
      this.logger.error('VNPAY secret key or API URL is missing from config.');
      throw new InternalServerErrorException('Lỗi cấu hình VNPAY phía server.');
    }

    const vnp_Params: Record<string, any> = {
      vnp_RequestId: moment(new Date()).format('HHmmss') + bookingId.substring(0, 8),
      vnp_Version: '2.1.0',
      vnp_Command: 'refund',
      vnp_TmnCode: tmnCode,
      vnp_TransactionType: '02', // 02: Hoàn toàn phần, 03: Hoàn một phần
      vnp_TxnRef: bookingId,
      vnp_Amount: Number(payment.finalAmount) * 100,
      vnp_TransactionNo: payment.transactionCode,
      vnp_TransactionDate: moment(payment.completedAt).format('YYYYMMDDHHmmss'),
      vnp_CreateBy: actor,
      vnp_CreateDate: moment(new Date()).format('YYYYMMDDHHmmss'),
      vnp_IpAddr: ipAddr,
      vnp_OrderInfo: `Hoan tien cho don hang ${bookingId}`,
    };

    // VNPAY API requires a specific order for hashing, joined by '|'
    const rawSignatureData = [
      vnp_Params.vnp_RequestId,
      vnp_Params.vnp_Version,
      vnp_Params.vnp_Command,
      vnp_Params.vnp_TmnCode,
      vnp_Params.vnp_TransactionType,
      vnp_Params.vnp_TxnRef,
      vnp_Params.vnp_Amount,
      vnp_Params.vnp_TransactionNo,
      vnp_Params.vnp_TransactionDate,
      vnp_Params.vnp_CreateBy,
      vnp_Params.vnp_CreateDate,
      vnp_Params.vnp_IpAddr,
      vnp_Params.vnp_OrderInfo,
    ].join('|');

    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(Buffer.from(rawSignatureData, 'utf-8')).digest('hex');
    vnp_Params['vnp_SecureHash'] = signed;

    try {
      this.logger.log(`Gửi yêu cầu hoàn tiền VNPAY cho đơn ${bookingId}`);
      const response = await firstValueFrom(
        this.httpService.post<Record<string, any>>(apiUrl, vnp_Params),
      );

      this.logger.log(`Phản hồi hoàn tiền VNPAY: ${JSON.stringify(response.data)}`);
      const vnpResponse = response.data;

      // First, check if VNPAY returned a signature at all. Error responses often don't.
      if (!vnpResponse.vnp_SecureHash) {
        if (vnpResponse.vnp_ResponseCode !== '00') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          const errorMessage = this.mapVnpayError(vnpResponse.vnp_ResponseCode);
          return { isSuccess: false, message: errorMessage, data: vnpResponse };
        }
        // If code is '00' but has no hash, treat it as a failure.
        return { isSuccess: false, message: 'Phản hồi từ VNPAY không chứa chữ ký bảo mật.' };
      }

      const responseSecureHash = vnpResponse.vnp_SecureHash as string;
      delete vnpResponse.vnp_SecureHash;
      delete vnpResponse.vnp_SecureHashType;

      // VNPAY API requires a specific order for hashing the response, joined by '|'
      const rawResponseSignatureData = [
        vnpResponse.vnp_ResponseId,
        vnpResponse.vnp_Command,
        vnpResponse.vnp_ResponseCode,
        vnpResponse.vnp_Message,
        vnpResponse.vnp_TmnCode,
        vnpResponse.vnp_TxnRef,
        vnpResponse.vnp_Amount,
        vnpResponse.vnp_BankCode,
        vnpResponse.vnp_PayDate,
        vnpResponse.vnp_TransactionNo,
        vnpResponse.vnp_TransactionType,
        vnpResponse.vnp_TransactionStatus,
        vnpResponse.vnp_OrderInfo,
      ].join('|');

      const responseHmac = crypto.createHmac('sha512', secretKey);
      const responseSigned = responseHmac.update(Buffer.from(rawResponseSignatureData, 'utf-8')).digest('hex');

      // --- DEBUG LOGGING ---
      this.logger.debug(`[REFUND SIG CHECK] Raw VNPAY Response (full): ${JSON.stringify(response.data)}`);
      this.logger.debug(`[REFUND SIG CHECK] String to Sign: ${rawResponseSignatureData}`);
      this.logger.debug(`[REFUND SIG CHECK] Our Signature: ${responseSigned}`);
      this.logger.debug(`[REFUND SIG CHECK] VNPAY's Signature: ${responseSecureHash}`);
      // --- END DEBUG LOGGING ---

      if (responseSecureHash === responseSigned) {
        const responseCode = vnpResponse.vnp_ResponseCode as string;
        if (responseCode === '00') {
          return { isSuccess: true, message: 'Yêu cầu hoàn tiền thành công.', data: vnpResponse };
        } else {
          const errorMessage = this.mapVnpayError(responseCode);
          return { isSuccess: false, message: errorMessage, data: vnpResponse };
        }
      } else {
        return { isSuccess: false, message: 'Chữ ký phản hồi từ VNPAY không hợp lệ.' };
      }
    } catch (error) {
      this.logger.error('Lỗi gọi API hoàn tiền VNPAY:', error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException('Có lỗi xảy ra khi kết nối tới VNPAY để hoàn tiền.');
    }
  }

  private mapVnpayError(code: string): string {
    const errorMap: Record<string, string> = {
      '02': 'Dữ liệu không hợp lệ. (Merchant không tồn tại hoặc không hoạt động)',
      '03': 'Giao dịch không tồn tại trong hệ thống VNPAY.',
      '91': 'Giao dịch không được phép hoàn trả hoặc đã quá hạn hoàn.',
      '94': 'Giao dịch đã được hoàn trả trước đó.',
      '95': 'Số tiền hoàn trả không hợp lệ (lớn hơn số tiền gốc).',
      '97': 'Chữ ký (secure hash) không hợp lệ.',
      '99': 'Các lỗi khác không xác định.',
    };
    return errorMap[code] || `Lỗi không xác định từ VNPAY: ${code}`;
  }

  /**
   * @private
   * @method sortObject
   * @description Sắp xếp các key của object theo thứ tự alphabet (a-z).
   * QUAN TRỌNG: Hàm này chỉ sắp xếp và chuyển về string, KHÔNG encode URL.
   * Dữ liệu trả về sẽ dùng để tạo chuỗi Hash (Raw data).
   */
  private sortObject(obj: Record<string, any>): Record<string, string> {
    const sorted: Record<string, string> = {};
    const keys = Object.keys(obj).sort(); // 1. Sắp xếp key a-z

    keys.forEach((key) => {
      // 2. Chỉ lấy các tham số có giá trị thực (không null, undefined hoặc rỗng)
      // Tài liệu Java mẫu (trang 37) có check: if (fieldValue != null && fieldValue.length > 0) [cite: 1183]
      if (obj[key] !== null && obj[key] !== undefined && obj[key] !== '') {
        sorted[key] = String(obj[key]); // 3. Chỉ convert sang string, KHÔNG encodeURIComponent tại đây
      }
    });

    return sorted;
  }

  /**
   * @private
   * @method updatePayment
   * @description Cập nhật trạng thái và thông tin giao dịch cho một bản ghi thanh toán.
   */
  private async updatePayment(
    payment: Payment,
    status: PaymentStatus,
    transactionNo: string,
    bankCode: string,
    payDate: string,
  ): Promise<void> {
    try {
      payment.status = status;
      payment.transactionCode = transactionNo;
      payment.bankCode = bankCode;
      if (status === PaymentStatus.COMPLETED && payDate) {
        payment.completedAt = moment(payDate, 'YYYYMMDDHHmmss').toDate();
      }
      await this.paymentRepository.save(payment);
    } catch (error) {
      this.logger.error(`Lỗi cập nhật Payment ${payment.id}`, error);
    }
  }

  /**
   * @private
   * @method sendEmailSafely
   * @description Gửi email một cách an toàn, bắt lỗi nếu có sự cố.
   */
  private async sendEmailSafely(mailOptions: {
    to: string;
    subject: string;
    template: string;
    context: object;
    attachments?: any[];
  }) {
    try {
      await this.mailerService.sendMail(mailOptions);
    } catch (error) {
      this.logger.error(`Gửi email thất bại đến ${mailOptions.to}:`, error);
    }
  }

  /**
   * @private
   * @method generateQRCode
   * @description Tạo mã QR code từ một chuỗi dữ liệu và trả về dưới dạng Data URL.
   * @param {string} data - Dữ liệu cần mã hóa.
   * @returns {Promise<string>} - Chuỗi Data URL của ảnh QR code.
   */
  private async generateQRCode(data: string): Promise<string> {
    try {
      return await QRCode.toDataURL(data);
    } catch (err) {
      this.logger.error('Lỗi tạo QR Code', err);
      return '';
    }
  }
}
