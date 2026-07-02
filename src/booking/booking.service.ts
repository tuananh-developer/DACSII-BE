import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, MoreThan, Not, Repository } from 'typeorm';
import { Booking } from './entities/booking.entity';
import { Field } from '../field/entities/field.entity';
import { PricingService } from '@/pricing/pricing.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingResponse } from './dto/booking-response.dto';
import { UserProfile } from '@/user/entities/users-profile.entity';
import { BookingStatus } from './enums/booking-status.enum';
import { Voucher } from '@/voucher/entities/voucher.entity';
import { VoucherUsage } from '@/voucher/entities/voucher-usage.entity';
import { Payment } from '@/payment/entities/payment.entity';
import { PaymentService } from '@/payment/payment.service';
import { PaymentMethod } from '@/payment/enums/payment-method.enum';
import { PaymentStatus } from '@/payment/enums/payment-status.enum';
import { FilterBookingDto } from './dto/filter-booking.dto';
import { AdminCreateBookingDto } from './dto/admin-create-booking';
import { UsersService } from '@/user/users.service';
import { AuthenticatedUser } from '@/auth/interface/authenicated-user.interface';
import moment from 'moment';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as handlebars from 'handlebars';
import * as qrcode from 'qrcode';
import { generatePdf } from 'html-pdf-node';
import { VoucherService } from '@/voucher/voucher.service';

import { BookingDto } from './dto/booking.dto';
import { BookingFieldDto } from './dto/booking-field.dto';
import { BookingPaginatedResponseDto } from './dto/booking-paginated-response.dto';
import { FieldScheduleResponseDto } from './dto/field-schedule-response.dto';
import { RoleEnum } from '@/auth/enums/role.enum';

/**
 * @class BookingService
 * @description Dịch vụ xử lý logic nghiệp vụ liên quan đến việc đặt sân,
 * bao gồm tạo, hủy, truy vấn và quản lý các đơn đặt sân.
 */
