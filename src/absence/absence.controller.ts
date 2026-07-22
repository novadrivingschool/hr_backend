import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Delete,
    Param,
    Query,
    ParseUUIDPipe,
} from '@nestjs/common';
import { AbsenceService } from './absence.service';
import { CreateAbsenceDto } from './dto/create-absence.dto';
import { UpdateAbsenceDto, CancelAbsenceDto } from './dto/update-absence.dto';
import { Absence } from './entities/absence.entity';

@Controller('absence')
export class AbsenceController {
    constructor(private readonly absenceService: AbsenceService) { }

    /**
     * Registra una absence. Sin aprobación: nace 'Registered' y dispara
     * los correos y el evento de Outage en el master schedule.
     */
    @Post()
    create(@Body() createDto: CreateAbsenceDto): Promise<Absence> {
        return this.absenceService.create(createDto);
    }

    @Get()
    findAll(): Promise<Absence[]> {
        return this.absenceService.findAll();
    }

    /** Absences que no se pudieron escribir en el master schedule. */
    @Get('failed-sync')
    findFailedSync(): Promise<Absence[]> {
        return this.absenceService.findFailedSync();
    }

    /** GET /absence/search?employee_number=123&status=Registered */
    @Get('search')
    findByEmployee(
        @Query('employee_number') employeeNumber: string,
        @Query('status') status?: string,
    ): Promise<Absence[]> {
        return this.absenceService.findByEmployee(employeeNumber, status);
    }

    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Absence> {
        return this.absenceService.findOne(id);
    }

    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateDto: UpdateAbsenceDto,
    ): Promise<Absence> {
        return this.absenceService.update(id, updateDto);
    }

    /** Cancela la absence y borra sus eventos de Outage. */
    @Patch(':id/cancel')
    cancel(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CancelAbsenceDto,
    ): Promise<Absence> {
        return this.absenceService.cancel(id, dto);
    }

    /** Reintenta escribir el evento de Outage cuando falló el alta. */
    @Patch(':id/retry-event')
    retryEvent(@Param('id', ParseUUIDPipe) id: string): Promise<Absence> {
        return this.absenceService.retryScheduleEvent(id);
    }

    /**
     * Borrado duro — solo admin (HR / Management).
     *
     * ⚠️ El backend no tiene guards: el rol se valida únicamente en el router
     * y el componente de Vue. Cualquiera que alcance el host puede llamar esto
     * con curl. Es la misma deuda que arrastra todo hr_backend (ver TOR:
     * PATCH /:id/approve/hr también es público).
     */
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ deleted: true; id: string }> {
        return this.absenceService.remove(id);
    }
}
