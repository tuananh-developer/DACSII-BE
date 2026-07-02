import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Voucher } from './entities/voucher.entity';
import {
  IsNull,
  LessThanOrEqual,
  MoreThan,
  Repository,
  EntityManager,
  Brackets,
} from 'typeorm';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UserProfile } from '@/user/entities/users-profile.entity';
import { Booking } from '@/booking/entities/booking.entity';
import { VoucherUsage } from './entities/voucher-usage.entity';
import { VoucherCollection } from './entities/voucher-collection.entity';

import { VoucherDto } from './dto/voucher.dto';
import { VoucherCheckResponseDto } from './dto/voucher-check-response.dto';

/**
 * @class VoucherService
 * @description Service quản lý các logic liên quan đến mã giảm giá (voucher).
 * Bao gồm tạo mới, kiểm tra tính hợp lệ và tính toán giá trị giảm giá.
 */
@Injectable()
export class VoucherService {
  private readonly logger = new Logger(VoucherService.name);
  constructor(
    @InjectRepository(Voucher)
    private readonly voucherRepository: Repository<Voucher>,
    // Inject BookingRepository to check user's booking history
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(VoucherUsage)
    private readonly voucherUsageRepository: Repository<VoucherUsage>,
    @InjectRepository(VoucherCollection)
    private readonly voucherCollectionRepository: Repository<VoucherCollection>,
  ) {}

  /**
   * @method mapToDto
   * @description Ánh xạ từ thực thể Voucher sang VoucherDto.
   */
  private mapToDto(voucher: Voucher): VoucherDto {
    const dto = new VoucherDto();
    dto.id = voucher.id;
    dto.code = voucher.code;
    dto.discountAmount = voucher.discountAmount
      ? Number(voucher.discountAmount)
      : null;
    dto.discountPercentage = voucher.discountPercentage;
    dto.maxDiscountAmount = voucher.maxDiscountAmount
      ? Number(voucher.maxDiscountAmount)
      : null;
    dto.minOrderValue = Number(voucher.minOrderValue);
    dto.validFrom = voucher.validFrom;
    dto.validTo = voucher.validTo;
    dto.quantity = voucher.quantity;
    dto.userProfileId = voucher.userProfileId;
    dto.isCollectible = voucher.isCollectible;
    dto.createdAt = voucher.createdAt;
    dto.updatedAt = voucher.updatedAt;
    return dto;
  }

  /**
   * (Admin) Tạo một mã giảm giá mới.
   * Kiểm tra xem mã đã tồn tại chưa trước khi tạo.
   * @param {CreateVoucherDto} dto - Dữ liệu để tạo voucher mới.
   * @returns {Promise<VoucherDto>} Voucher vừa được tạo.
   * @throws {BadRequestException} Nếu mã voucher đã tồn tại.
   */
  async create(dto: CreateVoucherDto): Promise<VoucherDto> {
    this.logger.log(`Creating new voucher with DTO: ${JSON.stringify(dto)}`);
    const exists = await this.voucherRepository.findOne({
      where: { code: dto.code },
    });
    if (exists) {
      this.logger.warn(`Voucher with code ${dto.code} already exists.`);
      throw new BadRequestException('Voucher đã tồn tại');
    }

    const voucher = this.voucherRepository.create({
      ...dto,
      isCollectible: dto.isCollectible ?? false,
    });
    const savedVoucher = await this.voucherRepository.save(voucher);
    this.logger.log(`Voucher ${savedVoucher.code} created successfully.`);
    return this.mapToDto(savedVoucher);
  }

  /**
   * (System) Tạo một voucher "xin lỗi" cho người dùng khi đơn của họ bị hủy bởi nhân viên.
   * @param userProfile - Hồ sơ người dùng nhận voucher.
   */
  async createApologyVoucher(userProfile: UserProfile): Promise<void> {
    this.logger.log(`Creating apology voucher for user ${userProfile.id}`);
    try {
      const voucherCode = `APOLOGY-${userProfile.id.slice(-6)}-${Date.now()}`;
      const validTo = new Date();
      validTo.setDate(validTo.getDate() + 30); // Voucher có hạn 30 ngày

      const apologyVoucherDto: CreateVoucherDto = {
        code: voucherCode,
        discountPercentage: 20, // Giảm 20%
        maxDiscountAmount: 50000, // Tối đa 50,000đ
        minOrderValue: 0, // Không cần giá trị tối thiểu
        quantity: 1, // Chỉ 1 lần sử dụng
        validFrom: new Date().toISOString(),
        validTo: validTo.toISOString(),
        userProfileId: userProfile.id, // Gán cho người dùng cụ thể
        isCollectible: false,
      };

      await this.create(apologyVoucherDto);
      this.logger.log(
        `Apology voucher ${voucherCode} created for user ${userProfile.id}`,
      );
      // TODO: Gửi thông báo cho người dùng
    } catch (error) {
      this.logger.error(
        `Failed to create apology voucher for user ${userProfile.id}`,
        error,
      );
    }
  }

