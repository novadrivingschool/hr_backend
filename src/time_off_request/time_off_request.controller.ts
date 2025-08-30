import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { TimeOffRequestService } from './time_off_request.service';
import { CreateTimeOffRequestDto } from './dto/create-time_off_request.dto';
import { UpdateTimeOffRequestDto } from './dto/update-time_off_request.dto';
import { StatusEnum } from './enums';

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
    return this.timeOffRequestService.findCoordinatorByStatusAndDepartment(status, department);
  }

  @Get('hr/filter')
  getFilteredRequestsForHr(
    @Query('status') status: string,
    @Query('department') department: string,
    @Query('employee_number') employee_number?: string,
  ) {
    console.log("🔍 Filtering HR requests:", { status, department, employee_number });
    return this.timeOffRequestService.findHrByStatusDepartmentAndEmployee(status, department, employee_number);
  }


  /* @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: 'Pending' | 'Approved' | 'Not Approved'
  ) {
    console.log(`Updating status for request ID ${id} to ${status}`);
    return this.timeOffRequestService.updateStatus(id, status);
  } */
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string, // viene string del request
  ) {
    const s = (status ?? '').trim().toLowerCase();

    // string -> StatusEnum (inline, sin helpers)
    const normalized: StatusEnum =
      s === 'approved'
        ? StatusEnum.Approved
        : s.startsWith('not')
          ? StatusEnum.NotApproved
          : StatusEnum.Pending;

    return this.timeOffRequestService.updateStatus(id, normalized);
  }

  @Patch(':id/approve/coordinator')
  approveByCoordinator(
    @Param('id') id: string,
    @Body('approved') approved: boolean,
    @Body('by') by: string,
    @Body('coordinator_comments') coordinator_comments: string
  ) {
    return this.timeOffRequestService.approveByCoordinator(id, approved, by, coordinator_comments);
  }

  @Patch(':id/approve/hr')
  approveByHR(
    @Param('id') id: string,
    @Body('approved') approved: boolean,
    @Body('by') by: string,
    @Body('hr_comments') hr_comments: string
  ) {
    return this.timeOffRequestService.approveByHR(id, approved, by, hr_comments);
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
