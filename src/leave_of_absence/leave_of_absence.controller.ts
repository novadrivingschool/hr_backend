import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Delete,
    Param,
    ParseUUIDPipe,
} from '@nestjs/common';
import { LeaveOfAbsenceService } from './leave_of_absence.service';
import { CreateLeaveOfAbsenceDto } from './dto/create-leave-of-absence.dto';
import { UpdateLeaveOfAbsenceDto } from './dto/update-leave-of-absence.dto';
import { AddDepartmentLogEntryDto } from './dto/add-department-log-entry.dto';
import { SetDepartmentAttendedDto } from './dto/set-department-attended.dto';
import { SetDepartmentReactivatedDto } from './dto/set-department-reactivated.dto';
import { MarkReturnedToWorkDto } from './dto/mark-returned-to-work.dto';
import { LeaveOfAbsence } from './entities/leave-of-absence.entity';

@Controller('leave-of-absence')
export class LeaveOfAbsenceController {
    constructor(private readonly service: LeaveOfAbsenceService) { }

    @Post()
    create(@Body() dto: CreateLeaveOfAbsenceDto): Promise<LeaveOfAbsence> {
        return this.service.create(dto);
    }

    @Get()
    findAll(): Promise<LeaveOfAbsence[]> {
        return this.service.findAll();
    }

    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string): Promise<LeaveOfAbsence> {
        return this.service.findOne(id);
    }

    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateLeaveOfAbsenceDto,
    ): Promise<LeaveOfAbsence> {
        return this.service.update(id, dto);
    }

    /**
     * Borrado duro — sin guards en el backend (mismo patrón que
     * AbsenceController/FacilitiesController: el rol se valida en el
     * router y el componente de Vue, no aquí).
     */
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ deleted: true; id: string }> {
        return this.service.remove(id);
    }

    // ── Bitácoras de departamento ───────────────────────────────────────────
    // Cada acción tiene su propio endpoint (no un PATCH genérico) para que dos
    // departamentos editando el mismo LOA a la vez no se pisen el read-modify-write.

    @Post(':id/department-logs/:department')
    addDepartmentLogEntry(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('department') department: string,
        @Body() dto: AddDepartmentLogEntryDto,
    ): Promise<LeaveOfAbsence> {
        return this.service.addDepartmentLogEntry(id, department, dto);
    }

    @Patch(':id/department-logs/:department/attended')
    setDepartmentAttended(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('department') department: string,
        @Body() dto: SetDepartmentAttendedDto,
    ): Promise<LeaveOfAbsence> {
        return this.service.setDepartmentAttended(id, department, dto);
    }

    @Patch(':id/department-logs/:department/reactivated')
    setDepartmentReactivated(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('department') department: string,
        @Body() dto: SetDepartmentReactivatedDto,
    ): Promise<LeaveOfAbsence> {
        return this.service.setDepartmentReactivated(id, department, dto);
    }

    /** Exclusivo de HR (loa-hr / management) — rol validado en el frontend. */
    @Patch(':id/returned-to-work')
    markReturnedToWork(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: MarkReturnedToWorkDto,
    ): Promise<LeaveOfAbsence> {
        return this.service.markReturnedToWork(id, dto);
    }
}