  /**
   * (System) Tạo voucher chào mừng cho người dùng mới đăng ký.
   * @param userProfile - Hồ sơ người dùng để tạo voucher.
   */
  async createWelcomeVoucher(userProfile: UserProfile): Promise<void> {
    this.logger.log(`Creating welcome voucher for new user ${userProfile.id}.`);
    try {
      const voucherCode = `WELCOME-${userProfile.id.slice(-6)}`;
      const validTo = new Date();
      validTo.setDate(validTo.getDate() + 30); // Voucher có hạn 30 ngày

      const welcomeVoucherDto: CreateVoucherDto = {
        code: voucherCode,
        discountPercentage: 15, // Giảm 15%
        maxDiscountAmount: 40000, // Tối đa 40,000đ
        minOrderValue: 0,
        quantity: 1,
        validFrom: new Date().toISOString(),
        validTo: validTo.toISOString(),
        userProfileId: userProfile.id,
        isCollectible: false,
      };

      await this.create(welcomeVoucherDto);
      this.logger.log(
        `Welcome voucher ${voucherCode} created for user ${userProfile.id}`,
      );
      // TODO: Gửi thông báo cho người dùng
    } catch (error) {
      this.logger.error(
        `Failed to create welcome voucher for user ${userProfile.id}`,
        error,
      );
    }
  }

  /**
   * (Public) Lấy danh sách các voucher hợp lệ cho một giá trị đơn hàng cụ thể.
   * @param orderValue Giá trị của đơn hàng để kiểm tra điều kiện minOrderValue.
   * @returns Danh sách các voucher có thể áp dụng.
   */
  async findAvailableVouchers(orderValue: number): Promise<VoucherDto[]> {
    this.logger.log(
      `Finding available vouchers for order value: ${orderValue}`,
    );
    const now = new Date();
    const availableVouchers = await this.voucherRepository.find({
      where: {
        quantity: MoreThan(0),
        validFrom: LessThanOrEqual(now),
        validTo: MoreThan(now),
        minOrderValue: LessThanOrEqual(orderValue),
        userProfileId: IsNull(), // Chỉ lấy các voucher công khai
        isCollectible: false, // Chỉ lấy các voucher không cần thu thập
      },
      order: {
        // Ưu tiên sắp xếp, ví dụ: voucher giảm nhiều tiền hơn lên trước
        discountAmount: 'DESC',
        discountPercentage: 'DESC',
      },
    });
    this.logger.log(`Found ${availableVouchers.length} available vouchers.`);
    return availableVouchers.map((v) => this.mapToDto(v));
  }

  /**
   * (User) Lấy danh sách voucher mà người dùng có thể "Thu thập" (Lưu).
   * @param userProfileId ID người dùng.
   */
  async findCollectibleVouchers(userProfileId: string): Promise<VoucherDto[]> {
    this.logger.log(`Finding collectible vouchers for user: ${userProfileId}`);
    const now = new Date();

    // Lấy danh sách voucher đã thu thập hoặc đã sử dụng
    const collectedVouchers = await this.voucherCollectionRepository.find({
      where: { userProfileId },
      select: { voucherId: true },
    });
    const collectedVoucherIds = collectedVouchers.map((c) => c.voucherId);

    const usedVouchers = await this.voucherUsageRepository.find({
      where: { userProfileId },
      select: { voucherId: true },
    });
    const usedVoucherIds = usedVouchers.map((u) => u.voucherId);

    const excludedIds = [
      ...new Set([...collectedVoucherIds, ...usedVoucherIds]),
    ];

    const queryBuilder = this.voucherRepository.createQueryBuilder('voucher');
    queryBuilder
      .where('voucher.quantity > 0')
      .andWhere('voucher.validFrom <= :now', { now })
      .andWhere('voucher.validTo > :now', { now })
      .andWhere('voucher.isCollectible = true')
      .andWhere('voucher.userProfileId IS NULL');

    if (excludedIds.length > 0) {
      queryBuilder.andWhere('voucher.id NOT IN (:...excludedIds)', {
        excludedIds,
      });
    }

    const collectibleVouchers = await queryBuilder
      .orderBy('voucher.createdAt', 'DESC')
      .getMany();

    return collectibleVouchers.map((v) => this.mapToDto(v));
  }

