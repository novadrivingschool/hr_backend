import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ActivityRequestService } from './activity_request.service';
import { CreateActivityRequestDto } from './dto/create-activity_request.dto';
import { UpdateActivityRequestDto } from './dto/update-activity_request.dto';

@Controller('activity-request')
export class ActivityRequestController {
  constructor(private readonly activityRequestService: ActivityRequestService) { }

  @Post()
  create(@Body() dto: CreateActivityRequestDto) {
    return this.activityRequestService.create(dto);
  }

  @Get()
  findAll() {
    return this.activityRequestService.findAll();
  }

  @Get('search')
  searchByEmployeeAndStatus(
    @Query('employee_number') employee_number: string,
    @Query('status') status?: string,
  ) {
    return this.activityRequestService.searchByEmployeeAndStatus(employee_number, status);
  }

  @Get('hr/filter')
  getFilteredRequestsForHr(
    @Query('status') status: string,
    @Query('multi_department') multi_department?: string | string[],
    @Query('employee_number') employee_number?: string,
    @Query('search') search?: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
  ) {
    const normalizeToArray = (input?: string | string[]): string[] => {
      if (!input) return [];
      if (Array.isArray(input)) return input.map(s => s?.trim()).filter(Boolean);
      return input.split(',').map(s => s.trim()).filter(Boolean);
    };

    let depts = normalizeToArray(multi_department);
    if (depts.some(d => d.toLowerCase?.() === 'all')) depts = [];

    const isValidDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
    let dateFrom = isValidDate(date_from) ? date_from : undefined;
    let dateTo = isValidDate(date_to) ? date_to : undefined;
    if (dateFrom && dateTo && dateFrom > dateTo) [dateFrom, dateTo] = [dateTo, dateFrom];

    return this.activityRequestService.findHrByStatusDepartmentAndEmployee(
      status,
      depts,
      employee_number,
      search?.trim() || undefined,
      dateFrom,
      dateTo,
    );
  }

  @Get('hr/kpis')
  getKpiCounts(@Query('multi_department') multi_department?: string | string[]) {
    const normalizeToArray = (input?: string | string[]): string[] => {
      if (!input) return [];
      if (Array.isArray(input)) return input.map(s => s?.trim()).filter(Boolean);
      return input.split(',').map(s => s.trim()).filter(Boolean);
    };
    let depts = normalizeToArray(multi_department);
    if (depts.some(d => d.toLowerCase() === 'all')) depts = [];
    return this.activityRequestService.getKpiCounts(depts);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.activityRequestService.findOne(id);
  }

  @Patch(':id/cancel')
  cancelRequest(
    @Param('id') id: string,
    @Body('cancelled_by') cancelled_by: string,
    @Body('role') role: 'staff' | 'hr' | 'coordinator' | 'management',
    @Body('reason') reason?: string,
  ) {
    return this.activityRequestService.cancelRequest(id, cancelled_by, role, reason);
  }

  @Patch(':id/reopen')
  reopenRequest(
    @Param('id') id: string,
    @Body('reopened_by') reopened_by: string,
  ) {
    return this.activityRequestService.reopenRequest(id, reopened_by);
  }

  @Patch(':id/approve/coordinator')
  approveByCoordinator(
    @Param('id') id: string,
    @Body('approved') approved: boolean,
    @Body('by') by: string,
    @Body('coordinator_comments') coordinator_comments: string,
  ) {
    return this.activityRequestService.approveByCoordinator(id, approved, by, coordinator_comments);
  }

  @Patch(':id/approve/hr')
  approveByHR(
    @Param('id') id: string,
    @Body('approved') approved: boolean,
    @Body('by') by: string,
    @Body('hr_comments') hr_comments: string,
  ) {
    return this.activityRequestService.approveByHR(id, approved, by, hr_comments);
  }

  @Patch(':id/resend-staff-email')
  resendStaffEmail(@Param('id') id: string) {
    return this.activityRequestService.resendStaffEmail(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateActivityRequestDto) {
    return this.activityRequestService.update(id, dto);
  }

  @Delete(':id')
  cancelOnDelete(
    @Param('id') id: string,
    @Body('cancelled_by') cancelled_by: string,
    @Body('reason') reason?: string,
  ) {
    return this.activityRequestService.cancelRequest(
      id,
      cancelled_by || 'system',
      'staff',
      reason || 'Cancelled via delete action',
    );
  }
}
