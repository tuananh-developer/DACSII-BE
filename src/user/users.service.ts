import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository, Like, FindOptionsRelations } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Account } from './entities/account.entity';
import { Role } from './entities/role.entity';
import { UserProfile } from './entities/users-profile.entity';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { AccountStatus } from './enum/account-status.enum';
import { AuthProvider } from './enum/auth-provider.enum';
import { Gender } from './enum/gender.enum';
import { Branch } from '@/branch/entities/branch.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ConfigService } from '@nestjs/config';
import { Address } from '@/location/entities/address.entity';
import { City } from '@/location/entities/city.entity';
import { Ward } from '@/location/entities/ward.entity';

/**
 * Kiểu dữ liệu cho việc tạo người dùng chưa xác thực.
 * Được định nghĩa riêng để code sạch sẽ hơn.
 */
type CreateUnverifiedUserDto = {
  email: string;
  passwordHash: string;
  fullName: string;
  verificationCode: string;
  expiresAt: Date;
  bio: string | null;
  gender: Gender | null;
  phoneNumber: string;
};

/**
 * Kiểu dữ liệu cho việc tạo người dùng qua OAuth.
 */
type CreateOAuthUserPayload = {
  email: string;
  fullName: string;
  provider: AuthProvider;
  avatarUrl?: string | null;
};

/**
 * Kiểu dữ liệu cho việc cập nhật tài khoản chưa xác thực,
 * bao gồm cả dữ liệu cho hồ sơ người dùng.
 */
type UpdateUnverifiedAccountPayload = Partial<Account> & {
  profile_data?: {
    full_name?: string;
    phone_number?: string;
    gender?: Gender | null;
  };
};

import { AccountResponseDto } from './dto/account-response.dto';
import { AccountPaginatedResponseDto } from './dto/account-paginated-response.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { RoleEnum } from '@/auth/enums/role.enum';