  /**
   * (User) Thực hiện thu thập (lưu) một voucher vào ví.
   * @param userProfileId ID người dùng.
   * @param voucherId ID voucher.
   */
  async collectVoucher(
    userProfileId: string,
    voucherId: string,
  ): Promise<void> {
    this.logger.log(`User ${userProfileId} collecting voucher ${voucherId}`);

    const voucher = await this.voucherRepository.findOne({
      where: { id: voucherId },
    });
    if (!voucher) throw new NotFoundException('Voucher không tồn tại');

    if (!voucher.isCollectible)
      throw new BadRequestException('Voucher này không thể thu thập');
    if (voucher.userProfileId && voucher.userProfileId !== userProfileId) {
      throw new BadRequestException('Voucher này không dành cho bạn');
    }

    const now = new Date();
    if (now < voucher.validFrom)
      throw new BadRequestException('Voucher chưa đến thời gian áp dụng');
    if (now > voucher.validTo)
      throw new BadRequestException('Voucher đã hết hạn');
    if (voucher.quantity <= 0)
      throw new BadRequestException('Voucher đã hết lượt thu thập');

    const alreadyCollected = await this.voucherCollectionRepository.findOne({
      where: { userProfileId, voucherId },
    });
    if (alreadyCollected)
      throw new BadRequestException('Bạn đã thu thập voucher này rồi');

    const alreadyUsed = await this.voucherUsageRepository.findOne({
      where: { userProfileId, voucherId },
    });
    if (alreadyUsed)
      throw new BadRequestException('Bạn đã sử dụng voucher này rồi');

    const collection = this.voucherCollectionRepository.create({
      userProfileId,
      voucherId,
    });
    await this.voucherCollectionRepository.save(collection);
    this.logger.log(`User ${userProfileId} collected voucher ${voucher.code}`);
  }

  /**
   * (User) Lấy danh sách voucher của cá nhân người dùng và các voucher công khai chưa sử dụng.
   * @param userProfileId ID của người dùng.
   * @returns Danh sách các voucher khả dụng.
   */
  async findMyVouchers(userProfileId: string): Promise<VoucherDto[]> {
    this.logger.log(`Finding vouchers for user: ${userProfileId}`);
    const now = new Date();

    // Lấy danh sách ID các voucher người dùng đã sử dụng
    const usedVoucherUsages = await this.voucherUsageRepository.find({
      where: { userProfileId },
      select: { voucherId: true },
    });
    const usedVoucherIds = usedVoucherUsages.map((usage) => usage.voucherId);

    // Lấy danh sách ID các voucher người dùng đã thu thập
    const collectedVouchers = await this.voucherCollectionRepository.find({
      where: { userProfileId },
      select: { voucherId: true },
    });
    const collectedVoucherIds = collectedVouchers.map((c) => c.voucherId);

    // Tìm các voucher:
    // - Còn số lượng
    // - Trong thời gian hiệu lực
    // - Chưa sử dụng
    // - Và:
    //   - Là voucher dành riêng cho user (userProfileId = userId)
    //   - HOẶC Là voucher công khai không cần thu thập (userProfileId is null and isCollectible = false)
    //   - HOẶC Là voucher đã được user thu thập (voucher.id IN collectedVoucherIds)
    const queryBuilder = this.voucherRepository.createQueryBuilder('voucher');

    queryBuilder
      .where('voucher.quantity > 0')
      .andWhere('voucher.validFrom <= :now', { now })
      .andWhere('voucher.validTo > :now', { now });

    if (usedVoucherIds.length > 0) {
      queryBuilder.andWhere('voucher.id NOT IN (:...usedVoucherIds)', {
        usedVoucherIds,
      });
    }

    queryBuilder.andWhere(
      new Brackets((qb) => {
        qb.where('voucher.userProfileId = :userProfileId', {
          userProfileId,
        }).orWhere(
          '(voucher.userProfileId IS NULL AND voucher.isCollectible = false)',
        );

        if (collectedVoucherIds.length > 0) {
          qb.orWhere('voucher.id IN (:...collectedVoucherIds)', {
            collectedVoucherIds,
          });
        }
      }),
    );

    const availableVouchers = await queryBuilder
      .orderBy('voucher.createdAt', 'DESC')
      .getMany();

    this.logger.log(
      `Found ${availableVouchers.length} available vouchers for user ${userProfileId}.`,
    );
    return availableVouchers.map((v) => this.mapToDto(v));
  }

