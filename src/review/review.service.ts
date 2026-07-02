import { BookingService } from '@/booking/booking.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UserProfile } from '@/user/entities/users-profile.entity';
import { BookingStatus } from '@/booking/enums/booking-status.enum';
import { AuthenticatedUser } from '@/auth/interface/authenicated-user.interface';
import { RoleEnum } from '@/auth/enums/role.enum';
import { ReviewDto } from './dto/review.dto';
import { ReviewPaginatedResponseDto } from './dto/review-paginated-response.dto';
import { ReviewPaginationMetaDto } from './dto/review-pagination-meta.dto';


/**
 * @class ReviewService
 * @description Service xử lý logic nghiệp vụ liên quan đến đánh giá của người dùng.
 */
@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);
  /**
   * @constructor
   * @param {Repository<Review>} reviewRepository - Repository để tương tác với thực thể Review.
   * @param {BookingService} bookingService - Service để truy vấn thông tin về các lượt đặt sân.
   */
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,

    private readonly bookingService: BookingService,
  ) { }

  /**
   * @method mapToDto
   * @description Ánh xạ từ thực thể Review sang ReviewDto.
   */
  private mapToDto(review: Review): ReviewDto {
    const dto = new ReviewDto();
    dto.id = review.id;
    dto.rating = review.rating;
    dto.comment = review.comment;
    dto.createdAt = review.createdAt;

    if (review.userProfile) {
      dto.userProfile = {
        id: review.userProfile.id,
        full_name: review.userProfile.full_name,
        avatar_url: review.userProfile.avatar_url,
        phone_number: review.userProfile.phone_number,
        is_profile_complete: review.userProfile.is_profile_complete,
        created_at: review.userProfile.created_at,
        updated_at: review.userProfile.updated_at,
        date_of_birth: review.userProfile.date_of_birth,
        gender: review.userProfile.gender,
        bio: review.userProfile.bio,
        address: null,
      };
    }

    return dto;
  }

  /**
   * Tạo một bài đánh giá mới cho một lượt đặt sân.
   * @param {CreateReviewDto} createReviewDto - DTO chứa thông tin đánh giá (ID đơn đặt, điểm, bình luận).
   * @param {UserProfile} userProfile - Hồ sơ của người dùng đang thực hiện đánh giá.
   * @returns {Promise<ReviewDto>} - Bài đánh giá vừa được tạo.
   * @throws {NotFoundException} Nếu không tìm thấy đơn đặt sân.
   * @throws {BadRequestException} Nếu người dùng không có quyền, đơn chưa hoàn thành, hoặc đã được đánh giá trước đó.
   */
  async createReview(
    createReviewDto: CreateReviewDto,
    userProfile: UserProfile,
  ): Promise<ReviewDto> {
    this.logger.log(`User ${userProfile.id} creating review for booking ${createReviewDto.bookingId}`);
    const { bookingId, rating, comment } = createReviewDto;

    // 1. Tìm Booking, đảm bảo join đủ các quan hệ cần thiết (field, userProfile)
    const booking = await this.bookingService.findOne(bookingId); // findOne đã có relations: ['userProfile', 'field']
    if (!booking) {
      this.logger.warn(`Booking ${bookingId} not found.`);
      throw new NotFoundException('Không tìm thấy đơn đặt sân.');
    }

    this.logger.log(`[DEBUG] Found booking ${bookingId} with status: "${booking.status}" (type: ${typeof booking.status})`);

    // 2. Kiểm tra quyền sở hữu (User này có phải người đặt không?)
    if (booking.userProfile.id !== userProfile.id) {
      this.logger.warn(`User ${userProfile.id} unauthorized to review booking ${bookingId}.`);
      throw new ForbiddenException('Bạn không có quyền đánh giá đơn này.');
    }
    this.logger.debug(`User ${userProfile.id} is the owner of booking ${bookingId}.`);

    // 3. Kiểm tra trạng thái đơn (Phải đã check-in hoặc hoàn thành mới được review)
    // Xử lý trường hợp status rỗng do bug database
    let actualStatus = booking.status;
    if (actualStatus === BookingStatus.COMPLETED) {
      this.logger.warn(`Booking ${bookingId} has status COMPLETED. It should ideally be CHECKED_IN or FINISHED to be reviewed.`);
    }

    // Nếu status rỗng nhưng có check_in_at, suy luận status là CHECKED_IN
    if ((!actualStatus || (actualStatus as any) === '') && booking.check_in_at) {
      actualStatus = BookingStatus.CHECKED_IN;
      this.logger.log(`[DEBUG] Status empty but has check_in_at, inferring status as CHECKED_IN`);
    }

    const allowedStatuses = [
      BookingStatus.CHECKED_IN,
      BookingStatus.FINISHED
    ];

    // Log để debug
    this.logger.log(`[DEBUG] Booking ${bookingId} actual status: "${actualStatus}" (type: ${typeof actualStatus})`);
    this.logger.log(`[DEBUG] Allowed statuses: ${JSON.stringify(allowedStatuses)}`);
    this.logger.log(`[DEBUG] Status comparison: CHECKED_IN=${actualStatus === BookingStatus.CHECKED_IN}, FINISHED=${actualStatus === BookingStatus.FINISHED}`);

    // So sánh với actualStatus thay vì booking.status
    const isAllowed = allowedStatuses.includes(actualStatus);

    if (!isAllowed) {
      this.logger.warn(`Booking ${bookingId} status ${actualStatus} not allowed for review.`);
      throw new BadRequestException(
        'Chỉ có thể đánh giá các đơn đặt sân đã check-in hoặc hoàn thành.',
      );
    }
    this.logger.debug(`Booking ${bookingId} status '${actualStatus}' is valid for review.`);

    // 4. Kiểm tra đã review chưa (Tránh spam)
    const existingReview = await this.reviewRepository.findOne({
      where: { booking: { id: bookingId } },
    });
    if (existingReview) {
      this.logger.warn(`Booking ${bookingId} already has a review (ID: ${existingReview.id}).`);
      throw new BadRequestException('Bạn đã đánh giá đơn này trước đó.');
    }
    this.logger.debug(`Booking ${bookingId} has no existing review. Proceeding.`);

    try {
      //5. Lưu review
      const newReview = this.reviewRepository.create({
        id: booking.id, // Dùng luôn ID của booking cho review để đảm bảo 1-1
        rating,
        comment,
        booking: booking,
        field: booking.field, // Lấy field từ booking
        userProfile: userProfile, // Lấy userProfile từ người đang review
      });

      const savedReview = await this.reviewRepository.save(newReview);
      this.logger.log(`Review ${newReview.id} created successfully for booking ${bookingId}.`);
      return this.mapToDto(savedReview);
    } catch (error) {
      this.logger.error(
        `Failed to save review for booking ${bookingId}. Error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadRequestException('Không thể lưu đánh giá vào lúc này.');
    }
  }

  /**
   * Tìm tất cả các bài đánh giá của một sân bóng cụ thể, có phân trang.
   * @param {string} fieldId - ID của sân bóng cần lấy đánh giá.
   * @param {number} [page=1] - Trang hiện tại.
   * @param {number} [limit=10] - Số lượng đánh giá trên mỗi trang.
   * @returns {Promise<ReviewPaginatedResponseDto>} - Một đối tượng chứa danh sách đánh giá và thông tin meta.
   */
  async findByField(fieldId: string, page: number = 1, limit: number = 10): Promise<ReviewPaginatedResponseDto> {
    this.logger.log(`Fetching reviews for field ${fieldId}, page ${page}, limit ${limit}.`);
    const skip = (page - 1) * limit;

    const [review, total] = await this.reviewRepository.findAndCount({
      where: {
        field: {
          id: fieldId,
        },
      },
      relations: { userProfile: true }, // Load thông tin người đánh giá (để hiện tên, avatar)
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Tính điểm trung bình (Optional - để hiển thị rating chung của sân)
    const averageRating =
      total > 0 ? review.reduce((sum, r) => sum + r.rating, 0) / total : 0;
    this.logger.log(`Found ${total} reviews for field ${fieldId}, average rating: ${averageRating}.`);

    const response = new ReviewPaginatedResponseDto();
    response.data = review.map(r => this.mapToDto(r));

    const meta = new ReviewPaginationMetaDto();
    meta.total = total;
    meta.page = page;
    meta.limit = limit;
    meta.lastPage = Math.ceil(total / limit);
    meta.averageRating = parseFloat(averageRating.toFixed(1));

    response.meta = meta;

    return response;
  }

  async findMyReviews(user: AuthenticatedUser, page: number = 1, limit: number = 10): Promise<ReviewPaginatedResponseDto> {
    this.logger.log(`Fetching my reviews for user ${user.id}, page ${page}, limit ${limit}.`);
    const skip = (page - 1) * limit;

    const [data, total] = await this.reviewRepository.findAndCount({
      where: {
        userProfile: { account: { id: user.id } }
      },
      relations: { field: true, booking: true, userProfile: true },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    this.logger.log(`Found ${total} reviews for user ${user.id}.`);

    const response = new ReviewPaginatedResponseDto();
    response.data = data.map(r => this.mapToDto(r));

    const meta = new ReviewPaginationMetaDto();
    meta.total = total;
    meta.page = page;
    meta.limit = limit;
    meta.lastPage = Math.ceil(total / limit);
    meta.averageRating = 0;

    response.meta = meta;

    return response;
  }

  /**
   * @method findAllReviews
   * @description Lấy danh sách review dùng cho trang quản lý.
   * - Admin: Lấy hết.
   * - Manager: Chỉ lấy review thuộc chi nhánh mình quản lý.
   */
  async findAllReviews(page: number, limit: number, user: AuthenticatedUser): Promise<ReviewPaginatedResponseDto> {
    this.logger.log(`User ${user.id} fetching all reviews (management), page ${page}, limit ${limit}. Role: ${user.role.name}.`);
    const skip = (page - 1) * limit;

    const query = this.reviewRepository
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.userProfile', 'userProfile') // Người review
      .leftJoinAndSelect('review.field', 'field') // Sân được review
      .leftJoinAndSelect('field.branch', 'branch') // Chi nhánh của sân
      .orderBy('review.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    // LOGIC PHÂN QUYỀN:
    // Nếu là Manager, thêm điều kiện lọc theo branch_id
    if (user.role.name === (RoleEnum.Manager as string) && user.branch_id) {
      this.logger.debug(`Filtering reviews for manager ${user.id} by branch ${user.branch_id}.`);
      query.andWhere('branch.id = :branchId', { branchId: user.branch_id });
    }

    const [data, total] = await query.getManyAndCount();
    this.logger.log(`Found ${total} reviews for management view.`);

    const response = new ReviewPaginatedResponseDto();
    response.data = data.map(r => this.mapToDto(r));

    const meta = new ReviewPaginationMetaDto();
    meta.total = total;
    meta.page = page;
    meta.limit = limit;
    meta.lastPage = Math.ceil(total / limit);
    meta.averageRating = 0;

    response.meta = meta;

    return response;
  }

  /**
   * @method delete
   * @description Xóa review. Kiểm tra quyền hạn kỹ càng.
   */
  async delete(id: string, user: AuthenticatedUser) {
    this.logger.log(`User ${user.id} attempting to delete review ${id}. Role: ${user.role.name}.`);
    // 1. Tìm review kèm thông tin chi nhánh
    const review = await this.reviewRepository.findOne({
      where: { id },
      relations: {
        field: {
          branch: true,
        },
        userProfile: {
          account: true,
        },
      },
    });

    if (!review) {
      this.logger.warn(`Review ${id} not found for deletion.`);
      throw new NotFoundException('Không tìm thấy đánh giá');
    }

    // 2. Logic kiểm tra quyền
    if (user.role.name === (RoleEnum.Admin as string)) {
      this.logger.debug(`Admin ${user.id} deleting review ${id}.`);
      // Admin được quyền xóa tất cả -> Pass
    } else if (user.role.name === (RoleEnum.Manager as string)) {
      // Manager chỉ được xóa review của chi nhánh mình
      if (review.field.branch.id !== user.branch_id) {
        this.logger.warn(`Manager ${user.id} unauthorized to delete review ${id} (different branch).`);
        throw new ForbiddenException(
          'Bạn không có quyền xóa đánh giá của chi nhánh khác.',
        );
      }
      this.logger.debug(`Manager ${user.id} deleting review ${id} in own branch.`);
    } else {
      // User thường chỉ được xóa review của chính mình
      // (user.sub hoặc user.id tùy vào JWT payload bạn cấu hình, thường là user.id khớp với account id)
      if (review.userProfile.account.id !== user.id) {
        this.logger.warn(`User ${user.id} unauthorized to delete review ${id} (not owner).`);
        throw new ForbiddenException('Bạn không có quyền xóa đánh giá này.');
      }
      this.logger.debug(`User ${user.id} deleting own review ${id}.`);
    }

    // 3. Xóa
    try {
      await this.reviewRepository.delete(id);
      this.logger.log(`Review ${id} deleted successfully.`);
      return { message: 'Xóa đánh giá thành công.' };
    } catch (error) {
      this.logger.error(`Failed to delete review ${id}. Error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      throw new BadRequestException('Không thể xóa đánh giá vào lúc này.');
    }
  }
}
