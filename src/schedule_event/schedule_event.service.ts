import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateScheduleEventDto } from './dto/create-schedule_event.dto';
import { UpdateScheduleEventDto } from './dto/update-schedule_event.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ApprovalRecord, ScheduleEvent } from './entities/schedule_event.entity';
import { In, Repository } from 'typeorm';

@Injectable()
export class ScheduleEventService {
  constructor(
    @InjectRepository(ScheduleEvent)
    private readonly scheduleEventRepo: Repository<ScheduleEvent>,
  ) { }

  create(createScheduleEventDto: CreateScheduleEventDto) {
    return 'This action adds a new scheduleEvent';
  }

  findAll() {
    return `This action returns all scheduleEvent`;
  }

  findOne(id: number) {
    return `This action returns a #${id} scheduleEvent`;
  }

  update(id: number, updateScheduleEventDto: UpdateScheduleEventDto) {
    return `This action updates a #${id} scheduleEvent`;
  }

  async remove(id: number): Promise<{ message: string }> {
    const result = await this.scheduleEventRepo.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`ScheduleEvent with id ${id} not found`);
    }

    return { message: `ScheduleEvent with id ${id} has been deleted.` };
  }

  async approve(id: number, approver: ApprovalRecord): Promise<ScheduleEvent> {
    const event = await this.scheduleEventRepo.findOne({ where: { id } });
    if (!event) throw new NotFoundException(`ScheduleEvent #${id} not found`);

    if (event.approval_1 && event.approval_2) {
      throw new BadRequestException(`ScheduleEvent #${id} already has both approvals`);
    }

    const record: ApprovalRecord = {
      approved_by: approver.approved_by,
      employee_number: approver.employee_number,
      approved_at: new Date().toISOString(),
    };

    if (!event.approval_1) {
      event.approval_1 = record;
    } else {
      event.approval_2 = record;
    }

    return this.scheduleEventRepo.save(event);
  }

  async unapprove(id: number): Promise<ScheduleEvent> {
    const event = await this.scheduleEventRepo.findOne({ where: { id } });
    if (!event) throw new NotFoundException(`ScheduleEvent #${id} not found`);

    if (!event.approval_1 && !event.approval_2) {
      throw new BadRequestException(`ScheduleEvent #${id} has no approvals to remove`);
    }

    if (event.approval_2) {
      event.approval_2 = null;
    } else {
      event.approval_1 = null;
    }

    return this.scheduleEventRepo.save(event);
  }

  async bulkApprove(eventIds: number[], approver: ApprovalRecord): Promise<{ approved: number; skipped: number }> {
    if (!eventIds?.length) throw new BadRequestException('No event IDs provided');

    const events = await this.scheduleEventRepo.findBy({ id: In(eventIds) });
    const record: ApprovalRecord = {
      approved_by: approver.approved_by,
      employee_number: approver.employee_number,
      approved_at: new Date().toISOString(),
    };

    let approved = 0;
    let skipped = 0;

    for (const event of events) {
      if (event.approval_1 && event.approval_2) {
        skipped++;
        continue;
      }
      if (!event.approval_1) {
        event.approval_1 = record;
      } else {
        event.approval_2 = record;
      }
      approved++;
    }

    await this.scheduleEventRepo.save(events);
    return { approved, skipped };
  }
}
