import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Feedback } from './entities/feedback.entity';
import { FeedbackResponse } from './entities/feedback-response.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { ReplyFeedbackDto } from './dto/reply-feedback.dto';
import { Account } from '../user/entities/account.entity';
import { EventGateway } from '@/event/event.gateway';
import { FeedbackStatus } from './enums/feedback-status.enum';
import { UserProfile } from '@/user/entities/users-profile.entity';
import { UserProfileResponseDto } from '@/user/dto/user-profile-response.dto';

import { FeedbackDto } from './dto/feedback.dto';
import { FeedbackResponseDto } from './dto/feedback-response.dto';
import { RoleEnum } from '@/auth/enums/role.enum';

/**
 * @class FeedbackService
 * @description Service xử lý logic nghiệp vụ cho hệ thống feedback và hỗ trợ.
 */
@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);
  /**
   * @constructor
   * @param {Repository<Feedback>} feedbackRepo - Repository cho thực thể Feedback.
   * @param {Repository<FeedbackResponse>} responseRepo - Repository cho thực thể FeedbackResponse.
   * @param {EventGateway} eventGateway - Gateway để gửi sự kiện real-time qua WebSocket.
   * @param {DataSource} dataSource - Quản lý các transaction của TypeORM.
   */
  constructor(
    @InjectRepository(Feedback)
    private feedbackRepo: Repository<Feedback>,
    @InjectRepository(FeedbackResponse)
    private responseRepo: Repository<FeedbackResponse>,
    private readonly eventGateway: EventGateway,
    private dataSource: DataSource,
  ) { }

  /**
   * @method mapToDto
   * @description Ánh xạ từ thực thể Feedback sang FeedbackDto.
   */
  private mapToDto(feedback: Feedback): FeedbackDto {
    const dto = new FeedbackDto();
    dto.id = feedback.id;
    dto.title = feedback.title;
    dto.category = feedback.category;
    dto.status = feedback.status;
    dto.created_at = feedback.created_at;

    if (feedback.submitter) {
      dto.submitter = this.mapProfileToDto(feedback.submitter);
    }

    if (feedback.assignee) {
      dto.assignee = this.mapProfileToDto(feedback.assignee);
    }

    if (feedback.responses && feedback.responses.length > 0) {
      // Sắp xếp responses theo thời gian tạo (cũ nhất lên đầu)
      const sortedResponses = [...feedback.responses].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      // Lấy tin nhắn đầu tiên (thường là nội dung gốc do người dùng nhập lúc tạo)
      dto.content = sortedResponses[0].content;
      
      // Vẫn map toàn bộ responses như bình thường
      dto.responses = sortedResponses.map(res => this.mapResponseToDto(res));
    } else {
      dto.content = '';
      dto.responses = [];
    }

    return dto;
  }

  /**
   * @method mapResponseToDto
   * @description Ánh xạ từ thực thể FeedbackResponse sang FeedbackResponseDto.
   */
  private mapResponseToDto(res: FeedbackResponse): FeedbackResponseDto {
    const dto = new FeedbackResponseDto();
    dto.id = res.id;
    dto.content = res.content;
    dto.created_at = res.created_at;
    if (res.responder) {
      dto.responder = this.mapProfileToDto(res.responder);
    }
    return dto;
  }

  private mapProfileToDto(profile: UserProfile): UserProfileResponseDto {
    const dto = new UserProfileResponseDto();
    dto.id = profile.id;
    dto.full_name = profile.full_name;
    dto.avatar_url = profile.avatar_url;
    dto.phone_number = profile.phone_number;
    dto.is_profile_complete = profile.is_profile_complete;
    dto.created_at = profile.created_at;
    dto.updated_at = profile.updated_at;
    dto.date_of_birth = profile.date_of_birth;
    dto.gender = profile.gender;
    dto.bio = profile.bio;
    return dto;
  }

  /**
   * @method create
   * @description Tạo một ticket feedback mới cùng với tin nhắn đầu tiên.
   * @param {CreateFeedbackDto} createDto - DTO chứa thông tin để tạo feedback.
   * @param {Account} account - Tài khoản của người dùng tạo feedback.
   * @returns {Promise<FeedbackDto>} - Ticket feedback vừa được tạo.
   */
  async create(
    createDto: CreateFeedbackDto,
    account: Account,
  ): Promise<FeedbackDto> {
    this.logger.log(
      `User ${account.id} creating feedback with DTO: ${JSON.stringify(
        createDto,
      )}`,
    );
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Truy vấn lại UserProfile một cách tường minh bên trong transaction
      // để đảm bảo tính toàn vẹn dữ liệu.
      const userProfile = await queryRunner.manager.findOne(UserProfile, {
        where: { account: { id: account.id } },
      });

      if (!userProfile) {
        this.logger.error(`User profile not found for account ${account.id}`);
        throw new NotFoundException('Không tìm thấy hồ sơ người dùng.');
      }

      // Tạo ticket feedback
      const feedback = queryRunner.manager.create(Feedback, {
        title: createDto.title,
        category: createDto.category,
        status: FeedbackStatus.OPEN,
        submitter: userProfile,
      });
      const savedFeedback = await queryRunner.manager.save(feedback);

      // Tạo tin nhắn đầu tiên trong ticket
      const firstResponse = queryRunner.manager.create(FeedbackResponse, {
        content: createDto.content,
        feedback: savedFeedback,
        responder: userProfile,
      });
      await queryRunner.manager.save(firstResponse);

      await queryRunner.commitTransaction();
      this.logger.log(`Feedback ${savedFeedback.id} created successfully`);

      // Reload to get relations for mapping
      const result = await this.findOne(savedFeedback.id);

      // Thông báo cho admin về ticket mới
      this.eventGateway.notifyAdminsNewFeedback(result);
      return result;
    } catch (err) {
      this.logger.error(`Error creating feedback: `, err);
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * @method findMyFeedbacks
   * @description Tìm tất cả các ticket feedback do một người dùng cụ thể tạo.
   * @param {Account} account - Tài khoản của người dùng.
   * @returns {Promise<FeedbackDto[]>} - Danh sách các ticket của người dùng.
   */
  async findMyFeedbacks(account: Account): Promise<FeedbackDto[]> {
    this.logger.log(`Finding feedbacks for user ${account.id}`);
    const feedbacks = await this.feedbackRepo.find({
      where: { submitter: { account: { id: account.id } } },
      order: { created_at: 'DESC' },
      relations: { 
        responses: { responder: true }, 
        submitter: { account: true }, 
        assignee: true 
      },
    });

    return feedbacks.map(f => this.mapToDto(f));
  }

  /**
   * @method findAll
   * @description (Admin/Manager) Lấy tất cả các ticket feedback trong hệ thống.
   * @returns {Promise<FeedbackDto[]>} - Danh sách tất cả các ticket.
   */
  async findAll(): Promise<FeedbackDto[]> {
    this.logger.log('Finding all feedbacks');
    const feedbacks = await this.feedbackRepo.find({
      order: { created_at: 'DESC' },
      relations: { 
        submitter: { account: true }, 
        assignee: true, 
        responses: { responder: true } 
      }, // Load thông tin người gửi + account
    });

    return feedbacks.map(f => this.mapToDto(f));
  }

  /**
   * @method findOne
   * @description Tìm chi tiết một ticket feedback, bao gồm tất cả các tin nhắn trả lời.
   * @param {string} id - ID của ticket.
   * @returns {Promise<FeedbackDto>} - Chi tiết của ticket.
   * @throws {NotFoundException} Nếu không tìm thấy ticket.
   */
  async findOne(id: string): Promise<FeedbackDto> {
    this.logger.log(`Finding feedback with id ${id}`);
    const feedback = await this.feedbackRepo.findOne({
      where: { id },
      relations: { 
        responses: { responder: true }, 
        submitter: { account: true }, 
        assignee: true 
      },
      order: {
        responses: { created_at: 'ASC' },
      },
    });
    if (!feedback) {
      this.logger.error(`Feedback with id ${id} not found`);
      throw new NotFoundException('Không tìm thấy ticket feedback.');
    }

    return this.mapToDto(feedback);
  }

  /**
   * @method reply
   * @description Gửi một tin nhắn trả lời vào một ticket feedback.
   * Tự động cập nhật trạng thái ticket và gửi sự kiện real-time.
   * @param {string} feedbackId - ID của ticket để trả lời.
   * @param {ReplyFeedbackDto} dto - DTO chứa nội dung trả lời.
   * @param {Account} account - Tài khoản của người gửi trả lời.
   * @returns {Promise<FeedbackResponseDto>} - Tin nhắn trả lời vừa được lưu.
   */
  async reply(
    feedbackId: string,
    dto: ReplyFeedbackDto,
    account: Account,
  ): Promise<FeedbackResponseDto> {
    this.logger.log(
      `User ${account.id
      } replying to feedback ${feedbackId} with DTO: ${JSON.stringify(dto)}`,
    );
    const feedback = await this.feedbackRepo.findOne({
      where: { id: feedbackId },
    });

    if (!feedback) {
      throw new NotFoundException('Không tìm thấy ticket feedback.');
    }

    // SỬA LỖI: Truy vấn lại UserProfile một cách tường minh để đảm bảo nó tồn tại
    // và tránh lỗi khóa ngoại khi `account.userProfile` là undefined.
    const userProfile = await this.dataSource.getRepository(UserProfile).findOne({
      where: { account: { id: account.id } },
    });

    if (!userProfile) {
      throw new NotFoundException(`Không tìm thấy hồ sơ người dùng cho tài khoản ${account.id}.`);
    }

    // Nếu admin/manager trả lời, cập nhật trạng thái ticket.
    if (
      account.role.name !== String(RoleEnum.User) &&
      feedback.status === FeedbackStatus.OPEN
    ) {
      this.logger.log(`Updating feedback ${feedbackId} status to in_progress`);
      await this.feedbackRepo.update(feedbackId, {
        status: FeedbackStatus.IN_PROGRESS,
      });
    }

    // Tạo và lưu tin nhắn mới
    const response = this.responseRepo.create({
      content: dto.content,
      feedback: { id: feedbackId } as Feedback,
      responder: userProfile,
    });
    const savedResponse = await this.responseRepo.save(response);

    // Gửi sự kiện real-time đến những người đang xem ticket
    this.eventGateway.sendNewMessage(feedbackId, {
      id: savedResponse.id,
      content: savedResponse.content,
      created_at: savedResponse.created_at,
      responder: {
        id: userProfile.id,
        fullName: userProfile.full_name,
        avatarUrl: userProfile.avatar_url,
        role: account.role.name,
      },
    });

    return this.mapResponseToDto(savedResponse);
  }

  /**
   * @method updateStatus
   * @description (Admin/Manager) Cập nhật trạng thái của ticket feedback
   */
  async updateStatus(
    id: string,
    status: FeedbackStatus,
  ): Promise<FeedbackDto> {
    this.logger.log(`Updating status of feedback ${id} to ${status}`);
    const feedback = await this.feedbackRepo.findOne({ where: { id } });
    if (!feedback) {
      throw new NotFoundException('Không tìm thấy ticket feedback.');
    }

    feedback.status = status;
    const updatedFeedback = await this.feedbackRepo.save(feedback);
    
    // Reload full info to return
    return this.findOne(updatedFeedback.id);
  }
}