@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Field)
    private readonly fieldRepository: Repository<Field>,
    @InjectRepository(Voucher)
    private readonly voucherRepository: Repository<Voucher>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,

    private readonly pricingService: PricingService,
    private readonly paymentService: PaymentService,
    private readonly dataSource: DataSource,
    private readonly userService: UsersService,
    private readonly voucherService: VoucherService,
  ) { }

  /**
   * @method mapToDto
   * @description Ánh xạ từ thực thể Booking sang BookingDto.
   */
  mapToDto(booking: Booking): BookingDto {
    const dto = new BookingDto();
    dto.id = booking.id;
    dto.code = booking.code;
    dto.check_in_at = booking.check_in_at;
    dto.bookingDate = booking.bookingDate;
    dto.start_time = booking.start_time;
    dto.end_time = booking.end_time;
    dto.total_price = Number(booking.total_price);
    dto.status = booking.status;
    dto.customerName = booking.customerName;
    dto.customerPhone = booking.customerPhone;
    dto.createdAt = booking.createdAt;
    dto.updatedAt = booking.updatedAt;

    if (booking.userProfile) {
      dto.userProfile = {
        id: booking.userProfile.id,
        full_name: booking.userProfile.full_name,
        date_of_birth: booking.userProfile.date_of_birth,
        gender: booking.userProfile.gender,
        phone_number: booking.userProfile.phone_number,
        avatar_url: booking.userProfile.avatar_url,
        bio: booking.userProfile.bio,
        is_profile_complete: booking.userProfile.is_profile_complete,
        created_at: booking.userProfile.created_at,
        updated_at: booking.userProfile.updated_at,
        address: null,
      };
    }

    if (booking.field) {
      const fieldDto = new BookingFieldDto();
      fieldDto.id = booking.field.id;
      fieldDto.name = booking.field.name;

      if (booking.field.branch) {
        const branch = booking.field.branch;
        fieldDto.branch = {
          id: branch.id,
          name: branch.name,
          phone_number: branch.phone_number,
          description: branch.description,
          status: branch.status,
          open_time: branch.open_time,
          close_time: branch.close_time,
          created_at: branch.created_at,
          updated_at: branch.updated_at,
          address: branch.address ? {
            id: branch.address.id,
            street: branch.address.street,
            latitude: branch.address.latitude ? Number(branch.address.latitude) : null,
            longitude: branch.address.longitude ? Number(branch.address.longitude) : null,
            ward_name: branch.address.ward?.name || '',
            city_name: branch.address.city?.name || '',
          } : null,
        };
      }
      dto.field = fieldDto;
    }

    return dto;
  }

  /**
   * @method mapPaginatedToDto
   * @description Ánh xạ kết quả phân trang sang BookingPaginatedResponseDto.
   */
  mapPaginatedToDto(data: Booking[], total: number, page: number, limit: number): BookingPaginatedResponseDto {
    const response = new BookingPaginatedResponseDto();
    response.data = data.map(b => this.mapToDto(b));
    response.meta = {
      total,
      page,
      limit,
      lastPage: Math.ceil(total / limit),
    };
    return response;
  }

  /**
   * @method downloadTicket
   * @description Tạo file PDF vé đặt sân bao gồm mã QR và thông tin chi tiết.
   * @param {string} bookingId - ID của đơn đặt sân.
   * @returns {Promise<Buffer>} - Buffer chứa dữ liệu file PDF.
   * @throws {NotFoundException} Nếu không tìm thấy đơn đặt sân.
   */
  async downloadTicket(bookingId: string): Promise<Buffer> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: { 
        userProfile: true, 
        field: { branch: true }
       },
    });

    if (!booking) {
      throw new NotFoundException('Không tìm thấy đơn đặt sân.');
    }

    const qrCodeUrl = await qrcode.toDataURL(booking.code);

    const templatePath = path.resolve(
      __dirname,
      '..',
      'templates',
      'booking-ticket.hbs',
    );
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateContent);

    const html = template({
      booking: {
        id: booking.id,
        code: booking.code,
        startTime: moment(booking.start_time).format('HH:mm DD/MM/YYYY'),
        endTime: moment(booking.end_time).format('HH:mm DD/MM/YYYY'),
        user: {
          fullName: booking.userProfile?.full_name || booking.customerName,
        },
        field: {
          name: booking.field.name,
        },
        branch: {
          name: booking.field.branch.name,
        },
      },
      qrCodeUrl,
    });

    const options = { format: 'A4' };
    const file = { content: html };

    return new Promise((resolve, reject) => {
      generatePdf(file, options, (err: any, buffer: Buffer) => {
        if (err) return reject(err instanceof Error ? err : new Error(String(err)));
        resolve(buffer);
      });
    });
  }

  /**
   * @method createBooking
   * @description (User) Tạo một đơn đặt sân mới.
   * Quá trình này được thực hiện trong một giao dịch CSDL để đảm bảo tính toàn vẹn, bao gồm:
   * - Kiểm tra và khóa (lock) các dòng dữ liệu để chống race condition.
   * - Xác thực tính khả dụng của sân và tính giá.
   * - Xác thực và áp dụng voucher (nếu có).
   * - Tạo bản ghi `Booking` và `Payment` ở trạng thái `PENDING`.
   * - Trả về URL thanh toán VNPAY.
   * @param {CreateBookingDto} createBookingDto - DTO chứa thông tin chi tiết để tạo đơn đặt sân.
   * @param {UserProfile} userProfile - Hồ sơ của người dùng đang thực hiện việc đặt sân.
   * @returns {Promise<object>} Một đối tượng chứa thông tin đơn đặt sân, URL thanh toán, số tiền cuối cùng và thông báo.
   * @throws {ConflictException} Nếu sân đã được đặt trong khung giờ được yêu cầu.
   * @throws {NotFoundException} Nếu mã giảm giá không tồn tại.
   * @throws {BadRequestException} Nếu mã giảm giá không hợp lệ hoặc không đáp ứng điều kiện.
   */
  async createBooking(
    createBookingDto: CreateBookingDto,
    userProfile: UserProfile,
    ip: string,
  ): Promise<BookingResponse> {
    this.logger.log(
      `Creating booking for user ${userProfile.id} with DTO: ${JSON.stringify(
        createBookingDto,
      )}`,
    );
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const startMoment = moment(createBookingDto.startTime);
      if (!startMoment.isValid()) {
        throw new BadRequestException('Thời gian bắt đầu không hợp lệ.');
      }
      const start = startMoment.toDate();
      const end = new Date(
        start.getTime() + createBookingDto.durationMinutes * 60000,
      );

      const overlappingBooking = await queryRunner.manager.findOne(Booking, {
        where: {
          field: { id: createBookingDto.fieldId },
          status: Not(BookingStatus.CANCELLED),
          start_time: LessThan(end),
          end_time: MoreThan(start),
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (overlappingBooking) {
        this.logger.warn(
          `Overlapping booking found for field ${createBookingDto.fieldId} at time ${createBookingDto.startTime}`,
        );
        throw new ConflictException(
          'Sân đã bị người khác đặt trong khung giờ này (hoặc đang thanh toán)!',
        );
      }

      const pricingResult = await this.pricingService.checkPriceAndAvailability(
        {
          fieldId: createBookingDto.fieldId,
          startTime: createBookingDto.startTime,
          durationMinutes: createBookingDto.durationMinutes,
        },
      );

      const originalPrice = pricingResult.pricing.total_price;
      let finalPrice = originalPrice;
      let appliedVoucher: Voucher | null = null;

      if (createBookingDto.voucherCode) {
        this.logger.log(
          `Applying voucher ${createBookingDto.voucherCode} for booking`,
        );
        const voucher = await queryRunner.manager.findOne(Voucher, {
          where: { code: createBookingDto.voucherCode },
          lock: { mode: 'pessimistic_write' },
        });

        if (!voucher) throw new NotFoundException('Mã giảm giá không tồn tại');

        // Kiểm tra xem người dùng đã sử dụng voucher này chưa
        const isUsed = await queryRunner.manager.findOne(VoucherUsage, {
          where: { voucherId: voucher.id, userProfileId: userProfile.id },
        });
        if (isUsed) {
          throw new BadRequestException('Bạn đã sử dụng mã giảm giá này rồi.');
        }

        // Check ownership for private vouchers
        if (voucher.userProfileId && voucher.userProfileId !== userProfile.id) {
          throw new BadRequestException('Bạn không thể sử dụng mã giảm giá này.');
        }

        if (voucher.quantity <= 0)
          throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');

        const now = new Date();
        if (now > voucher.validTo)
          throw new BadRequestException('Mã giảm giá đã hết hạn');
        if (now < voucher.validFrom)
          throw new BadRequestException('Mã giảm giá chưa đến đợt áp dụng');
        if (originalPrice < Number(voucher.minOrderValue)) {
          throw new BadRequestException(
            `Đơn hàng phải tối thiểu ${Number(
              voucher.minOrderValue,
            ).toLocaleString()}đ`,
          );
        }

        let discountAmount = 0;
        if (voucher.discountAmount) {
          discountAmount = Number(voucher.discountAmount);
        } else if (voucher.discountPercentage) {
          discountAmount = originalPrice * (voucher.discountPercentage / 100);
          if (
            voucher.maxDiscountAmount &&
            discountAmount > Number(voucher.maxDiscountAmount)
          ) {
            discountAmount = Number(voucher.maxDiscountAmount);
          }
        }

        finalPrice = Math.max(0, originalPrice - discountAmount);
        appliedVoucher = voucher;

        await queryRunner.manager.decrement(
          Voucher,
          { id: voucher.id },
          'quantity',
          1,
        );
      }

      const newBooking = queryRunner.manager.create(Booking, {
        start_time: start,
        end_time: end,
        total_price: originalPrice,
        status: BookingStatus.PENDING,
        code: this.generateBookingCode(),
        bookingDate: new Date(),
        userProfile: userProfile,
        field: { id: createBookingDto.fieldId } as Field,
        customerName: userProfile.full_name,
        customerPhone: userProfile.phone_number,
      });

      const savedBooking = await queryRunner.manager.save(Booking, newBooking);

      // Ghi nhận lượt sử dụng voucher cho người dùng (trong transaction và gắn với bookingId)
      if (appliedVoucher) {
        await this.voucherService.recordUsage(
          userProfile.id,
          appliedVoucher.id,
          savedBooking.id,
          queryRunner.manager,
        );
      }

      const newPayment = queryRunner.manager.create(Payment, {
        amount: originalPrice,
        finalAmount: finalPrice,
        paymentMethod: PaymentMethod.VNPAY,
        status: PaymentStatus.PENDING,
        booking: savedBooking,
        createdAt: new Date(),
      });

      await queryRunner.manager.save(Payment, newPayment);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Booking ${savedBooking.id} created successfully for user ${userProfile.id}`,
      );

      const paymentUrl = this.paymentService.createVnPayUrl(
        finalPrice,
        savedBooking.id,
        ip,
        createBookingDto.platform || 'web',
      );

      // Reload to get relations for DTO mapping
      const bookingWithRelations = await this.findOne(savedBooking.id);

      return {
        booking: this.mapToDto(bookingWithRelations!),
        paymentUrl: paymentUrl,
        finalAmount: finalPrice,
        message: 'Đặt sân thành công, vui lòng thanh toán.',
      };
    } catch (error) {
      this.logger.error(
        `Error creating booking for user ${userProfile.id}:`,
        error,
      );
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async cancelBooking(
    bookingId: string,
    accountId: string,
    userRole: RoleEnum,
    ipAddr: string,
  ): Promise<{ message: string }> {
    this.logger.log(
      `Attempting to cancel booking ${bookingId} by user ${accountId} with role ${userRole}`,
    );

    // 1. Fetch booking and associated payment outside transaction
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: {
        userProfile: {
          account: true
        },
        payment: true
      },
    });

    if (!booking) {
      throw new NotFoundException('Không tìm thấy đơn đặt sân.');
    }
    if (!booking.payment) {
      throw new InternalServerErrorException(
        'Lỗi: Không tìm thấy thông tin thanh toán của đơn.',
      );
    }

    // 2. Permission checks
    const bookingAccountId = booking.userProfile?.account?.id;
    const isOwner = bookingAccountId === accountId;
    const isAdminOrManager =
      userRole === RoleEnum.Admin || userRole === RoleEnum.Manager;

    if (!isOwner && !isAdminOrManager) {
      throw new ForbiddenException('Bạn không có quyền hủy đơn này.');
    }

    // 3. Status and Time validation
    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Đơn đặt sân đã được hủy trước đó.');
    }
    if (booking.status === BookingStatus.FINISHED) {
      throw new BadRequestException('Không thể hủy đơn đặt sân đã hoàn thành.');
    }

    // Allow Admins/Managers to bypass time limit
    if (!isAdminOrManager) {
      const timeDiff = booking.start_time.getTime() - new Date().getTime();
      const cancelBufferHours = 2; // e.g., 2 hours
      if (timeDiff < cancelBufferHours * 60 * 60 * 1000) {
        throw new BadRequestException(
          `Chỉ có thể hủy trước giờ đá ${cancelBufferHours} tiếng.`,
        );
      }
    }

    let refundMessage = 'Mã giảm giá (nếu có) đã được hoàn lại.';

    // 4. Handle refund API call (if necessary) BEFORE DB transaction
    if (
      booking.status === BookingStatus.COMPLETED &&
      booking.payment.paymentMethod === PaymentMethod.VNPAY
    ) {
      if (!booking.payment.transactionCode || !booking.payment.completedAt) {
        throw new BadRequestException(
          'Không thể hoàn tiền tự động cho giao dịch này vì thiếu thông tin. Vui lòng liên hệ quản trị viên.',
        );
      }

      const refundResult = await this.paymentService.refundVnpayTransaction(
        booking.payment,
        booking.id,
        accountId, // Actor's ID
        ipAddr, // User's IP
      );

      if (!refundResult.isSuccess) {
        throw new BadRequestException(
          `Yêu cầu hoàn tiền VNPAY thất bại: ${refundResult.message}`,
        );
      }
      refundMessage = `Một yêu cầu hoàn tiền trị giá ${booking.payment.finalAmount.toLocaleString(
        'vi-VN',
      )}đ đã được gửi tới VNPAY. Tiền sẽ được hoàn về tài khoản của bạn trong vài ngày làm việc.`;
    } else if (
      booking.status === BookingStatus.COMPLETED &&
      booking.payment.paymentMethod === PaymentMethod.CASH
    ) {
      refundMessage =
        'Đơn đã được hủy. Hoàn tiền mặt được xử lý thủ công bởi nhân viên.';
    }

    // 5. DB Transaction for state update
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      booking.status = BookingStatus.CANCELLED;
      await queryRunner.manager.save(Booking, booking);

      booking.payment.status = PaymentStatus.FAILED; // Or REFUNDED
      await queryRunner.manager.save(Payment, booking.payment);

      const voucherUsage = await queryRunner.manager.findOne(VoucherUsage, {
        where: { bookingId: booking.id },
        relations: { voucher: true }
      });

      if (voucherUsage && voucherUsage.voucher) {
        await queryRunner.manager.increment(
          Voucher,
          { id: voucherUsage.voucher.id },
          'quantity',
          1,
        );

        // Hoàn lại lượt sử dụng voucher cho người dùng
        if (booking.userProfile) {
          await this.voucherService.cancelUsage(
            booking.userProfile.id,
            voucherUsage.voucher.id,
            queryRunner.manager
          );
        }

        this.logger.log(`Voucher for booking ${bookingId} has been refunded`);
      }

      await queryRunner.commitTransaction();

      // After successful cancellation, issue an apology voucher if cancelled by staff
      if (isAdminOrManager && !isOwner && booking.userProfile) {
        this.logger.log(`Issuing apology voucher to user ${booking.userProfile.id} for booking ${booking.id}`);
        await this.voucherService.createApologyVoucher(booking.userProfile);
        // TODO: Send notification to user about the apology voucher
      }

      this.logger.log(`Booking ${bookingId} cancelled successfully`);
      return { message: `Hủy đơn đặt sân thành công. ${refundMessage}` };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Error during booking cancellation transaction for ${bookingId}:`,
        error,
      );
      throw new InternalServerErrorException('Lỗi trong quá trình hủy đơn.');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * @method findOne
   * @description Tìm một đơn đặt sân bằng ID, kèm theo thông tin người dùng, sân và địa chỉ chi nhánh.
   * @param {string} id - ID của đơn đặt sân.
   * @returns {Promise<Booking | null>} - Thực thể Booking hoặc null nếu không tìm thấy.
   */
  async findOne(id: string): Promise<Booking | null> {
    this.logger.log(`Finding booking with id ${id}`);
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: {
        userProfile: {
          account: true
        },
        field: {
          branch: {
            address: {
              ward: true,
              city: true
            }
          }
        },
        payment: true
      },
    });

    if (booking) {
      this.logger.log(`[DEBUG findOne] Booking ${id} found with status: "${booking.status}"`);
    }

    return booking;
  }

  /**
   * @method findOneDto
   * @description Tìm một đơn đặt sân bằng ID và trả về DTO.
   */
  async findOneDto(id: string): Promise<BookingDto | null> {
    const booking = await this.findOne(id);
    return booking ? this.mapToDto(booking) : null;
  }

  /**
   * @method updateStatus
   * @description Cập nhật trạng thái của một đơn đặt sân.
   * Thường được gọi bởi các service khác (ví dụ: `PaymentService` sau khi xử lý IPN).
   * @param {string} bookingId - ID của đơn đặt sân cần cập nhật.
   * @param {BookingStatus} status - Trạng thái mới.
   * @throws {NotFoundException} Nếu không tìm thấy đơn đặt sân.
   */
  async updateStatus(bookingId: string, status: BookingStatus): Promise<void> {
    this.logger.log(`Updating booking ${bookingId} to status ${status}`);

    // Use query builder to ensure status is updated
    const result = await this.bookingRepository
      .createQueryBuilder()
      .update(Booking)
      .set({ status: status })
      .where('id = :id', { id: bookingId })
      .execute();

    if (result.affected === 0) {
      this.logger.error(`Booking with ID: ${bookingId} not found`);
      throw new NotFoundException('Không tìm thấy đơn đặt sân.');
    }

    this.logger.log(`Booking ${bookingId} status updated to ${status}`);
  }

  /**
   * @method getUserBooking
   * @description Lấy danh sách các đơn đặt sân của một người dùng cụ thể, có phân trang và lọc.
   * @param {string} accountId - ID tài khoản của người dùng.
   * @param {FilterBookingDto} filter - DTO chứa các tiêu chí lọc và phân trang.
   * @returns {Promise<BookingPaginatedResponseDto>} - Một đối tượng chứa danh sách đơn đặt sân và thông tin phân trang.
   */
  async getUserBooking(accountId: string, filter: FilterBookingDto): Promise<BookingPaginatedResponseDto> {
    this.logger.log(
      `Getting user bookings for account ${accountId} with filter: ${JSON.stringify(
        filter,
      )}`,
    );
    const { status, page = 1, limit = 10 } = filter;
    const skip = (page - 1) * limit;

    const query = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.field', 'field')
      .leftJoinAndSelect('field.branch', 'branch')
      .leftJoinAndSelect('branch.address', 'address')
      .leftJoinAndSelect('address.ward', 'ward')
      .leftJoinAndSelect('address.city', 'city')
      .leftJoinAndSelect('field.images', 'images')
      .leftJoin('booking.userProfile', 'userProfile')
      .leftJoin('userProfile.account', 'account')
      .where('account.id = :accountId', { accountId })
      .orderBy('booking.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) {
      query.andWhere('booking.status = :status', { status });
    }

    const [data, total] = await query.getManyAndCount();

    return this.mapPaginatedToDto(data, total, page, limit);
  }

  /**
   * @method getAllBookings
   * @description Lấy tất cả các đơn đặt sân cho mục đích quản lý.
   * - Admin: Xem tất cả.
   * - Manager/Staff: Chỉ xem các booking thuộc chi nhánh của mình.
   * @param {FilterBookingDto} filter - DTO chứa các tiêu chí lọc và phân trang.
   * @param {AuthenticatedUser} user - Người dùng đang thực hiện yêu cầu.
   * @returns {Promise<BookingPaginatedResponseDto>} - Một đối tượng chứa danh sách đơn đặt sân và thông tin phân trang.
   */
  async getAllBookings(filter: FilterBookingDto, user: AuthenticatedUser): Promise<BookingPaginatedResponseDto> {
    this.logger.log(
      `Getting all bookings for user ${user.id
      } with filter: ${JSON.stringify(filter)}`,
    );
    const { status, page = 1, limit = 10 } = filter;
    const skip = (page - 1) * limit;

    const query = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.field', 'field')
      .leftJoinAndSelect('field.branch', 'branch')
      .leftJoinAndSelect('branch.address', 'address')
      .leftJoinAndSelect('address.ward', 'ward')
      .leftJoinAndSelect('address.city', 'city')
      .leftJoinAndSelect('field.images', 'images')
      .leftJoin('booking.userProfile', 'userProfile')
      .leftJoin('userProfile.account', 'account')
      .orderBy('booking.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) {
      query.andWhere('booking.status = :status', { status });
    }

    if (user.branch_id) {
      query.andWhere('branch.id = :branchId', { branchId: user.branch_id });
    }

    const [data, total] = await query.getManyAndCount();

    return this.mapPaginatedToDto(data, total, page, limit);
  }

  /**
   * @method findAll
   * @description Lấy danh sách tất cả các đơn đặt sân với phân trang và tùy chọn lọc theo trạng thái.
   * @param {number} page - Số trang hiện tại.
   * @param {number} limit - Số lượng kết quả trên mỗi trang.
   * @param {BookingStatus} [status] - (Tùy chọn) Lọc các đơn đặt sân theo một trạng thái cụ thể.
   * @returns {Promise<BookingPaginatedResponseDto>}
   * @deprecated Should use `getAllBookings` instead for better role-based filtering.
   */
  async findAll(page: number, limit: number, status?: BookingStatus): Promise<BookingPaginatedResponseDto> {
    this.logger.log(
      `Finding all bookings with page: ${page}, limit: ${limit}, status: ${status}`,
    );
    const query = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.userProfile', 'user')
      .leftJoinAndSelect('booking.field', 'field')
      .leftJoinAndSelect('field.branch', 'branch')
      .leftJoinAndSelect('branch.address', 'address')
      .leftJoinAndSelect('address.ward', 'ward')
      .leftJoinAndSelect('address.city', 'city')
      .orderBy('booking.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) {
      query.andWhere('booking.status=:status', { status });
    }

    const [data, total] = await query.getManyAndCount();

    return this.mapPaginatedToDto(data, total, page, limit);
  }

  /**
   * @method createBookingByAdmin
   * @description (Admin/Staff/Manager) Tạo đơn đặt sân trực tiếp tại quầy.
   * Đơn được tạo với phương thức thanh toán là `CASH` và trạng thái `COMPLETED`.
   * @param {AdminCreateBookingDto} dto - DTO chứa thông tin đơn đặt sân.
   * @param {AuthenticatedUser} user - Người dùng (nhân viên) đang tạo đơn.
   * @returns {Promise<BookingDto>} - Đơn đặt sân vừa được tạo.
   * @throws {ForbiddenException} Nếu nhân viên cố gắng tạo đơn cho chi nhánh khác.
   */
  async createBookingByAdmin(
    dto: AdminCreateBookingDto,
    user: AuthenticatedUser,
  ): Promise<BookingDto> {
    this.logger.log(
      `User ${user.id} creating booking by admin with DTO: ${JSON.stringify(
        dto,
      )}`,
    );
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const field = await this.fieldRepository.findOne({
        where: { id: dto.fieldId },
        relations: { 
          branch: { 
            address: { 
              ward: true, 
              city: true 
            } 
          } 
        },
      });
      if (!field) {
        throw new NotFoundException('Sân không tồn tại.');
      }

      if (user.branch_id && field.branch.id !== user.branch_id) {
        throw new ForbiddenException(
          'Bạn không thể tạo đơn cho sân thuộc chi nhánh khác.',
        );
      }
      const pricingResult = await this.pricingService.checkPriceAndAvailability(
        {
          fieldId: dto.fieldId,
          startTime: dto.startTime,
          durationMinutes: dto.durationMinutes,
        },
      );

      let userProfile: UserProfile | null = null;
      if (dto.customerPhone) {
        userProfile = await this.userService.findProfileByPhoneNumber(
          dto.customerPhone,
        );
      }

      const startMoment = moment(dto.startTime);
      if (!startMoment.isValid()) {
        throw new BadRequestException('Thời gian bắt đầu không hợp lệ.');
      }
      const start = startMoment.toDate();
      const end = new Date(start.getTime() + dto.durationMinutes * 60000);

      const newBooking = queryRunner.manager.create(Booking, {
        start_time: start,
        end_time: end,
        total_price: pricingResult.pricing.total_price,
        status: BookingStatus.COMPLETED,
        code: this.generateBookingCode(),
        bookingDate: new Date(),
        field: field, // Use the full field object with relations
        userProfile: userProfile || undefined,
        customerName:
          dto.customerName ||
          (userProfile ? userProfile.full_name : 'Khách vãng lai'),
        customerPhone: dto.customerPhone,
      });
      const savedBooking = await queryRunner.manager.save(Booking, newBooking);

      const newPayment = queryRunner.manager.create(Payment, {
        amount: pricingResult.pricing.total_price,
        finalAmount: pricingResult.pricing.total_price,
        paymentMethod: PaymentMethod.CASH,
        status: PaymentStatus.COMPLETED,
        booking: savedBooking,
        createdAt: new Date(),
        completedAt: new Date(),
      });
      await queryRunner.manager.save(Payment, newPayment);

      await queryRunner.commitTransaction();
      this.logger.log(
        `Booking ${savedBooking.id} created successfully by admin ${user.id}`,
      );

      // Reload to get all relations for the response mapping
      const finalBooking = await this.findOne(savedBooking.id);
      return this.mapToDto(finalBooking!);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * @method checkInCustomer
   * @description (Manager/Admin) Check-in cho khách hàng tại sân.
   * Cập nhật trạng thái đơn đặt sân từ `COMPLETED` thành `CHECKED_IN`.
   * @param {string} bookingId - ID của đơn đặt sân cần check-in.
   * @returns {Promise<BookingDto>} - Thông tin đơn đặt sân đã được cập nhật.
   * @throws {NotFoundException} Nếu không tìm thấy đơn đặt sân.
   * @throws {BadRequestException} Nếu đơn không ở trạng thái `COMPLETED` hoặc đã được check-in.
   */
  async checkInCustomer(identifier: string): Promise<BookingDto> {
    this.logger.log(`Checking in customer for booking with identifier ${identifier}`);
    const booking = await this.bookingRepository.findOne({
      where: [
        { id: identifier }, // Searches by UUID
        { code: identifier }, // Searches by code
      ],
      relations: { 
        userProfile: true, 
        field: { 
          branch: { address: {
             ward: true, 
             city: true } 
            } 
          } 
        }
    });

    if (!booking) {
      this.logger.warn(`Booking with identifier ${identifier} not found for check-in`);
      throw new NotFoundException(
        `Không tìm thấy đơn đặt sân với mã: ${identifier}`,
      );
    }

    if (booking.status === BookingStatus.CHECKED_IN) {
      this.logger.warn(`Booking ${booking.id} is already checked in`);
      throw new BadRequestException(
        'Đơn đặt sân này đã được check-in trước đó.',
      );
    }

    if (booking.status !== BookingStatus.COMPLETED) {
      this.logger.warn(
        `Booking ${booking.id} is not in COMPLETED state for check-in`,
      );
      throw new BadRequestException(
        `Không thể check-in cho đơn ở trạng thái "${booking.status}". Đơn phải được thanh toán thành công.`,
      );
    }

    // Update using query builder to ensure status is saved
    await this.bookingRepository
      .createQueryBuilder()
      .update(Booking)
      .set({
        status: BookingStatus.CHECKED_IN,
        check_in_at: new Date()
      })
      .where('id = :id', { id: booking.id })
      .execute();

    this.logger.log(`[DEBUG] Booking ${booking.id} updated via query builder`);

    // Reload booking to get fresh data
    const savedBooking = await this.bookingRepository.findOne({
      where: { id: booking.id },
      relations: { 
        userProfile: true, 
        field: { 
          branch: { address: {
             ward: true, 
             city: true } } } }
    });

    this.logger.log(`Booking ${booking.id} checked in successfully`);

    return this.mapToDto(savedBooking || booking);
  }

  /**
   * @method getFieldSchedule
   * @description Lấy lịch các khung giờ đã được đặt của một sân trong một ngày cụ thể.
   * @param {string} fieldId - ID của sân.
   * @param {string} date - Ngày cần xem lịch (format: YYYY-MM-DD).
   * @returns {Promise<FieldScheduleResponseDto>} - Danh sách các khung giờ đã đặt trong ngày.
   */
  async getFieldSchedule(fieldId: string, date: string): Promise<FieldScheduleResponseDto> {
    this.logger.log(`Getting schedule for field ${fieldId} on date ${date}`);

    const startOfDay = new Date(`${date}T00:00:00`);
    const endOfDay = new Date(`${date}T23:59:59`);

    const bookings = await this.bookingRepository.find({
      where: {
        field: { id: fieldId },
        status: Not(BookingStatus.CANCELLED),
        start_time: LessThan(endOfDay),
        end_time: MoreThan(startOfDay),
      },
      select: {
        id: true, 
        start_time: true, 
        end_time: true, 
        status: true
      },
      order: { start_time: 'ASC' },
    });

    return {
      date,
      fieldId,
      bookings: bookings.map((b) => ({
        startTime: b.start_time.toISOString(),
        endTime: b.end_time.toISOString(),
        status: b.status,
      })),
    };
  }

  /**
   * @private
   * @method generateBookingCode
   * @description Tạo mã đặt sân duy nhất theo định dạng YYMMDD-XXXX.
   * @returns {string} - Mã đặt sân.
   */
  private generateBookingCode(): string {
    const now = new Date();
    const datePrefix = moment(now).format('YYMMDD');

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${datePrefix}-${suffix}`;
  }
}