  /**
   * (Internal) Ghi nhận việc sử dụng voucher của người dùng.
   * @param userProfileId ID người dùng.
   * @param voucherId ID voucher.
   * @param bookingId ID đơn đặt sân liên quan.
   * @param manager Optional EntityManager for transaction.
   */
  async recordUsage(
    userProfileId: string,
    voucherId: string,
    bookingId?: string,
    manager?: EntityManager,
  ): Promise<void> {
    this.logger.log(
      `Recording voucher usage: user ${userProfileId}, voucher ${voucherId}`,
    );
    const repo = manager
      ? manager.getRepository(VoucherUsage)
      : this.voucherUsageRepository;
    const usage = repo.create({
      userProfileId,
      voucherId,
      bookingId,
    });
    await repo.save(usage);

    // Nếu voucher này đã được thu thập, có thể xóa khỏi danh sách thu thập (vì đã dùng)
    // Hoặc giữ lại cũng được, vì logic findMyVouchers đã loại trừ usedVouchers.
  }

  /**
   * (Internal) Hoàn lại lượt sử dụng voucher (khi đơn bị hủy hoặc thanh toán thất bại).
   * @param userProfileId ID người dùng.
   * @param voucherId ID voucher.
   * @param manager Optional EntityManager for transaction.
   */
  async cancelUsage(
    userProfileId: string,
    voucherId: string,
    manager?: EntityManager,
  ): Promise<void> {
    this.logger.log(
      `Cancelling voucher usage: user ${userProfileId}, voucher ${voucherId}`,
    );
    const repo = manager
      ? manager.getRepository(VoucherUsage)
      : this.voucherUsageRepository;
    await repo.delete({ userProfileId, voucherId });
  }

  /**
   * (Internal) Lấy thông tin sử dụng voucher theo bookingId.
   */
  async getUsageByBookingId(bookingId: string): Promise<VoucherUsage | null> {
    return this.voucherUsageRepository.findOne({
      where: { bookingId },
      relations: { voucher: true },
    });
  }

