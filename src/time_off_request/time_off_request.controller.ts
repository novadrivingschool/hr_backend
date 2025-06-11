import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { TimeOffRequestService } from './time_off_request.service';
import { CreateTimeOffRequestDto } from './dto/create-time_off_request.dto';
import { UpdateTimeOffRequestDto } from './dto/update-time_off_request.dto';

@Controller('time-off-request')
export class TimeOffRequestController {
  constructor(private readonly timeOffRequestService: TimeOffRequestService) { }

  @Post()
  create(@Body() createTimeOffRequestDto: CreateTimeOffRequestDto) {
    console.log('Creating time off request:', createTimeOffRequestDto);
    return this.timeOffRequestService.create(createTimeOffRequestDto);
  }

  @Get()
  findAll() {
    return this.timeOffRequestService.findAll();
  }

  @Get('status/:status')
  getByStatus(@Param('status') status: string) {
    return this.timeOffRequestService.findByStatus(status);
  }

  @Get('search')
  searchByEmployeeAndStatus(
    @Query('employee_number') employee_number: string,
    @Query('status') status?: 'Pending' | 'Approved' | 'Not Approved' | 'All'
  ) {
    console.log(`Searching for employee: ${employee_number}, status: ${status}`);
    //return this.timeOffRequestService.searchByEmployeeAndStatus(employee_number, status);
    return this.timeOffRequestService.searchCoordinatorByEmployeeAndStatus(employee_number, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.timeOffRequestService.findOne(id);
  }

  @Get('status/:status/department/:department')
  getByStatusAndDepartment(
    @Param('status') status: string,
    @Param('department') department: string,
  ) {
    console.log("Fetching requests by status and department:", status, department);
    //return this.timeOffRequestService.findByStatusAndDepartment(status, department);
    if (department === 'All') {
      return this.timeOffRequestService.findHrByStatusAndDepartment(status, department);
    } else {
      return this.timeOffRequestService.findCoordinatorByStatusAndDepartment(status, department);
    }
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: 'Pending' | 'Approved' | 'Not Approved'
  ) {
    console.log(`Updating status for request ID ${id} to ${status}`);
    return this.timeOffRequestService.updateStatus(id, status);
  }

  @Patch(':id/approve/coordinator')
  approveByCoordinator(
    @Param('id') id: string,
    @Body('approved') approved: boolean,
    @Body('by') by: string
  ) {
    return this.timeOffRequestService.approveByCoordinator(id, approved, by);
  }

  @Patch(':id/approve/hr')
  approveByHR(
    @Param('id') id: string,
    @Body('approved') approved: boolean,
    @Body('by') by: string
  ) {
    return this.timeOffRequestService.approveByHR(id, approved, by);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTimeOffRequestDto: UpdateTimeOffRequestDto) {
    return this.timeOffRequestService.update(id, updateTimeOffRequestDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.timeOffRequestService.remove(id);
  }

}
