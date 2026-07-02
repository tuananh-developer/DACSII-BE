import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Branch } from './entities/branch.entity';
import { Address } from '@/location/entities/address.entity';
import { City } from '@/location/entities/city.entity';
import { Ward } from '@/location/entities/ward.entity';
import { GeocodingService } from '@/location/geocoding.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UserProfile } from '@/user/entities/users-profile.entity';
import { RoleEnum } from '@/auth/enums/role.enum';
import { Account } from '@/user/entities/account.entity';
import { IsNull } from 'typeorm';
import { BranchResponseDto, AddressResponseDto } from './dto/branch-response.dto';
import { UserProfileResponseDto } from '@/user/dto/user-profile-response.dto';
import { MessageResponseDto } from '@/common/dto/message-response.dto';

/**
 * @class BranchService
 * @description Service to handle business logic for branches.
 */
@Injectable()
export class BranchService {
  private readonly logger = new Logger(BranchService.name);

  /**
   * @constructor
   * @param {Repository<Branch>} branchRepository - Repository for the Branch entity.
   * @param {Repository<Address>} addressRepository - Repository for the Address entity.
   * @param {Repository<City>} cityRepository - Repository for the City entity.
   * @param {Repository<Ward>} wardRepository - Repository for the Ward entity.
   * @param {Repository<UserProfile>} userProfileRepository - Repository for the UserProfile entity.
   * @param {GeocodingService} geocodingService - Service for geocoding addresses.
   * @param {DataSource} dataSource - The data source for managing transactions.
   */
  constructor(
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Address)
    private readonly addressRepository: Repository<Address>,
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
    @InjectRepository(Ward)
    private readonly wardRepository: Repository<Ward>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    private readonly geocodingService: GeocodingService,
    private readonly dataSource: DataSource,
  ) { }

  private mapBranchToResponseDto(branch: Branch): BranchResponseDto {
    const addressDto: AddressResponseDto = {
      id: branch.address.id,
      street: branch.address.street,
      latitude: branch.address.latitude ? Number(branch.address.latitude) : null,
      longitude: branch.address.longitude ? Number(branch.address.longitude) : null,
      ward_name: branch.address.ward?.name || '',
      city_name: branch.address.city?.name || '',
    };

    let managerDto: UserProfileResponseDto | undefined;
    if (branch.manager) {
      managerDto = this.mapUserProfileToResponseDto(branch.manager);
    }

    return {
      id: branch.id,
      name: branch.name,
      phone_number: branch.phone_number,
      description: branch.description,
      status: branch.status,
      open_time: branch.open_time,
      close_time: branch.close_time,
      created_at: branch.created_at,
      updated_at: branch.updated_at,
      address: addressDto,
      manager: managerDto,
    };
  }

  private mapUserProfileToResponseDto(profile: UserProfile): UserProfileResponseDto {
    return {
      id: profile.id,
      full_name: profile.full_name,
      date_of_birth: profile.date_of_birth,
      gender: profile.gender,
      phone_number: profile.phone_number,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      is_profile_complete: profile.is_profile_complete,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      address: null,
    };
  }

  /**
   * @method create
   * @description Creates a new branch with its address and optionally assigns a manager.
   * @param {CreateBranchDto} createBranchDto - The data to create the branch.
   * @param {Account} creator - The account of the user creating the branch.
   * @returns {Promise<BranchResponseDto>} The newly created branch.
   */
  async create(
    createBranchDto: CreateBranchDto,
    creator: Account,
  ): Promise<BranchResponseDto> {
    this.logger.log(
      `Admin ${creator.id} creating new branch: ${createBranchDto.name}`,
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const {
        street,
        wardId,
        cityId,
        manager_id,
        latitude,
        longitude,
        ...branchData
      } = createBranchDto;

      // 1. Validate Address Components
      const city = await this.cityRepository.findOneBy({ id: cityId });
      if (!city)
        throw new NotFoundException(`City with ID ${cityId} not found.`);

      const ward = await this.wardRepository.findOneBy({ id: wardId });
      if (!ward)
        throw new NotFoundException(`Ward with ID ${wardId} not found.`);

      // 2. Geocode address
      let coordinates: { latitude: number; longitude: number } | null = null;
      if (latitude !== undefined && longitude !== undefined) {
        this.logger.log(
          `Using provided coordinates: [${latitude}, ${longitude}]`,
        );
        coordinates = { latitude, longitude };
      } else {
        coordinates = await this.geocodingService.geocode({
          street,
          ward: ward.name,
          city: city.name,
        });
        if (!coordinates) {
          this.logger.error(
            `Could not geocode address for: ${street}, ${ward.name}, ${city.name}`,
          );
          throw new BadRequestException(
            'Không thể tự động xác định tọa độ từ địa chỉ. Vui lòng cung cấp kinh độ (longitude) và vĩ độ (latitude) theo cách thủ công.',
          );
        }
      }

      // 3. Create and save Address
      const newAddress = this.addressRepository.create({
        street,
        ward,
        city,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
      });
      const savedAddress = await queryRunner.manager.save(newAddress);

      // 4. Validate Manager (if provided)
      let managerProfile: UserProfile | null = null;
      if (manager_id) {
        managerProfile = await this.userProfileRepository.findOne({
          where: { id: manager_id },
          relations: { account: { role: true } },
        });
        if (!managerProfile) {
          throw new NotFoundException(
            `User profile with ID ${manager_id} not found.`,
          );
        }
        if (managerProfile.account.role.name !== String(RoleEnum.Manager)) {
          throw new BadRequestException(
            `User with ID ${manager_id} is not a Manager.`,
          );
        }
      }

      // 5. Create and save Branch
      const newBranch = queryRunner.manager.create(Branch, {
        ...branchData,
        address: savedAddress,
        manager: managerProfile || undefined,
        manager_id: manager_id || null,
        created_by: creator.userProfile,
      });
      const savedBranch = await queryRunner.manager.save(Branch, newBranch);

      // If a manager was assigned, update their profile to link them to this new branch.
      if (managerProfile) {
        await queryRunner.manager.update(UserProfile, managerProfile.id, {
          branch: savedBranch,
        });
        this.logger.log(
          `Updated manager ${managerProfile.id} to be assigned to new branch ${savedBranch.id}`,
        );
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Branch ${savedBranch.id} created successfully.`);
      return this.findOne(savedBranch.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error creating branch:', (error as Error).stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * @method findAll
   * @description Retrieves all branches with their address and manager information.
   * @returns {Promise<BranchResponseDto[]>} A list of all branches.
   */
  async findAll(): Promise<BranchResponseDto[]> {
    const branches = await this.branchRepository.find({
      relations: { 
        address: { 
          ward: true, 
          city: true 
        }, 
        manager: true 
      }
    });
    return branches.map(branch => this.mapBranchToResponseDto(branch));
  }

  /**
   * @method findAvailableManagers
   * @description Finds user profiles with the 'Manager' role who are not yet assigned to any branch.
   * @returns {Promise<UserProfileResponseDto[]>} A list of available managers.
   */
  async findAvailableManagers(): Promise<UserProfileResponseDto[]> {
    this.logger.log('Fetching available managers');
    const managers = await this.userProfileRepository.find({
      where: {
        account: {
          role: {
            name: RoleEnum.Manager,
          },
        },
        branch: IsNull(), // Only find managers not yet assigned to a branch
      },
    });
    return managers.map(manager => this.mapUserProfileToResponseDto(manager));
  }

  /**
   * @method findOne
   * @description Finds a single branch by its ID, including related entities.
   * @param {string} id - The ID of the branch to find.
   * @returns {Promise<BranchResponseDto>} The found branch.
   * @throws {NotFoundException} If the branch with the given ID is not found.
   */
  async findOne(id: string): Promise<BranchResponseDto> {
    const branch = await this.branchRepository.findOne({
      where: { id },
      relations: { 
        address: { 
          ward: true, 
          city: true 
        }, 
        manager: true 
      }
    });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${id} not found.`);
    }
    return this.mapBranchToResponseDto(branch);
  }

  /**
   * @method update
   * @description Updates a branch's information.
   * @param {string} id - The ID of the branch to update.
   * @param {UpdateBranchDto} updateBranchDto - The data to update the branch with.
   * @returns {Promise<BranchResponseDto>} The updated branch.
   */
  async update(id: string, updateBranchDto: UpdateBranchDto): Promise<BranchResponseDto> {
    const branchEntity = await this.branchRepository.findOne({
      where: { id },
      relations: { address: true },
    });

    if (!branchEntity) {
      throw new NotFoundException(`Branch with ID ${id} not found.`);
    }

    const { street, wardId, cityId, manager_id, latitude, longitude, ...branchData } =
      updateBranchDto;

    // Update address if any address field is provided
    if (street !== undefined || wardId !== undefined || cityId !== undefined || latitude !== undefined || longitude !== undefined) {
      const address = branchEntity.address;
      if (address) {
        // Update street if provided
        if (street !== undefined) {
          address.street = street;
        }

        // Update ward if provided
        if (wardId !== undefined) {
          const ward = await this.wardRepository.findOne({ where: { id: wardId } });
          if (ward) {
            address.ward = ward;
          }
        }

        // Update city if provided
        if (cityId !== undefined) {
          const city = await this.cityRepository.findOne({ where: { id: cityId } });
          if (city) {
            address.city = city;
          }
        }

        // Update coordinates if provided
        if (latitude !== undefined) {
          address.latitude = latitude;
        }
        if (longitude !== undefined) {
          address.longitude = longitude;
        }

        await this.addressRepository.save(address);
        this.logger.log(`Address updated for branch ${id}`);
      }
    }

    // Update manager if provided
    if (manager_id !== undefined) {
      if (manager_id === null) {
        // Remove manager assignment
        branchEntity.manager = null;
        branchEntity.manager_id = null;
      } else {
        const managerProfile = await this.userProfileRepository.findOne({
          where: { id: manager_id },
          relations: { account: { role: true } },
        });
        if (managerProfile) {
          branchEntity.manager = managerProfile;
          branchEntity.manager_id = manager_id;
        }
      }
    }

    this.branchRepository.merge(branchEntity, branchData);
    await this.branchRepository.save(branchEntity);

    return this.findOne(id);
  }

  /**
   * @method remove
   * @description Deletes a branch by its ID.
   * @param {string} id - The ID of the branch to delete.
   * @returns {Promise<MessageResponseDto>} A confirmation message.
   * @throws {NotFoundException} If the branch with the given ID is not found.
   */
  async remove(id: string): Promise<MessageResponseDto> {
    const result = await this.branchRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Branch with ID ${id} not found.`);
    }
    return { message: 'Branch deleted successfully.' };
  }
}
