import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateInstructorServiceDto } from './dto/create-instructor_service.dto';
import { UpdateInstructorServiceDto } from './dto/update-instructor_service.dto';
import { InstructorService } from './entities/instructor_service.entity';

@Injectable()
export class InstructorServicesService {
  constructor(
    @InjectRepository(InstructorService)
    private readonly instructorServiceRepository: Repository<InstructorService>,
  ) {}

  async create(createInstructorServiceDto: CreateInstructorServiceDto): Promise<InstructorService> {
    const instructorService = this.instructorServiceRepository.create(createInstructorServiceDto);
    return await this.instructorServiceRepository.save(instructorService);
  }

  async findAll(): Promise<InstructorService[]> {
    return await this.instructorServiceRepository.find({
      order: { id: 'ASC' },
    });
  }

  async findOne(id: number): Promise<InstructorService> {
    const instructorService = await this.instructorServiceRepository.findOne({
      where: { id },
    });

    if (!instructorService) {
      throw new NotFoundException(`InstructorService with id ${id} not found`);
    }

    return instructorService;
  }

  async update(
    id: number,
    updateInstructorServiceDto: UpdateInstructorServiceDto,
  ): Promise<InstructorService> {
    const instructorService = await this.findOne(id);

    Object.assign(instructorService, updateInstructorServiceDto);

    return await this.instructorServiceRepository.save(instructorService);
  }

  async remove(id: number) {
    const instructorService = await this.findOne(id);

    await this.instructorServiceRepository.remove(instructorService);

    return {
      message: `InstructorService with id ${id} deleted successfully`,
    };
  }
}