import {
  Controller,
  Get,
  HttpCode,
  UseGuards,
  Put,
  Body,
  Query,
  Param,
  Patch,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
  BadRequestException,
  Post,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { User } from '@/auth/decorator/users.decorator';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { Roles } from '@/auth/decorator/roles.decorator';
import { RolesGuard } from '@/auth/guards/role.guard';
import { RoleEnum } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '@/auth/interface/authenicated-user.interface';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';

import { AccountResponseDto } from './dto/account-response.dto';
import { AccountPaginatedResponseDto } from './dto/account-paginated-response.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { MessageResponseDto } from '@/common/dto/message-response.dto';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

/**
 * @controller UsersController
 * @description Xử lý các yêu cầu liên quan đến thông tin người dùng.
 */
@ApiTags('Users')
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);
  /**
   * @constructor
   * @param {UsersService} usersService - Service xử lý logic nghiệp vụ liên quan đến người dùng.
   */
  constructor(private readonly usersService: UsersService) {}

  /**
   * @route GET /users/me
   * @description Lấy thông tin chi tiết của tài khoản và hồ sơ của người dùng đang đăng nhập.
   * @param {string} accountID - ID của tài khoản, được trích xuất từ JWT payload bởi decorator `@User`.
   * @returns {Promise<AccountResponseDto>} - Thông tin tài khoản và hồ sơ liên quan.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy thông tin hồ sơ của người dùng đang đăng nhập',
  })
  @ApiResponse({ status: 200, type: AccountResponseDto })
  getProfile(
    @User('sub') accountID: string,
  ): Promise<AccountResponseDto | null> {
    this.logger.log(`Fetching profile for user ${accountID}`);
    return this.usersService.findAccountById(accountID, {
      role: true,
      userProfile: { address: { city: true, ward: true } },
    });
  }

  /**
   * @route PUT /users/me/profile
   * @description Cập nhật thông tin hồ sơ cho người dùng đang đăng nhập.
   * @param {AuthenticatedUser} user - Đối tượng người dùng đã xác thực, được inject bởi decorator `@User`.
   * @param {UpdateUserProfileDto} updateUserProfileDto - DTO chứa các thông tin cần cập nhật.
   * @returns {Promise<MessageResponseDto>} - Một thông báo thành công.
   */
  @Put('me/profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật hồ sơ của người dùng đang đăng nhập' })
  @ApiResponse({
    status: 200,
    type: MessageResponseDto,
    description: 'Cập nhật thành công.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy người dùng.' })
  async updateProfile(
    @User() user: AuthenticatedUser,
    @Body() updateUserProfileDto: UpdateUserProfileDto,
  ): Promise<MessageResponseDto> {
    this.logger.log(
      `Updating profile for user ${user.id} with DTO: ${JSON.stringify(
        updateUserProfileDto,
      )}`,
    );
    return await this.usersService.updateProfile(user.id, updateUserProfileDto);
  }

  /**
   * @route PATCH /users/me/avatar
   * @description Cập nhật ảnh đại diện cho người dùng đang đăng nhập.
   * @param {string} accountId - ID của tài khoản người dùng.
   * @param {Express.Multer.File} file - Đối tượng file đã được upload.
   * @returns {Promise<UserProfileResponseDto>} - Thông tin hồ sơ người dùng sau khi cập nhật.
   */
  @Patch('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatar')) // 'avatar' là tên field trong FormData
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật ảnh đại diện' })
  @ApiResponse({
    status: 200,
    type: UserProfileResponseDto,
    description: 'Cập nhật thành công.',
  })
  async uploadAvatar(
    @User('id') accountId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UserProfileResponseDto> {
    this.logger.log(`Uploading avatar for user ${accountId}`);
    if (!file) {
      throw new BadRequestException('Bạn phải cung cấp một file ảnh.');
    }

    // `file.path` sẽ là đường dẫn file trên server, ví dụ: "uploads/avatar-1678886400000-123456789.jpg"
    // Service của bạn sẽ lưu đường dẫn này vào database
    return await this.usersService.updateAvatar(accountId, file.filename);
  }

  /**
   * @route PATCH /users/me/password
   * @description Thay đổi mật khẩu cho người dùng đang đăng nhập.
   * @param {AuthenticatedUser} user - Đối tượng người dùng đã xác thực.
   * @param {ChangePasswordDto} changePasswordDto - DTO chứa mật khẩu cũ và mới.
   * @returns {Promise<MessageResponseDto>} - Thông báo thành công.
   */
  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thay đổi mật khẩu của người dùng đang đăng nhập' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({
    status: 200,
    type: MessageResponseDto,
    description: 'Đổi mật khẩu thành công.',
  })
  @ApiResponse({ status: 400, description: 'Mật khẩu mới không hợp lệ.' })
  @ApiResponse({ status: 401, description: 'Mật khẩu cũ không chính xác.' })
  async changePassword(
    @User() user: AuthenticatedUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    this.logger.log(`Changing password for user ${user.id}`);
    if (changePasswordDto.oldPassword === changePasswordDto.newPassword) {
      throw new BadRequestException(
        'Mật khẩu mới không được trùng với mật khẩu cũ.',
      );
    }
    return this.usersService.changePassword(
      user.id,
      changePasswordDto.oldPassword,
      changePasswordDto.newPassword,
    );
  }

  /**
   * @route GET /users/admin/all
   * @description (Admin) Lấy danh sách tất cả người dùng trong hệ thống với phân trang.
   * @param {PaginationQueryDto} query - DTO chứa thông tin phân trang.
   * @returns {Promise<AccountPaginatedResponseDto>} - Một đối tượng chứa danh sách người dùng và tổng số lượng.
   */
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '(Admin) Lấy danh sách tất cả người dùng' })
  @ApiResponse({
    status: 200,
    type: AccountPaginatedResponseDto,
    description: 'Trả về danh sách người dùng.',
  })
  async GetUsers(
    @Query() query: PaginationQueryDto,
    @Query('search') search?: string,
  ): Promise<AccountPaginatedResponseDto> {
    const { page = 1, limit = 10 } = query;
    this.logger.log(
      `Fetching all users for page ${page}, limit ${limit}, search ${search}`,
    );
    return await this.usersService.findAllUser(page, limit, search);
  }

  /**
   * @route PATCH /users/admin/:id/ban
   * @description (Admin) Khóa (treo) tài khoản của một người dùng.
   * @param {string} id - ID của tài khoản cần khóa.
   * @returns {Promise<MessageResponseDto>} - Thông báo xác nhận khóa thành công.
   */
  @Patch('admin/:id/ban')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '(Admin) Khóa tài khoản người dùng' })
  @ApiResponse({
    status: 200,
    type: MessageResponseDto,
    description: 'Khóa tài khoản thành công.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tài khoản.' })
  async banUser(@Param('id') id: string): Promise<MessageResponseDto> {
    this.logger.log(`Banning user ${id}`);
    return await this.usersService.banUser(id);
  }

  /**
   * @route PATCH /users/admin/:id/unban
   * @description (Admin) Mở khóa tài khoản của một người dùng.
   * @param {string} id - ID của tài khoản cần mở khóa.
   * @returns {Promise<MessageResponseDto>} - Thông báo xác nhận mở khóa thành công.
   */
  @Patch('admin/:id/unban')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '(Admin) Mở khóa tài khoản người dùng' })
  @ApiResponse({
    status: 200,
    type: MessageResponseDto,
    description: 'Mở khóa tài khoản thành công.',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tài khoản.' })
  async unbanUser(@Param('id') id: string): Promise<MessageResponseDto> {
    this.logger.log(`Unbanning user ${id}`);
    return await this.usersService.unbanUser(id);
  }

  /**
   * @route POST /users/create-employee
   * @description Tạo tài khoản nhân viên mới (Manager hoặc Staff).
   * - Admin có thể tạo Manager hoặc Staff (tùy chọn role từ FE).
   * - Manager chỉ có thể tạo Staff.
   * Chi nhánh của nhân viên mới sẽ được tự động gán theo chi nhánh của người tạo.
   * @returns {Promise<AccountResponseDto>}
   */
  @Post('create-employee')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin, RoleEnum.Manager) // Chỉ Admin và Manager được phép
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Tạo tài khoản nhân viên (Admin có thể chọn Manager/Staff, Manager chỉ tạo Staff)',
  })
  @ApiResponse({
    status: 201,
    type: AccountResponseDto,
    description: 'Tạo nhân viên thành công.',
  })
  @ApiResponse({ status: 403, description: 'Không có quyền tạo.' })
  async createEmployee(
    @User() user: AuthenticatedUser,
    @Body() createEmployeeDto: CreateEmployeeDto,
  ): Promise<AccountResponseDto> {
    this.logger.log(
      `User ${user.id} is creating an employee with DTO: ${JSON.stringify(
        createEmployeeDto,
      )}`,
    );
    return await this.usersService.createEmployee(user.id, createEmployeeDto);
  }
}
