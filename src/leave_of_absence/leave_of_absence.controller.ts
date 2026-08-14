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
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskLabelDto } from './dto/update-subtask-label.dto';
import { DeleteSubtaskDto } from './dto/delete-subtask.dto';
import { SetSubtaskCompletedDto } from './dto/set-subtask-completed.dto';
import { SetHrDoneDto } from './dto/set-hr-done.dto';
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

    // ── Templates reutilizables de subtareas por depto ──────────────────────
    // Independiente de cualquier LOA puntual — se siembran automáticamente en
    // TODO LOA nuevo de ese depto (ver LeaveOfAbsenceService.create). Nunca
    // colisiona con GET/PATCH/DELETE ':id' de arriba: distinto número de
    // segmentos en el path ('subtask-templates/:department' vs ':id').

    @Get('subtask-templates/:department')
    listSubtaskTemplates(@Param('department') department: string) {
        return this.service.listSubtaskTemplates(department);
    }

    @Post('subtask-templates/:department')
    createSubtaskTemplate(
        @Param('department') department: string,
        @Body() dto: CreateSubtaskDto,
    ) {
        return this.service.createSubtaskTemplate(department, dto);
    }

    @Patch('subtask-templates/:department/:templateId')
    updateSubtaskTemplate(
        @Param('department') department: string,
        @Param('templateId') templateId: string,
        @Body() dto: UpdateSubtaskLabelDto,
    ) {
        return this.service.updateSubtaskTemplate(department, templateId, dto);
    }

    @Delete('subtask-templates/:department/:templateId')
    deleteSubtaskTemplate(
        @Param('department') department: string,
        @Param('templateId') templateId: string,
    ) {
        return this.service.deleteSubtaskTemplate(department, templateId);
    }

    // ── Bitácora exclusiva de HR — sin subtareas, nunca se bloquea ──────────

    @Post(':id/hr-log')
    addHrLogEntry(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AddDepartmentLogEntryDto,
    ): Promise<LeaveOfAbsence> {
        return this.service.addHrLogEntry(id, dto);
    }

    @Patch(':id/hr-log/done')
    setHrDone(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: SetHrDoneDto,
    ): Promise<LeaveOfAbsence> {
        return this.service.setHrDone(id, dto);
    }

    // ── Bitácoras de departamento — checklist de "Temporary Offboarding" ────
    // Cada acción tiene su propio endpoint (no un PATCH genérico) para que dos
    // departamentos editando el mismo LOA a la vez no se pisen el read-modify-write.
    // Todas quedan bloqueadas server-side cuando returned_to_work=true (ver
    // LeaveOfAbsenceService.assertDepartmentNotLocked).

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

    // ── Subtareas del checklist de cada depto — CRUD libre, sin catálogo ────

    @Post(':id/department-logs/:department/subtasks')
    createSubtask(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('department') department: string,
        @Body() dto: CreateSubtaskDto,
    ): Promise<LeaveOfAbsence> {
        return this.service.createSubtask(id, department, dto);
    }

    @Patch(':id/department-logs/:department/subtasks/:subtaskKey')
    updateSubtaskLabel(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('department') department: string,
        @Param('subtaskKey') subtaskKey: string,
        @Body() dto: UpdateSubtaskLabelDto,
    ): Promise<LeaveOfAbsence> {
        return this.service.updateSubtaskLabel(id, department, subtaskKey, dto);
    }

    @Delete(':id/department-logs/:department/subtasks/:subtaskKey')
    deleteSubtask(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('department') department: string,
        @Param('subtaskKey') subtaskKey: string,
        @Body() dto: DeleteSubtaskDto,
    ): Promise<LeaveOfAbsence> {
        return this.service.deleteSubtask(id, department, subtaskKey, dto.actor);
    }

    @Post(':id/department-logs/:department/subtasks/:subtaskKey')
    addSubtaskEntry(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('department') department: string,
        @Param('subtaskKey') subtaskKey: string,
        @Body() dto: AddDepartmentLogEntryDto,
    ): Promise<LeaveOfAbsence> {
        return this.service.addSubtaskEntry(id, department, subtaskKey, dto);
    }

    @Patch(':id/department-logs/:department/subtasks/:subtaskKey/completed')
    setSubtaskCompleted(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('department') department: string,
        @Param('subtaskKey') subtaskKey: string,
        @Body() dto: SetSubtaskCompletedDto,
    ): Promise<LeaveOfAbsence> {
        return this.service.setSubtaskCompleted(id, department, subtaskKey, dto);
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
