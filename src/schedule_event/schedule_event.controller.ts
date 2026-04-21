import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ScheduleEventService } from './schedule_event.service';
import { CreateScheduleEventDto } from './dto/create-schedule_event.dto';
import { UpdateScheduleEventDto } from './dto/update-schedule_event.dto';
import { ApprovalRecord } from './entities/schedule_event.entity';

@Controller('schedule-event')
export class ScheduleEventController {
  constructor(private readonly scheduleEventService: ScheduleEventService) {}

  @Post()
  create(@Body() createScheduleEventDto: CreateScheduleEventDto) {
    return this.scheduleEventService.create(createScheduleEventDto);
  }

  @Get()
  findAll() {
    return this.scheduleEventService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scheduleEventService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateScheduleEventDto: UpdateScheduleEventDto) {
    return this.scheduleEventService.update(+id, updateScheduleEventDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.scheduleEventService.remove(+id);
  }

  @Patch(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() body: ApprovalRecord,
  ) {
    return this.scheduleEventService.approve(+id, body);
  }

  @Patch(':id/unapprove')
  unapprove(@Param('id') id: string) {
    return this.scheduleEventService.unapprove(+id);
  }

  @Post('bulk-approve')
  bulkApprove(
    @Body() body: { event_ids: number[]; approved_by: string; employee_number: string },
  ) {
    const approver: ApprovalRecord = {
      approved_by: body.approved_by,
      employee_number: body.employee_number,
      approved_at: '',
    };
    return this.scheduleEventService.bulkApprove(body.event_ids, approver);
  }
}
