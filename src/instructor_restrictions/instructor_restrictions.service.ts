import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateInstructorRestrictionDto } from './dto/create-instructor_restriction.dto';
import { UpdateInstructorRestrictionDto } from './dto/update-instructor_restriction.dto';
import { InstructorRestriction } from './entities/instructor_restriction.entity';

@Injectable()
export class InstructorRestrictionsService {
  constructor(
    @InjectRepository(InstructorRestriction)
    private readonly instructorRestrictionRepository: Repository<InstructorRestriction>,
  ) {}

  async create(
    createInstructorRestrictionDto: CreateInstructorRestrictionDto,
  ): Promise<InstructorRestriction> {
    const instructorRestriction = this.instructorRestrictionRepository.create(
      createInstructorRestrictionDto,
    );

    return await this.instructorRestrictionRepository.save(instructorRestriction);
  }

  async findAll(): Promise<InstructorRestriction[]> {
    return await this.instructorRestrictionRepository.find({
      order: { id: 'ASC' },
    });
  }

  async findOne(id: number): Promise<InstructorRestriction> {
    const instructorRestriction = await this.instructorRestrictionRepository.findOne({
      where: { id },
    });

    if (!instructorRestriction) {
      throw new NotFoundException(`InstructorRestriction with id ${id} not found`);
    }

    return instructorRestriction;
  }

  async update(
    id: number,
    updateInstructorRestrictionDto: UpdateInstructorRestrictionDto,
  ): Promise<InstructorRestriction> {
    const instructorRestriction = await this.findOne(id);

    Object.assign(instructorRestriction, updateInstructorRestrictionDto);

    return await this.instructorRestrictionRepository.save(instructorRestriction);
  }

  async remove(id: number) {
    const instructorRestriction = await this.findOne(id);

    await this.instructorRestrictionRepository.remove(instructorRestriction);

    return {
      message: `InstructorRestriction with id ${id} deleted successfully`,
    };
  }
}