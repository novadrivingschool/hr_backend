import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe } from '@nestjs/common';
import { InstructorVehiclePickupDropoffService } from './instructor_vehicle_pickup_dropoff.service';
import { CreateInstructorVehiclePickupDropoffDto } from './dto/create-instructor_vehicle_pickup_dropoff.dto';
import { UpdateInstructorVehiclePickupDropoffDto } from './dto/update-instructor_vehicle_pickup_dropoff.dto';

@Controller('instructor-vehicle-pickup-dropoff')
export class InstructorVehiclePickupDropoffController {
  constructor(
    private readonly instructorVehiclePickupDropoffService: InstructorVehiclePickupDropoffService,
  ) {}

  @Post()
  create(@Body() createInstructorVehiclePickupDropoffDto: CreateInstructorVehiclePickupDropoffDto) {
    return this.instructorVehiclePickupDropoffService.create(
      createInstructorVehiclePickupDropoffDto,
    );
  }

  @Get()
  findAll() {
    return this.instructorVehiclePickupDropoffService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.instructorVehiclePickupDropoffService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateInstructorVehiclePickupDropoffDto: UpdateInstructorVehiclePickupDropoffDto,
  ) {
    return this.instructorVehiclePickupDropoffService.update(
      id,
      updateInstructorVehiclePickupDropoffDto,
    );
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.instructorVehiclePickupDropoffService.remove(id);
  }
}