  /**
   * (User) Kiểm tra tính hợp lệ của một mã giảm giá và tính toán số tiền được giảm.
   * Thực hiện các kiểm tra sau:
   * - Tồn tại
   * - Còn hạn sử dụng
   * - Còn số lượng
   * - Đạt giá trị đơn hàng tối thiểu
   * - Có đúng là của người dùng không (nếu là voucher cá nhân)
   * - Người dùng đã sử dụng voucher này chưa
   * - Nếu là voucher cần thu thập, đã thu thập chưa
   * @param {string} code - Mã voucher cần kiểm tra.
   * @param {number} orderValue - Giá trị của đơn hàng để kiểm tra điều kiện.
   * @param {string} userProfileId - ID của người dùng đang áp dụng.
   * @returns {Promise<VoucherCheckResponseDto>} Một object chứa kết quả kiểm tra và số tiền được giảm.
   * @throws {NotFoundException} Nếu voucher không tồn tại.
   * @throws {BadRequestException} Nếu voucher không hợp lệ (hết hạn, hết lượt, không đủ điều kiện,...).
   */
  async checkVoucher(
    code: string,
    orderValue: number,
    userProfileId: string,
  ): Promise<VoucherCheckResponseDto> {
    this.logger.log(
      `Checking voucher code "${code}" for order value: ${orderValue} by user ${userProfileId}`,
    );
    const voucher = await this.voucherRepository.findOne({ where: { code } });

    if (!voucher) {
      this.logger.warn(`Voucher "${code}" not found.`);
      throw new NotFoundException('Voucher không tồn tại');
    }

    // Kiểm tra xem người dùng đã sử dụng voucher này chưa
    const isUsed = await this.voucherUsageRepository.findOne({
      where: { voucherId: voucher.id, userProfileId },
    });
    if (isUsed) {
      this.logger.warn(`User ${userProfileId} already used voucher "${code}".`);
      throw new BadRequestException('Bạn đã sử dụng mã giảm giá này rồi.');
    }

    // Kiểm tra xem voucher có phải của riêng ai không
    if (voucher.userProfileId && voucher.userProfileId !== userProfileId) {
      this.logger.warn(
        `User ${userProfileId} trying to use a private voucher of user ${voucher.userProfileId}`,
      );
      throw new BadRequestException('Bạn không thể sử dụng mã giảm giá này.');
    }

    // Nếu là voucher cần thu thập, kiểm tra xem đã thu thập chưa
    if (voucher.isCollectible) {
      const isCollected = await this.voucherCollectionRepository.findOne({
        where: { voucherId: voucher.id, userProfileId },
      });
      if (!isCollected) {
        this.logger.warn(
          `User ${userProfileId} trying to use collectible voucher "${code}" without collecting.`,
        );
        throw new BadRequestException(
          'Bạn cần thu thập mã giảm giá này trước khi sử dụng.',
        );
      }
    }

    const now = new Date();
    if (now < new Date(voucher.validFrom)) {
      this.logger.warn(`Voucher "${code}" not yet valid.`);
      throw new BadRequestException('Mã giảm giá chưa đến đợt áp dụng');
    }
    if (now > new Date(voucher.validTo)) {
      this.logger.warn(`Voucher "${code}" expired.`);
      throw new BadRequestException('Mã giảm giá đã hết hạn');
    }
    if (voucher.quantity <= 0) {
      this.logger.warn(`Voucher "${code}" out of stock.`);
      throw new BadRequestException('Mã giảm giá đã hết');
    }

    if (orderValue < Number(voucher.minOrderValue)) {
      this.logger.warn(
        `Voucher "${code}" minimum order value not met. Required: ${
          voucher.minOrderValue
        }, actual: ${orderValue}`,
      );
      throw new BadRequestException(
        `Đơn hàng phải tối thiểu ${Number(
          voucher.minOrderValue,
        ).toLocaleString()}đ để áp dụng`,
      );
    }

    let discountAmount = 0;

    if (voucher.discountAmount) {
      // Loại 1: Giảm tiền mặt (VD: 50k)
      discountAmount = Number(voucher.discountAmount);
    } else if (voucher.discountPercentage) {
      // Loại 2: Giảm % (VD: 10%)
      discountAmount = orderValue * (voucher.discountPercentage / 100);
      if (
        voucher.maxDiscountAmount &&
        discountAmount > Number(voucher.maxDiscountAmount)
      ) {
        // Kiểm tra trần giảm giá (Max cap)
        discountAmount = Number(voucher.maxDiscountAmount);
      }
    }

    if (discountAmount > orderValue) {
      discountAmount = orderValue;
    }
    this.logger.log(
      `Voucher "${code}" applied, discount amount: ${discountAmount}.`,
    );

    const response = new VoucherCheckResponseDto();
    response.isValid = true;
    response.code = voucher.code;
    response.discountAmount = Math.floor(discountAmount);
    response.finalAmount = orderValue - Math.floor(discountAmount);
    response.message = 'Áp dụng mã giảm giá thành công';

    return response;
  }

  async remove(id: string) {
    this.logger.log(`Deleting voucher with ID: ${id}`);
    // Kiểm tra tồn tại
    const voucher = await this.voucherRepository.findOne({ where: { id } });
    if (!voucher) {
      this.logger.warn(`Voucher with ID ${id} not found for deletion.`);
      throw new NotFoundException('Voucher không tồn tại.');
    }

    // Soft delete (TypeORM tự động set deletedAt = now())
    await this.voucherRepository.softDelete(id);
    this.logger.log(`Voucher ${id} soft deleted successfully.`);
    return { message: 'Xóa voucher thành công.' };
  }
}
