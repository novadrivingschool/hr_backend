import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateInstructorVehiclePickupDropoffDto } from './dto/create-instructor_vehicle_pickup_dropoff.dto';
import { UpdateInstructorVehiclePickupDropoffDto } from './dto/update-instructor_vehicle_pickup_dropoff.dto';
import { InstructorVehiclePickupDropoff } from './entities/instructor_vehicle_pickup_dropoff.entity';

@Injectable()
export class InstructorVehiclePickupDropoffService {
  constructor(
    @InjectRepository(InstructorVehiclePickupDropoff)
    private readonly instructorVehiclePickupDropoffRepository: Repository<InstructorVehiclePickupDropoff>,
  ) {}

  async create(
    createInstructorVehiclePickupDropoffDto: CreateInstructorVehiclePickupDropoffDto,
  ): Promise<InstructorVehiclePickupDropoff> {
    const instructorVehiclePickupDropoff =
      this.instructorVehiclePickupDropoffRepository.create(
        createInstructorVehiclePickupDropoffDto,
      );

    return await this.instructorVehiclePickupDropoffRepository.save(
      instructorVehiclePickupDropoff,
    );
  }

  async findAll(): Promise<InstructorVehiclePickupDropoff[]> {
    return await this.instructorVehiclePickupDropoffRepository.find({
      order: { id: 'ASC' },
    });
  }

  async findOne(id: number): Promise<InstructorVehiclePickupDropoff> {
    const instructorVehiclePickupDropoff =
      await this.instructorVehiclePickupDropoffRepository.findOne({
        where: { id },
      });

    if (!instructorVehiclePickupDropoff) {
      throw new NotFoundException(
        `InstructorVehiclePickupDropoff with id ${id} not found`,
      );
    }

    return instructorVehiclePickupDropoff;
  }

  async update(
    id: number,
    updateInstructorVehiclePickupDropoffDto: UpdateInstructorVehiclePickupDropoffDto,
  ): Promise<InstructorVehiclePickupDropoff> {
    const instructorVehiclePickupDropoff = await this.findOne(id);

    Object.assign(
      instructorVehiclePickupDropoff,
      updateInstructorVehiclePickupDropoffDto,
    );

    return await this.instructorVehiclePickupDropoffRepository.save(
      instructorVehiclePickupDropoff,
    );
  }

  async remove(id: number) {
    const instructorVehiclePickupDropoff = await this.findOne(id);

    await this.instructorVehiclePickupDropoffRepository.remove(
      instructorVehiclePickupDropoff,
    );

    return {
      message: `InstructorVehiclePickupDropoff with id ${id} deleted successfully`,
    };
  }
}