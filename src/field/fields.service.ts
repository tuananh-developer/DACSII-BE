import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Field } from './entities/field.entity';
import { CreateFieldDto } from './dto/create-fields.dto';
import { UpdateFieldDto } from './dto/update-fields.dto';
import { FieldType } from './entities/field-types.entity';
import { TimeSlot } from '../pricing/entities/time-slot.entity';
import { FilterFieldDto } from './dto/filter-field.dto';
import { FieldImage } from './entities/field-image.entity';
import { ConfigService } from '@nestjs/config';
import { Branch } from '@/branch/entities/branch.entity';
import { UserProfile } from '../user/entities/users-profile.entity';
import { RoleEnum } from '@/auth/enums/role.enum';
import { Utility } from '../utility/entities/utility.entity';
import { v4 as uuidv4 } from 'uuid';
import { FieldRawResult } from '../auth/interface/FieldRawResult.interface';
import * as geoip from 'geoip-lite';

import { FieldDto } from './dto/field.dto';
import { FieldTypeDto } from './dto/field-type.dto';
import { FieldImageDto } from './dto/field-image.dto';
import { FieldsResponseDto } from './dto/fields-response.dto';
import { City } from '@/location/entities/city.entity';

/**
 * @class FieldsService
 * @description Service xử lý logic nghiệp vụ liên quan đến sân bóng.
 */
@Injectable()
export class FieldsService {
  private readonly logger = new Logger(FieldsService.name);

