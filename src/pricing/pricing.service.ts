import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeSlot } from './entities/time-slot.entity';
import { Booking } from '../booking/entities/booking.entity';
import { Field } from '../field/entities/field.entity';
import { CheckPriceDto } from './dto/check-price.dto';
import { BookingStatus } from '../booking/enums/booking-status.enum';
import moment from 'moment-timezone';
import { Branch } from '@/branch/entities/branch.entity';
import { UpdateTimeSlotDto } from './dto/update-time-slot.dto';

import { TimeSlotDto } from './dto/pricing.dto';
import { CheckPriceResponseDto } from './dto/check-price-response.dto';

/**
 * @class PricingService
 * @description Dịch vụ này chịu trách nhiệm xử lý tất cả logic liên quan đến việc tính giá và kiểm tra tính khả dụng của sân bóng.
 * Nó bao gồm việc xác định giá dựa trên khung giờ, kiểm tra xem sân có bị trùng lịch không, và xác thực giờ hoạt động.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  constructor(
    /**
     * @constructor
     * @param {Repository<TimeSlot>} timeSlotRepository - Repository để truy vấn các khung giờ và giá tương ứng.
     * @param {Repository<Booking>} bookingRepository - Repository để kiểm tra các lịch đặt sân đã tồn tại.
     * @param {Repository<Field>} fieldRepository - Repository để truy vấn thông tin chi tiết về sân bóng.
     */
    @InjectRepository(TimeSlot)
    private readonly timeSlotRepository: Repository<TimeSlot>,
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Field)
    private readonly fieldRepository: Repository<Field>,
  ) { }

  /**
   * Kiểm tra tính khả dụng của sân và tính toán giá tiền cho một yêu cầu đặt sân cụ thể.
   *
   * Luồng xử lý chính:
   * 1. Xác thực thời gian yêu cầu có nằm trong giờ hoạt động của sân không.
   * 2. Kiểm tra sự tồn tại và trạng thái hoạt động của sân bóng.
   * 3. Kiểm tra xem có lịch đặt nào khác bị trùng (overlap) trong khoảng thời gian yêu cầu không.
   * 4. Tra cứu bảng giá `time_slots` dựa trên loại sân và thời gian bắt đầu để xác định giá mỗi giờ.
   * 5. Tính toán tổng chi phí dựa trên giá mỗi giờ và thời lượng đặt.
   *
   * @param {CheckPriceDto} dto - DTO chứa ID sân, thời gian bắt đầu và thời lượng.
   * @returns {Promise<CheckPriceResponseDto>} Một đối tượng chứa thông tin về tính khả dụng, chi tiết đặt sân và giá tiền.
   * @throws {BadRequestException} Nếu thời gian đặt nằm ngoài giờ hoạt động hoặc sân không hoạt động.
   * @throws {NotFoundException} Nếu không tìm thấy sân bóng.
   * @throws {ConflictException} Nếu khung giờ đã được người khác đặt.
   */
  async checkPriceAndAvailability(dto: CheckPriceDto): Promise<CheckPriceResponseDto> {
    this.logger.log(`Checking price and availability for field ${dto.fieldId} at ${dto.startTime} for ${dto.durationMinutes} minutes.`);
    const { fieldId, startTime, durationMinutes } = dto;

    // 1. Tính toán thời gian Bắt đầu và Kết thúc
    const start = new Date(startTime);
    // Kiểm tra ngày quá khứ
    if (start < new Date()) {
      this.logger.warn(`Attempt to book in the past for field ${fieldId}.`);
      throw new BadRequestException('Không thể đặt sân trong quá khứ.');
    }

    const end = new Date(start.getTime() + durationMinutes * 60000);

    // 2. Kiểm tra Sân bóng có tồn tại và đang hoạt động không
    const field = await this.fieldRepository.findOne({
      where: { id: fieldId },
      relations: { fieldType: true, branch: true }, // Cần lấy loại sân để tra giá
    });

    if (!field) {
      this.logger.warn(`Field with ID ${fieldId} not found.`);
      throw new NotFoundException(`Sân bóng với ID ${fieldId} không tồn tại.`);
    }
    if (!field.status) {
      this.logger.warn(`Field ${fieldId} is not active.`);
      throw new BadRequestException('Sân bóng này đang tạm ngưng hoạt động.');
    }

    // Di chuyển xuống đây và truyền `field.branch` vào
    this.validateOperatingHour(start, end, field.branch);

    // 3. LOGIC KIỂM TRA TRÙNG GIỜ (Overlap Check)
    // Query tìm xem có bất kỳ booking nào đã tồn tại mà khoảng thời gian bị đè lên nhau không.
    // Công thức: (StartA < EndB) AND (EndA > StartB)
    const conflictingBooking = await this.bookingRepository
      .createQueryBuilder('booking')
      .where('booking.field_id = :fieldId', { fieldId })
      .andWhere('booking.status != :cancelledStatus', {
        cancelledStatus: BookingStatus.CANCELLED,
      })
      .andWhere('booking.start_time < :requestEnd', { requestEnd: end })
      .andWhere('booking.end_time > :requestStart', { requestStart: start })
      .getOne();

    if (conflictingBooking) {
      this.logger.warn(`Conflicting booking found for field ${fieldId} between ${start.toISOString()} and ${end.toISOString()}.`);
      throw new ConflictException(
        `Khung giờ bạn chọn (${start.toLocaleTimeString('vi-VN')} - ${end.toLocaleTimeString('vi-VN')}) đã bị trùng với một lịch đặt khác.`,
      );
    }

    // 4. TÍNH TOÁN GIÁ TIỀN (Pricing Lookup)
    // Lấy giờ:phút:giây từ startTime để so sánh với bảng time_slots
    const timeString = start.toLocaleTimeString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

    this.logger.debug(`Looking up pricing for field type ${field.fieldType.id} at time ${timeString}.`);

    // Tìm TimeSlot phù hợp với loại sân và khung giờ bắt đầu
    // Logic: Tìm slot mà start_time <= giờ khách chọn <= end_time
    const pricingRule = await this.timeSlotRepository
      .createQueryBuilder('slot')
      .where('slot.field_id = :fieldId', {
        fieldId: field.id,
      })
      .andWhere('slot.start_time <= :time', { time: timeString })
      .andWhere('slot.end_time > :time', { time: timeString }) // Dùng > thay vì >= để tránh edge case đúng giờ giao
      .getOne();

    this.logger.debug(`Pricing rule found: ${pricingRule ? JSON.stringify(pricingRule) : 'None'}.`);

    // Nếu không tìm thấy khung giá (ví dụ 2h sáng), dùng giá mặc định hoặc báo lỗi
    // Ở đây giả sử giá mặc định là 100.000 VNĐ/giờ nếu không cấu hình
    const pricePerHour = pricingRule ? Number(pricingRule.price) : 100000;

    // Tính tổng tiền: (Giá 1 giờ / 60 phút) * số phút đá
    const finalPrice = (pricePerHour / 60) * durationMinutes;

    // Làm tròn tiền (ví dụ làm tròn đến hàng nghìn)
    const roundedPrice = Math.ceil(finalPrice / 1000) * 1000;
    this.logger.debug(`Price calculated for field ${fieldId}: ${roundedPrice} VND.`);

    const response = new CheckPriceResponseDto();
    response.available = true;
    response.field_name = field.name;
    response.booking_details = {
      date: start.toLocaleDateString('vi-VN'),
      start_time: start.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      end_time: end.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      duration: `${durationMinutes} phút`,
    };
    response.pricing = {
      price_per_hour: pricePerHour,
      total_price: roundedPrice,
      currency: 'VND',
    };
    response.message = 'Sân còn trống, có thể đặt ngay.';

    return response;
  }

  private validateOperatingHour(start: Date, end: Date, branch: Branch) {
    this.logger.debug(`Validating operating hours for branch ${branch.id}. Start: ${start.toISOString()}, End: ${end.toISOString()}.`);
    // 1. Parse giờ mở/đóng cửa của Branch (Lưu dạng '05:00:00')
    const [openH, openM] = branch.open_time.split(':').map(Number);
    const [closeH, closeM] = branch.close_time.split(':').map(Number);

    const startHCM = moment(start).tz('Asia/Ho_Chi_Minh');
    const endHCM = moment(end).tz('Asia/Ho_Chi_Minh');

    // Convert thời gian đặt sang phút trong ngày để so sánh dễ hơn
    const requestStartMinutes = startHCM.hour() * 60 + startHCM.minute();
    const requestEndMinutes = endHCM.hour() * 60 + endHCM.minute();

    const branchOpenMinutes = openH * 60 + openM;
    const branchCloseMinutes = closeH * 60 + closeM;

    // 2. Logic kiểm tra
    if (requestStartMinutes < branchOpenMinutes) {
      this.logger.warn(`Booking outside of operating hours: branch ${branch.id} opens at ${branch.open_time}.`);
      throw new BadRequestException(
        `Chi nhánh này chỉ mở cửa từ ${branch.open_time}.`,
      );
    }

    if (requestEndMinutes > branchCloseMinutes) {
      this.logger.warn(`Booking outside of operating hours: branch ${branch.id} closes at ${branch.close_time}.`);
      throw new BadRequestException(
        `Chi nhánh này đóng cửa lúc ${branch.close_time}. Vui lòng chọn giờ kết thúc sớm hơn.`,
      );
    }
  }

  /**
   * @method mapToDto
   * @description Ánh xạ từ thực thể TimeSlot sang TimeSlotDto.
   */
  private mapToDto(slot: TimeSlot): TimeSlotDto {
    const dto = new TimeSlotDto();
    dto.id = slot.id;
    dto.start_time = slot.start_time;
    dto.end_time = slot.end_time;
    dto.price = Number(slot.price);
    dto.is_peak_hour = slot.is_peak_hour;

    if (slot.field?.fieldType) {
      dto.fieldType = {
        id: slot.field.fieldType.id,
        name: slot.field.fieldType.name,
        description: slot.field.fieldType.description,
      };
    }

    return dto;
  }

  /**
   * Lấy tất cả các khung giờ.
   *
   * @returns {Promise<TimeSlotDto[]>} Danh sách tất cả các khung giờ.
   */
  async getAllTimeSlots(): Promise<TimeSlotDto[]> {
    this.logger.log('Fetching all time slots.');
    const slots = await this.timeSlotRepository.find({ relations: { field: { fieldType: true } } });
    return slots.map(s => this.mapToDto(s));
  }

  /**
   * Cập nhật thông tin của một khung giờ.
   *
   * @param {number} id - ID của khung giờ cần cập nhật.
   * @param {UpdateTimeSlotDto} dto - DTO chứa thông tin cập nhật.
   * @returns {Promise<TimeSlotDto>} Khung giờ đã được cập nhật.
   * @throws {NotFoundException} Nếu không tìm thấy khung giờ.
   */
  async updateTimeSlot(id: number, dto: UpdateTimeSlotDto): Promise<TimeSlotDto> {
    this.logger.log(`Updating time slot with ID ${id} with data: ${JSON.stringify(dto)}`);
    const timeSlot = await this.timeSlotRepository.findOne({ 
      where: { id }, 
      relations: { 
        field: { fieldType: true } 
      } 
    }
  );

    if (!timeSlot) {
      this.logger.warn(`Time slot with ID ${id} not found.`);
      throw new NotFoundException(`Khung giờ với ID ${id} không tồn tại.`);
    }

    // Cập nhật các trường nếu chúng được cung cấp trong DTO
    if (dto.price) {
      timeSlot.price = dto.price;
    }
    if (dto.start_time) {
      timeSlot.start_time = dto.start_time;
    }
    if (dto.end_time) {
      timeSlot.end_time = dto.end_time;
    }
    if (dto.is_peak_hour !== undefined) {
      timeSlot.is_peak_hour = dto.is_peak_hour;
    }

    const savedSlot = await this.timeSlotRepository.save(timeSlot);
    return this.mapToDto(savedSlot);
  }

  /**
   * Tạo một khung giờ mới.
   *
   * @param {CreateTimeSlotDto} dto - DTO chứa thông tin tạo khung giờ.
   * @returns {Promise<TimeSlotDto>} Khung giờ đã được tạo.
   * @throws {NotFoundException} Nếu không tìm thấy sân bóng.
   */
  async createTimeSlot(dto: import('./dto/create-time-slot.dto').CreateTimeSlotDto): Promise<TimeSlotDto> {
    this.logger.log(`Creating new time slot for field ${dto.field_id}`);
    
    const field = await this.fieldRepository.findOne(
      { where: { id: dto.field_id }, 
      relations: { fieldType: true } 
    });
    if (!field) {
      throw new NotFoundException(`Sân bóng với ID ${dto.field_id} không tồn tại.`);
    }

    const newSlot = this.timeSlotRepository.create({
      start_time: dto.start_time,
      end_time: dto.end_time,
      price: dto.price,
      is_peak_hour: dto.is_peak_hour,
      field: field,
    });

    const savedSlot = await this.timeSlotRepository.save(newSlot);
    return this.mapToDto(savedSlot);
  }
}