/**
 * UsersService chịu trách nhiệm xử lý logic nghiệp vụ liên quan đến người dùng,
 * bao gồm tạo, tìm kiếm, và quản lý tài khoản, hồ sơ người dùng.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  /**
   * @param accountRepository Repository để tương tác với bảng 'accounts'.
   * @param roleRepository Repository để tương tác với bảng 'roles'.
   * @param userProfileRepository Repository để tương tác với bảng 'user_profiles'.
   * @param addressRepository Repository để tương tác với bảng 'addresses'.
   */
  constructor(
    @InjectRepository(Account) private accountRepository: Repository<Account>,
    @InjectRepository(UserProfile)
    private userProfileRepository: Repository<UserProfile>,
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    @InjectRepository(Address)
    private addressRepository: Repository<Address>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * @method mapAccountToDto
   * @description Ánh xạ từ thực thể Account sang AccountResponseDto.
   */
  private mapAccountToDto(account: Account): AccountResponseDto {
    const dto = new AccountResponseDto();
    dto.id = account.id;
    dto.email = account.email;
    dto.provider = account.provider;
    dto.is_verified = account.is_verified;
    dto.last_login = account.last_login;
    dto.created_at = account.created_at;
    dto.updated_at = account.updated_at;
    dto.role = account.role;
    dto.status = account.status === AccountStatus.ACTIVE;

    if (account.userProfile) {
      dto.userProfile = this.mapProfileToDto(account.userProfile);
    }

    return dto;
  }

  /**
   * @method mapProfileToDto
   * @description Ánh xạ từ thực thể UserProfile sang UserProfileResponseDto.
   */
  private mapProfileToDto(profile: UserProfile): UserProfileResponseDto {
    const dto = new UserProfileResponseDto();
    dto.id = profile.id;
    dto.full_name = profile.full_name;
    dto.date_of_birth = profile.date_of_birth;
    dto.gender = profile.gender;
    dto.phone_number = profile.phone_number;
    dto.avatar_url = profile.avatar_url;
    dto.bio = profile.bio;
    dto.is_profile_complete = profile.is_profile_complete;
    dto.created_at = profile.created_at;
    dto.updated_at = profile.updated_at;

    if (profile.address) {
      dto.address = {
        id: profile.address.id,
        street: profile.address.street,
        latitude: profile.address.latitude
          ? Number(profile.address.latitude)
          : null,
        longitude: profile.address.longitude
          ? Number(profile.address.longitude)
          : null,
        ward_name: profile.address.ward?.name,
        city_name: profile.address.city?.name,
      };
    } else {
      dto.address = null;
    }

    return dto;
  }

  /**
   * Tìm kiếm một tài khoản dựa trên địa chỉ email.
   * @param email Email của tài khoản cần tìm.
   * @returns Promise giải quyết thành đối tượng `Account` nếu tìm thấy, ngược lại là `null`.
   */
  async findAccountByEmail(
    email: string,
    relations: FindOptionsRelations<Account>,
  ): Promise<Account | null> {
    this.logger.log(`Finding account by email: ${email}`);
    return this.accountRepository.findOne({
      where: { email },
      relations: relations,
    });
  }

  /**
   * Tạo một tài khoản người dùng mới nhưng chưa được xác thực.
   * Quá trình này bao gồm việc tạo hồ sơ người dùng (UserProfile), địa chỉ (Address, nếu có),
   * và tài khoản (Account) trong một giao dịch cơ sở dữ liệu duy nhất để đảm bảo tính toàn vẹn dữ liệu.
   * Tài khoản mới sẽ có vai trò 'User' mặc định và một mã xác thực.
   * @param data Dữ liệu cần thiết để tạo người dùng, bao gồm thông tin tài khoản, hồ sơ và địa chỉ tùy chọn.
   * @returns {Promise<Account>} Promise giải quyết thành đối tượng `Account` vừa được tạo.
   * @throws {Error} Nếu vai trò 'User' mặc định không được tìm thấy trong cơ sở dữ liệu.
   */
  async createUnverifiedUser(data: CreateUnverifiedUserDto): Promise<Account> {
    this.logger.log(`Creating unverified user for email: ${data.email}`);
    return this.accountRepository.manager.transaction(
      async (transactionalEntityManager) => {
        const userRole = await transactionalEntityManager.findOne(Role, {
          where: { name: RoleEnum.User },
        });
        if (!userRole) {
          throw new InternalServerErrorException(
            "Vai trò 'User' mặc định không tồn tại.",
          );
        }

        const newProfile = transactionalEntityManager.create(UserProfile, {
          full_name: data.fullName,
          phone_number: data.phoneNumber,
          gender: data.gender,
          bio: data.bio,
        });

        await transactionalEntityManager.save(newProfile);

        const newAccount = transactionalEntityManager.create(Account, {
          email: data.email,
          password_hash: data.passwordHash,
          verification_code: data.verificationCode,
          verification_code_expires_at: data.expiresAt,
          userProfile: newProfile,
          role: userRole,
        });

        return transactionalEntityManager.save(newAccount);
      },
    );
  }
  /**
   * Tạo một tài khoản mới cho người dùng đăng nhập qua OAuth.
   * Tài khoản này sẽ được đánh dấu là đã xác thực ngay lập tức và không có mật khẩu.
   * @param data Dữ liệu người dùng từ OAuth provider.
   * @returns {Promise<Account>} Promise giải quyết thành đối tượng `Account` vừa được tạo.
   * @throws {Error} Nếu vai trò 'user' mặc định không được tìm thấy.
   */
  async createOAuthUser(data: CreateOAuthUserPayload): Promise<Account> {
    this.logger.log(`Creating OAuth user for email: ${data.email}`);
    return this.accountRepository.manager.transaction(
      async (transactionalEntityManager) => {
        const userRole = await transactionalEntityManager.findOne(Role, {
          where: { name: RoleEnum.User },
        });
        if (!userRole) {
          throw new InternalServerErrorException(
            "Vai trò 'User' mặc định không tồn tại.",
          );
        }

        const newProfile = transactionalEntityManager.create(UserProfile, {
          full_name: data.fullName,
          avatar_url: data.avatarUrl ?? undefined,
        });
        await transactionalEntityManager.save(newProfile);

        const newAccount = transactionalEntityManager.create(Account, {
          email: data.email,
          provider: data.provider,
          is_verified: true, // Tài khoản OAuth được coi là đã xác thực
          password_hash: null,
          userProfile: newProfile,
          role: userRole,
        });

        return transactionalEntityManager.save(newAccount);
      },
    );
  }

  /**
   * Cập nhật thông tin cho một tài khoản chưa được xác thực.
   * Thường dùng để cập nhật mã xác thực mới và thời gian hết hạn.
   * SỬA ĐỔI: Hàm này giờ đây chạy trong một transaction để cập nhật cả Account và UserProfile,
   * giải quyết vấn đề số điện thoại bị "kẹt" khi người dùng đăng ký lại.
   * @param id ID của tài khoản cần cập nhật.
   * @param data Dữ liệu cần cập nhật, có thể bao gồm cả `profile_data`.
   */
  async updateUnverifiedAccount(
    id: string,
    data: UpdateUnverifiedAccountPayload,
  ): Promise<void> {
    this.logger.log(`Updating unverified account for id: ${id}`);
    const { profile_data, ...accountData } = data;

    await this.accountRepository.manager.transaction(
      async (transactionalEntityManager) => {
        // Nếu có profile_data, tìm và cập nhật UserProfile
        if (profile_data) {
          const account = await transactionalEntityManager.findOne(Account, {
            where: { id },
            relations: { userProfile: true },
          });
          if (account && account.userProfile) {
            await transactionalEntityManager.update(
              UserProfile,
              account.userProfile.id,
              profile_data,
            );
          }
        }
        // Cập nhật Account
        await transactionalEntityManager.update(Account, id, accountData);
      },
    );
  }

  /**
   * Xác thực một tài khoản.
   * Cập nhật trạng thái `is_verified` thành `true` và xóa thông tin mã xác thực.
   * @param id ID của tài khoản cần xác thực.
   */
  async verifyAccount(id: string): Promise<void> {
    this.logger.log(`Verifying account for id: ${id}`);
    await this.accountRepository.update(id, {
      is_verified: true,
      verification_code: null,
      verification_code_expires_at: null,
    });
  }

  /**
   * Băm mật khẩu bằng bcrypt.
   * @param password Mật khẩu ở dạng chuỗi thuần.
   * @returns Promise giải quyết thành chuỗi mật khẩu đã được băm.
   */
  async hashPassword(password: string): Promise<string> {
    this.logger.debug(`Hashing a password.`);
    const salt = await bcrypt.genSalt();
    return bcrypt.hash(password, salt);
  }

  /**
   * So sánh một mật khẩu thuần với một chuỗi đã được băm.
   * @param password Mật khẩu ở dạng chuỗi thuần cần so sánh.
   * @param hash Chuỗi đã được băm để so sánh.
   * @returns Promise giải quyết thành `true` nếu mật khẩu khớp, ngược lại là `false`.
   */
  comparePassword(password: string, hash: string): Promise<boolean> {
    this.logger.debug(`Comparing a password with a hash.`);
    return bcrypt.compare(password, hash);
  }

  /**
   * Tìm hồ sơ người dùng (UserProfile) dựa trên ID của tài khoản (Account).
   * @param accountId ID của tài khoản liên quan.
   * @returns Promise giải quyết thành đối tượng `UserProfile` nếu tìm thấy, ngược lại là `null`.
   */
  async findProfileByAccountId(
    accountId: string,
    relations: FindOptionsRelations<UserProfile> = {},
  ): Promise<UserProfile | null> {
    this.logger.log(`Finding profile by account id: ${accountId}`);
    return this.userProfileRepository.findOne({
      where: { account: { id: accountId } },
      relations: { ...relations },
    });
  }
  /**
   * Tìm một tài khoản bằng ID của nó.
   * @param id ID của tài khoản cần tìm.
   * @returns Promise giải quyết thành đối tượng `AccountResponseDto` nếu tìm thấy, ngược lại là `null`.
   */
  async findAccountById(
    id: string,
    relations: FindOptionsRelations<Account> = {},
  ): Promise<AccountResponseDto | null> {
    this.logger.log(`Finding account by id: ${id}`);
    if (!id) {
      throw new NotFoundException('ID người dùng không hợp lệ.');
    }
    const account = await this.accountRepository.findOne({
      where: { id },
      relations,
    });
    return account ? this.mapAccountToDto(account) : null;
  }

  /**
   * Cập nhật thông tin của một tài khoản.
   * @param id ID của tài khoản cần cập nhật.
   * @param data Dữ liệu cần cập nhật (một phần của đối tượng Account).
   * @returns {Promise<void>}
   */
  async updateAccount(id: string, data: Partial<Account>) {
    this.logger.log(`Updating account for id: ${id}`);
    await this.accountRepository.update(id, data);
  }

  /**
   * @method updateProfile
   * SỬA ĐỔI: Cập nhật các thông tin hồ sơ cơ bản của người dùng (không bao gồm địa chỉ)
   * và đánh dấu hồ sơ là đã hoàn thành.
   * @param accountId ID của tài khoản người dùng (lấy từ token).
   * @param data Dữ liệu hồ sơ cần cập nhật từ DTO.
   * @returns Một thông báo thành công.
   */
  async updateProfile(
    accountId: string,
    data: UpdateUserProfileDto,
  ): Promise<{ message: string }> {
    this.logger.log(
      `Updating profile for account id: ${accountId} with data: ${JSON.stringify(
        data,
      )}`,
    );
    // 1. Tìm tài khoản và userProfile liên quan
    const account = await this.accountRepository.findOne({
      where: { id: accountId },
      relations: { userProfile: { address: true } },
    });

    if (!account || !account.userProfile) {
      throw new NotFoundException('Không tìm thấy hồ sơ người dùng.');
    }

    const userProfile = account.userProfile;

    // 2. Cập nhật các trường một cách tường minh thay vì dùng spread operator
    if (data.full_name) {
      userProfile.full_name = data.full_name;
    }
    if (data.phone_number) {
      userProfile.phone_number = data.phone_number;
    }
    if (data.gender) {
      userProfile.gender = data.gender as Gender;
    }
    if (data.date_of_birth) {
      // Chuyển đổi ngày sinh từ DTO thành đối tượng Date để so sánh
      const dob = new Date(data.date_of_birth);
      const today = new Date();
      // So sánh ngày mà không tính đến thời gian trong ngày
      dob.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      if (dob > today) {
        this.logger.warn(
          `Invalid date of birth provided for account ${accountId}: ${data.date_of_birth.toISOString()} is in the future.`,
        );
        throw new BadRequestException(
          'Ngày sinh không được lớn hơn ngày hiện tại.',
        );
      }
      userProfile.date_of_birth = data.date_of_birth;
    }
    if (data.bio) {
      userProfile.bio = data.bio;
    }

    // Cập nhật địa chỉ nếu có
    if (data.address) {
      if (!userProfile.address) {
        userProfile.address = this.addressRepository.create({
          street: data.address.street,
          city: { id: data.address.cityId } as City,
          ward: { id: data.address.wardId } as Ward,
        });
      } else {
        userProfile.address.street = data.address.street;
        userProfile.address.city = { id: data.address.cityId } as City;
        userProfile.address.ward = { id: data.address.wardId } as Ward;
      }
    }

    // 3. Quan trọng: Đánh dấu hồ sơ đã hoàn thành
    userProfile.is_profile_complete = true;

    // 4. Lưu lại các thay đổi vào UserProfile
    await this.userProfileRepository.save(userProfile);

    return { message: 'Cập nhật hồ sơ thành công.' };
  }

  /**
   * Băm một token (dùng cho việc tìm kiếm sau này, nhưng tên hàm có thể gây nhầm lẫn).
   * @param token Token thuần cần được băm.
   * @returns Promise giải quyết thành chuỗi token đã được băm.
   */
  async findAccountByHashedResetToken(token: string): Promise<string> {
    this.logger.debug(
      `Hashing a password reset token. Note: This function only hashes, it does not find.`,
    );
    const hashedToken = await bcrypt.hash(token, 10);
    return hashedToken;
  }

  /**
   * Tìm tài khoản bằng token đặt lại mật khẩu còn hiệu lực.
   * @param token Token thuần nhận được từ client.
   */
  async findAccountByValidResetToken(token: string): Promise<Account | null> {
    this.logger.log('Finding account by valid reset token');
    return this.accountRepository.findOne({
      where: {
        password_reset_token: token, // So sánh token thuần
        password_reset_expires: MoreThan(new Date()), // Đảm bảo chưa hết hạn
      },
    });
  }

  /**
   * Cập nhật thời gian đăng nhập cuối cùng cho một tài khoản.
   * @param accountId ID của tài khoản vừa đăng nhập thành công.
   */
  async updateLastLogin(accountId: string): Promise<void> {
    this.logger.log(`Updating last login for account id: ${accountId}`);
    await this.accountRepository.update(accountId, {
      last_login: new Date(),
    });
  }

  /**
   * Tìm branch mà một UserProfile đang quản lý (dành cho branch_manager).
   * @param userProfileId ID của UserProfile (manager_id trong Branch).
   * @returns Promise giải quyết thành Branch hoặc null nếu không tìm thấy.
   */
  async findBranchByManagerProfileId(
    userProfileId: string,
  ): Promise<Branch | null> {
    this.logger.log(`Finding branch for manager profile id: ${userProfileId}`);
    return this.branchRepository.findOne({
      where: { manager_id: userProfileId },
    });
  }

  /**
   * Lấy danh sách tất cả người dùng với phân trang.
   * @param page Số trang hiện tại.
   * @param limit Số lượng kết quả trên mỗi trang.
   * @param search Từ khóa tìm kiếm theo tên.
   * @returns Promise giải quyết thành một AccountPaginatedResponseDto.
   */
  async findAllUser(
    page: number,
    limit: number,
    search?: string,
  ): Promise<AccountPaginatedResponseDto> {
    this.logger.log(
      `Finding all users for page: ${page}, limit: ${limit}, search: ${search}`,
    );

    const whereCondition = search
      ? { userProfile: { full_name: Like(`%${search}%`) } }
      : {};

    const [user, total] = await this.accountRepository.findAndCount({
      where: whereCondition,
      relations: {
        role: true,
        userProfile: {
          branch: true,
          address: {
            city: true,
            ward: true,
          },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });

    const response = new AccountPaginatedResponseDto();
    response.data = user.map((u) => this.mapAccountToDto(u));
    response.total = total;
    return response;
  }

  /**
   * Khóa (treo) tài khoản của một người dùng.
   * @param id ID của tài khoản cần khóa.
   * @returns Promise giải quyết thành một đối tượng chứa thông báo thành công.
   */
  async banUser(id: string): Promise<{ message: string }> {
    this.logger.log(`Banning user with id: ${id}`);
    await this.accountRepository.update(id, {
      status: AccountStatus.SUSPENDED,
    });

    return { message: 'Đã khóa tài khoản thành công' };
  }

  /**
   * Mở khóa (unban) tài khoản của một người dùng.
   * @param id ID của tài khoản cần mở khóa.
   * @returns Promise giải quyết thành một đối tượng chứa thông báo thành công.
   */
  async unbanUser(id: string): Promise<{ message: string }> {
    this.logger.log(`Unbanning user with id: ${id}`);
    const account = await this.accountRepository.findOneBy({ id });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }
    await this.accountRepository.update(id, {
      status: AccountStatus.ACTIVE,
    });

    return { message: 'Đã mở khóa tài khoản thành công' };
  }

  async findProfileByPhoneNumber(phone: string): Promise<UserProfile | null> {
    this.logger.log(`Finding profile by phone number: ${phone}`);
    return this.userProfileRepository.findOne({
      where: {
        phone_number: phone,
      },
      relations: { account: true }, // Tải kèm thông tin tài khoản để kiểm tra
    });
  }

  /**
   * @method updateAvatar
   * Cập nhật đường dẫn ảnh đại diện cho người dùng.
   * @param accountId ID của tài khoản người dùng.
   * @param avatarFilename Tên file ảnh đã được lưu trên server.
   * @returns Hồ sơ người dùng sau khi cập nhật (UserProfileResponseDto).
   */
  async updateAvatar(
    accountId: string,
    avatarFilename: string,
  ): Promise<UserProfileResponseDto> {
    this.logger.log(`Updating avatar for account id: ${accountId}`);
    if (!avatarFilename) {
      throw new Error('Thiếu tên file');
    }
    const account = await this.accountRepository.findOne({
      where: { id: accountId },
      relations: {
        userProfile: { address: { city: true, ward: true } },
      },
    });

    if (!account || !account.userProfile) {
      throw new NotFoundException('Không tìm thấy hồ sơ người dùng.');
    }
    const baseUrl = this.configService.get<string>('BASE_URL');
    account.userProfile.avatar_url = `${baseUrl}/uploads/${avatarFilename}`;

    const savedProfile = await this.userProfileRepository.save(
      account.userProfile,
    );
    return this.mapProfileToDto(savedProfile);
  }

  /**
   * @method changePassword
   * @description Thay đổi mật khẩu cho người dùng đã đăng nhập.
   * @param accountId ID của tài khoản người dùng.
   * @param oldPassword Mật khẩu cũ để xác thực.
   * @param newPassword Mật khẩu mới.
   * @returns Một thông báo thành công.
   * @throws {NotFoundException} Nếu không tìm thấy tài khoản.
   * @throws {BadRequestException} Nếu tài khoản là tài khoản OAuth hoặc mật khẩu mới trùng mật khẩu cũ.
   * @throws {UnauthorizedException} Nếu mật khẩu cũ không đúng.
   */
  async changePassword(
    accountId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    this.logger.log(`Changing password for account id: ${accountId}`);
    const account = await this.accountRepository.findOneBy({ id: accountId });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }

    if (!account.password_hash) {
      throw new BadRequestException(
        'Tài khoản đăng nhập bằng mạng xã hội không thể đổi mật khẩu.',
      );
    }

    const isPasswordMatching = await this.comparePassword(
      oldPassword,
      account.password_hash,
    );
    if (!isPasswordMatching) {
      throw new UnauthorizedException('Mật khẩu cũ không chính xác.');
    }
    account.password_hash = await this.hashPassword(newPassword);
    await this.accountRepository.save(account);
    return { message: 'Đổi mật khẩu thành công.' };
  }

  /**
   * Tìm một hồ sơ người dùng đã được xác thực bằng số điện thoại.
   * @param phone Số điện thoại cần tìm.
   * @returns Promise giải quyết thành đối tượng `UserProfile` nếu tìm thấy, ngược lại là `null`.
   */
  async findVerifiedProfileByPhoneNumber(
    phone: string,
  ): Promise<UserProfile | null> {
    this.logger.log(`Finding verified profile by phone number: ${phone}`);
    return this.userProfileRepository.findOne({
      where: {
        phone_number: phone,
        account: { is_verified: true }, // Chỉ tìm các tài khoản đã xác thực
      },
      relations: { account: true }, // Tải kèm thông tin tài khoản để kiểm tra
    });
  }

  /**
   * Tạo tài khoản nhân viên (Staff hoặc Branch Manager).
   * - Nếu Admin gọi: Tạo Branch Manager (yêu cầu branchId).
   * - Nếu Manager gọi: Tạo Staff (tự động lấy branchId của Manager).
   */
  async createEmployee(
    requesterId: string,
    data: CreateEmployeeDto,
  ): Promise<AccountResponseDto> {
    this.logger.log(
      `Creating employee with requester id: ${requesterId} and data: ${JSON.stringify(
        data,
      )}`,
    );
    // 1. Lấy thông tin người đang thực hiện request (kèm Role và Branch)
    const requester = await this.accountRepository.findOne({
      where: { id: requesterId },
      relations: {
        role: true,
        userProfile: { branch: true },
      },
    });

    if (!requester) {
      throw new NotFoundException('Người thực hiện không tồn tại.');
    }

    const requesterRoleName = requester.role.name;
    const targetRoleName = data.role; // Lấy role từ DTO

    // 2. Phân quyền: kiểm tra người tạo có quyền tạo vai trò này không
    if (requesterRoleName === String(RoleEnum.Admin)) {
      // Admin có thể tạo cả Manager và Staff
      if (
        targetRoleName !== RoleEnum.Manager &&
        targetRoleName !== RoleEnum.Staff
      ) {
        this.logger.warn(
          `Admin ${requesterId} tried to create an employee with invalid role ${targetRoleName as string}.`,
        );
        throw new ForbiddenException(
          'Admin chỉ có thể tạo tài khoản Manager hoặc Staff.',
        );
      }
    } else if (requesterRoleName === String(RoleEnum.Manager)) {
      // Manager chỉ có thể tạo Staff
      if (targetRoleName !== RoleEnum.Staff) {
        this.logger.warn(
          `Manager ${requesterId} tried to create an employee with role ${targetRoleName as string}, but only 'staff' is allowed.`,
        );
        throw new ForbiddenException('Manager chỉ có thể tạo tài khoản Staff.');
      }
      if (!requester.userProfile?.branch?.id) {
        this.logger.error(
          `Manager ${requesterId} has no branch assigned and cannot create staff.`,
        );
        throw new ForbiddenException(
          'Tài khoản của bạn phải được gán vào một chi nhánh để thực hiện hành động này.',
        );
      }
    } else {
      this.logger.warn(
        `User ${requesterId} with role ${requesterRoleName} attempted to create an employee.`,
      );
      throw new ForbiddenException(
        'Bạn không có quyền tạo tài khoản nhân viên.',
      );
    }

    // 3. Kiểm tra Email đã tồn tại chưa
    const existingUser = await this.accountRepository.findOneBy({
      email: data.email,
    });
    if (existingUser) {
      throw new ConflictException('Email đã được sử dụng.');
    }

    // 4. Kiểm tra số điện thoại
    if (data.phoneNumber) {
      const existingPhone = await this.userProfileRepository.findOneBy({
        phone_number: data.phoneNumber,
      });
      if (existingPhone) {
        throw new ConflictException('Số điện thoại đã được sử dụng.');
      }
    }

    // 5. Hash mật khẩu
    const hashedPassword = await this.hashPassword(data.password);

    // 6. Thực hiện Transaction lưu DB
    const savedAccount = await this.accountRepository.manager.transaction(
      async (manager) => {
        // 6.1 Lấy Role từ DB (để đảm bảo vai trò tồn tại)
        const targetRoleEntity = await manager.findOne(Role, {
          where: { name: targetRoleName },
        });
        if (!targetRoleEntity)
          throw new NotFoundException(
            `Vai trò '${String(targetRoleName)}' không tồn tại.`,
          );

        // Logic lấy Branch ID
        const targetBranchId =
          requesterRoleName === String(RoleEnum.Admin)
            ? data.branchId
            : requester.userProfile?.branch?.id;

        if (!targetBranchId) {
          throw new BadRequestException(
            'Không xác định được chi nhánh làm việc.',
          );
        }

        // 6.2 Lấy Branch từ DB
        const branch = await manager.findOne(Branch, {
          where: { id: targetBranchId },
        });
        if (!branch) throw new NotFoundException('Chi nhánh không tồn tại.');

        // 6.3 Tạo UserProfile
        const newProfile = manager.create(UserProfile, {
          full_name: data.fullName,
          phone_number: data.phoneNumber,
          gender: data.gender || null,
          bio: data.bio || null,
          is_profile_complete: true, // Nhân viên thì coi như profile đã xong
          branch: branch, // Gán quan hệ Branch vào đây (Quan trọng!)
        });
        await manager.save(newProfile);

        // 6.4 Tạo Account
        const newAccount = manager.create(Account, {
          email: data.email,
          password_hash: hashedPassword,
          is_verified: true, // Tài khoản nội bộ được xác thực luôn
          status: AccountStatus.ACTIVE,
          userProfile: newProfile,
          role: targetRoleEntity, // Gán thực thể Role
        });

        const savedAccountEntity = await manager.save(newAccount);

        // (Tùy chọn) Nếu tạo Manager, cập nhật lại bảng Branch để set người này làm manager_id
        if (targetRoleName === RoleEnum.Manager) {
          // Lưu ý: Logic này sẽ ghi đè manager cũ nếu có
          await manager.update(Branch, targetBranchId, {
            manager_id: newProfile.id,
          });
        }

        return savedAccountEntity;
      },
    );

    // Reload to get relations for mapping
    const reloadedAccount = await this.accountRepository.findOne({
      where: { id: savedAccount.id },
      relations: {
        role: true,
        userProfile: {
          branch: true,
          address: {
            city: true,
            ward: true,
          },
        },
      },
    });

    return this.mapAccountToDto(reloadedAccount!);
  }
}