  constructor(
    @InjectRepository(Field)
    private readonly fieldRepository: Repository<Field>,
    @InjectRepository(FieldImage)
    private readonly fieldImageRepository: Repository<FieldImage>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Utility)
    private readonly utilityRepository: Repository<Utility>,
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
    @InjectRepository(TimeSlot)
    private readonly timeSlotRepository: Repository<TimeSlot>,
    private readonly configService: ConfigService,
  ) { }

  /**
   * @method mapToDto
   * @description Ánh xạ từ thực thể Field sang FieldDto.
   */
  private mapToDto(field: Field): FieldDto {
    const dto = new FieldDto();
    dto.id = field.id;
    dto.name = field.name;
    dto.description = field.description;
    dto.status = field.status;
    dto.createdAt = field.createdAt;
    dto.updatedAt = field.updatedAt;
    dto.averageRating = field.averageRating;
    dto.reviewCount = field.reviewCount;
    dto.distance = field.distance

    if (field.fieldType) {
      dto.fieldType = this.mapTypeToDto(field.fieldType);
    }

    if (field.branch) {
      const branch = field.branch;
      dto.branch = {
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
    if (field.images) {
      dto.images = field.images.map(img => this.mapImageToDto(img));
    } else {
      dto.images = [];
    }

    dto.utilities = field.utilities || [];

    return dto;
  }

  private mapTypeToDto(type: FieldType): FieldTypeDto {
    const dto = new FieldTypeDto();
    dto.id = type.id;
    dto.name = type.name;
    dto.description = type.description;
    return dto;
  }

  private mapImageToDto(img: FieldImage): FieldImageDto {
    const dto = new FieldImageDto();
    dto.id = img.id;
    dto.image_url = img.image_url;
    dto.isCover = img.isCover;
    return dto;
  }

  async create(
    createFieldDto: CreateFieldDto,
    userProfile: UserProfile,
  ): Promise<FieldDto> {
    this.logger.log(
      `User ${userProfile.id} is creating a new field with DTO: ${JSON.stringify(
        createFieldDto,
      )}`,
    );

    const { fieldTypeId, utilityIds, branchId, ...fieldData } = createFieldDto;
    const isAdmin = userProfile.account.role.name === String(RoleEnum.Admin);

    let branch: Branch | null;

    if (isAdmin) {
      if (!branchId) {
        throw new BadRequestException(
          'Admin phải cung cấp ID chi nhánh (branchId).',
        );
      }
      branch = await this.branchRepository.findOneBy({ id: branchId });
      if (!branch) {
        throw new NotFoundException(
          `Chi nhánh với ID ${branchId} không tồn tại.`,
        );
      }
    } else {
      branch = userProfile.branch;
      if (!branch) {
        this.logger.error(
          `Manager ${userProfile.id} is not associated with any branch.`,
        );
        throw new ForbiddenException(
          'Tài khoản Quản lý của bạn phải được gán vào một chi nhánh để có thể tạo sân bóng.',
        );
      }

      const isManagerOfBranch = branch.manager_id === userProfile.id;
      if (!isManagerOfBranch) {
        this.logger.error(
          `User ${userProfile.id} (Role: ${userProfile.account.role.name}) does not have permission to add a field to branch ${branch.id}`,
        );
        throw new ForbiddenException(
          'Bạn không phải là quản lý của chi nhánh này để thêm sân.',
        );
      }
    }

    const newField = this.fieldRepository.create({
      ...fieldData,
      branch: branch,
      fieldType: { id: fieldTypeId } as FieldType,
    });

    if (utilityIds && utilityIds.length > 0) {
      const utilities = await this.utilityRepository.findBy({
        id: In(utilityIds),
      });
      if (utilities.length !== utilityIds.length) {
        throw new BadRequestException(
          'Một hoặc nhiều ID tiện ích không hợp lệ.',
        );
      }
      newField.utilities = utilities;
    }

    const savedField = await this.fieldRepository.save(newField);
    this.logger.log(
      `Field ${savedField.id} created successfully in branch ${branch.id}`,
    );

    return this.findOne(savedField.id);
  }

  /**
   * @method findAll
   * @description Lấy danh sách sân bóng kèm bộ lọc, phân trang và tính khoảng cách.
   * Ưu tiên: GPS > IP Geolocation/City > Global Hot.
   */
  async findAll(filterDto: FilterFieldDto, ip?: string | null): Promise<FieldsResponseDto> {
    const {
      name,
      cityId,
      fieldTypeId,
      branchId,
      radius = 10,
      page = 1,
      limit = 10,
    } = filterDto;

    let { latitude, longitude } = filterDto;
    let locationSource = 'none';

    // 1. Nếu không có GPS, thử đoán vị trí qua IP
    if (!latitude && !longitude && ip && ip !== '::1' && ip !== '127.0.0.1') {
      const geo = geoip.lookup(ip);
      if (geo) {
        [latitude, longitude] = geo.ll;
        locationSource = 'ip';
        this.logger.log(`Guessed location from IP ${ip}: ${latitude}, ${longitude}`);
      }
    }

    this.logger.log(
      `Finding all fields with filter: ${JSON.stringify(filterDto)} (Location source: ${locationSource})`,
    );

    const skip = (page - 1) * limit;

    // Công thức Haversine để tính khoảng cách
    const distanceSql = `(6371 * acos(
      cos(radians(:userLat))
      * cos(radians(address.latitude))
      * cos(radians(address.longitude) - radians(:userLong))
      + sin(radians(:userLat))
      * sin(radians(address.latitude))
    ))`;

    const createBaseQuery = () => {
      return this.fieldRepository
        .createQueryBuilder('field')
        .leftJoinAndSelect('field.fieldType', 'fieldType')
        .leftJoinAndSelect('field.images', 'images')
        .leftJoinAndSelect('field.branch', 'branch')
        .leftJoinAndSelect('branch.address', 'address')
        .leftJoinAndSelect('address.ward', 'ward')
        .leftJoinAndSelect('address.city', 'city')
        .addSelect(
          (subQuery) =>
            subQuery
              .select('COALESCE(AVG(r.rating), 0)', 'avg')
              .from('reviews', 'r')
              .where('r.field_id = field.id'),
          'field_averageRating',
        )
        .addSelect(
          (subQuery) =>
            subQuery
              .select('COUNT(r.id)', 'count')
              .from('reviews', 'r')
              .where('r.field_id = field.id'),
          'field_reviewCount',
        );
    };

    const query = createBaseQuery();

    if (branchId) query.andWhere('branch.id = :branchId', { branchId });
    if (name) query.andWhere('field.name LIKE :name', { name: `%${name}%` });
    if (fieldTypeId)
      query.andWhere('fieldType.id = :fieldTypeId', { fieldTypeId });

    if (cityId) {
      query.andWhere('city.id = :cityId', { cityId });
    }

    if (latitude && longitude) {
      query
        .addSelect(distanceSql, 'distance')
        .setParameters({ userLat: latitude, userLong: longitude, radius });

      if (locationSource === 'none' || locationSource === 'gps') {
        query.andWhere(`${distanceSql} <= :radius`).orderBy('distance', 'ASC');
      } else {
        query.orderBy('distance', 'ASC').addOrderBy('field_averageRating', 'DESC');
      }
    } else {
      query.orderBy('field.createdAt', 'DESC');
    }

    query.take(limit).skip(skip);

    let { entities, raw } = await query.getRawAndEntities<FieldRawResult>();
    const total = await query.getCount();

    let isSuggestion = false;
    let suggestMessage: string | null = null;
    let finalTotal = total;

    if (total === 0) {
      isSuggestion = true;
      const suggestionQuery = createBaseQuery();

      if (latitude && longitude) {
        this.logger.log('Không tìm thấy sân gần, đang lấy gợi ý sân HOT...');
        suggestionQuery
          .addSelect(distanceSql, 'distance')
          .setParameters({ userLat: latitude, userLong: longitude })
          .orderBy('field_averageRating', 'DESC')
          .take(5);

        const fallback = await suggestionQuery.getRawAndEntities<FieldRawResult>();
        entities = fallback.entities;
        raw = fallback.raw;

        const cityName = entities[0]?.branch?.address?.city?.name;
        suggestMessage = cityName
          ? `Khu vực bạn chọn hiện chưa có sân. Dưới đây là các sân HOT tại ${cityName}!`
          : 'Khu vực bạn chọn hiện chưa có sân. Dưới đây là các sân HOT nhất hệ thống!';
      } else {
        suggestionQuery.orderBy('field_averageRating', 'DESC').take(5);
        const fallback = await suggestionQuery.getRawAndEntities<FieldRawResult>();
        entities = fallback.entities;
        raw = fallback.raw;
        suggestMessage = 'Hiện chưa có sân phù hợp bộ lọc. Gợi ý các sân HOT nhất dành cho bạn!';
      }
      finalTotal = entities.length;
    }

    const fields = entities.map((entity) => {
      const rawItem = raw.find((r) => r.field_id === entity.id);
      if (rawItem) {
        entity.averageRating = rawItem.field_averageRating
          ? parseFloat(parseFloat(rawItem.field_averageRating).toFixed(1))
          : 0;
        entity.reviewCount = rawItem.field_reviewCount
          ? parseInt(rawItem.field_reviewCount)
          : 0;

        if (rawItem.distance) {
          entity.distance = parseFloat(parseFloat(rawItem.distance).toFixed(2));
        }
      }
      return this.mapToDto(entity);
    });

    return {
      data: fields,
      metadata: {
        total: finalTotal,
        page: Number(page),
        limit: Number(limit),
        lastPage: Math.ceil(finalTotal / limit) || 1,
        isSuggestion,
        suggestionMessage: suggestMessage,
      },
    };
  }

  async findOne(
    id: string,
    latitude?: number,
    longitude?: number,
    ip?: string | null,
  ): Promise<FieldDto> {
    let locationSource = 'none';

    // 1. Nếu không có GPS, thử đoán vị trí qua IP
    if (!latitude && !longitude && ip && ip !== '::1' && ip !== '127.0.0.1') {
      const geo = geoip.lookup(ip);
      if (geo) {
        [latitude, longitude] = geo.ll;
        locationSource = 'ip';
      }
    }

    this.logger.log(
      `Finding field with ID: ${id} (lat: ${latitude}, long: ${longitude}, source: ${locationSource})`,
    );
    const query = this.fieldRepository.createQueryBuilder('field');

    // Công thức Haversine để tính khoảng cách
    const distanceSql = `(6371 * acos(
      cos(radians(:userLat))
      * cos(radians(address.latitude))
      * cos(radians(address.longitude) - radians(:userLong))
      + sin(radians(:userLat))
      * sin(radians(address.latitude))
    ))`;

    query
      .leftJoinAndSelect('field.fieldType', 'fieldType')
      .leftJoinAndSelect('field.images', 'images')
      .leftJoinAndSelect('field.utilities', 'utilities')
      .leftJoinAndSelect('field.branch', 'branch')
      .leftJoinAndSelect('branch.address', 'address')
      .leftJoinAndSelect('address.ward', 'ward')
      .leftJoinAndSelect('address.city', 'city')
      .leftJoinAndSelect('branch.manager', 'manager')
      .leftJoinAndSelect('field.reviews', 'reviews')
      .leftJoinAndSelect('reviews.userProfile', 'userProfile')
      .addSelect(
        (subQuery) =>
          subQuery
            .select('COALESCE(AVG(r.rating), 0)', 'avg')
            .from('reviews', 'r')
            .where('r.field_id = field.id'),
        'field_averageRating',
      )
      .addSelect(
        (subQuery) =>
          subQuery
            .select('COUNT(r.id)', 'count')
            .from('reviews', 'r')
            .where('r.field_id = field.id'),
        'field_reviewCount',
      );

    if (latitude && longitude) {
      query
        .addSelect(distanceSql, 'distance')
        .setParameters({ userLat: latitude, userLong: longitude });
    }

    query.where('field.id = :id', { id });

    const { entities, raw } = await query.getRawAndEntities<FieldRawResult>();
    const field = entities[0];

    if (!field) {
      this.logger.error(`Field with ID ${id} not found`);
      throw new NotFoundException(`Sân bóng ID ${id} không tồn tại`);
    }

    const rawItem = raw.find((r) => r.field_id === field.id);
    if (rawItem) {
      field.averageRating = rawItem.field_averageRating
        ? parseFloat(parseFloat(rawItem.field_averageRating).toFixed(1))
        : 0;
      field.reviewCount = rawItem.field_reviewCount
        ? parseInt(rawItem.field_reviewCount)
        : 0;

      if (rawItem.distance) {
        field.distance = parseFloat(parseFloat(rawItem.distance).toFixed(2));
      }
    }

    return this.mapToDto(field);
  }

  async update(
    id: string,
    updateFieldDto: UpdateFieldDto,
    userProfile: UserProfile,
  ): Promise<FieldDto> {
    this.logger.log(
      `User ${userProfile.id} updating field ${id} with DTO: ${JSON.stringify(
        updateFieldDto,
      )}`,
    );
    const field = await this.fieldRepository.findOne({
      where: { id },
      relations: { 
        branch: true,
         utilities: true 
        },
    });

    if (!field) {
      throw new NotFoundException(`Sân bóng ID ${id} không tồn tại`);
    }

    const isAdmin = userProfile.account.role.name === String(RoleEnum.Admin);
    if (!isAdmin) {
      if (!field.branch || field.branch.manager_id !== userProfile.id) {
        throw new ForbiddenException(
          'Bạn không có quyền cập nhật sân bóng này.',
        );
      }
    }

    const { branchId, fieldTypeId, utilityIds, ...fieldData } = updateFieldDto;

    if (!isAdmin && branchId && branchId !== field.branch.id) {
      throw new ForbiddenException('Quản lý không được phép thay đổi chi nhánh của sân.');
    }

    this.fieldRepository.merge(field, fieldData);

    if (fieldTypeId) {
      field.fieldType = { id: fieldTypeId } as FieldType;
    }

    if (branchId && isAdmin) {
      const branch: Branch | null = await this.branchRepository.findOneBy({
        id: branchId,
      });
      if (!branch) {
        this.logger.error(`Branch with ID ${branchId} not found`);
        throw new BadRequestException('Chi nhánh mới không tồn tại');
      }
      field.branch = branch;
    }

    if (utilityIds !== undefined) {
      if (utilityIds.length === 0) {
        field.utilities = [];
      } else {
        const utilities = await this.utilityRepository.findBy({
          id: In(utilityIds),
        });
        if (utilities.length !== utilityIds.length) {
          throw new BadRequestException(
            'Một hoặc nhiều ID tiện ích không hợp lệ.',
          );
        }
        field.utilities = utilities;
      }
    }

    await this.fieldRepository.save(field);
    this.logger.log(`Field ${id} updated successfully`);
    return this.findOne(id);
  }

  async remove(
    id: string,
    userProfile: UserProfile,
  ): Promise<{ message: string }> {
    this.logger.log(`User ${userProfile.id} removing field with ID: ${id}`);
    const field = await this.fieldRepository.findOne({
      where: { id },
      relations: { branch: true },
    });

    if (!field) {
      throw new NotFoundException(`Sân bóng ID ${id} không tồn tại`);
    }

    const isAdmin = userProfile.account.role.name === String(RoleEnum.Admin);
    if (!isAdmin) {
      if (!field.branch || field.branch.manager_id !== userProfile.id) {
        throw new ForbiddenException('Bạn không có quyền xóa sân bóng này.');
      }
    }

    const result = await this.fieldRepository.softDelete(id);
    if (result.affected === 0) {
      // This case should theoretically not be reached if findOne succeeds
      throw new NotFoundException(`Sân bóng ID ${id} không tồn tại`);
    }
    this.logger.log(`Field ${id} removed successfully by user ${userProfile.id}`);
    return { message: 'Đã xóa sân bóng thành công' };
  }

  async addImagesToField(
    fieldId: string,
    files: Array<Express.Multer.File>,
    userProfile: UserProfile,
  ): Promise<FieldImage[]> {
    this.logger.log(
      `User ${userProfile.id} adding ${files.length} images to field ${fieldId}`,
    );
    const field = await this.fieldRepository.findOne({
      where: { id: fieldId },
      relations: { branch: true },
    });
    if (!field) {
      this.logger.error(`Field with ID ${fieldId} not found for image upload`);
      throw new NotFoundException(`Sân bóng không tồn tại`);
    }

    const isAdmin = userProfile.account.role.name === String(RoleEnum.Admin);
    if (!isAdmin) {
      if (!field.branch || field.branch.manager_id !== userProfile.id) {
        throw new ForbiddenException(
          'Bạn không có quyền thêm ảnh cho sân bóng này.',
        );
      }
    }

    const baseUrl = this.configService.get<string>('BASE_URL');

    const images = files.map((file) =>
      this.fieldImageRepository.create({
        id: uuidv4(),
        image_url: `${baseUrl}/uploads/${file.filename}`,
        field: field,
      }),
    );

    const savedImages = await this.fieldImageRepository.save(images);
    this.logger.log(
      `Added ${savedImages.length} images to field ${fieldId} successfully`,
    );
    return savedImages;
  }
}
