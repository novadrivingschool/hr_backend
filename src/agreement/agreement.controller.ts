import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AgreementService, AgreementComputedStatus } from './agreement.service';
import { CreateAgreementDto } from './dto/create-agreement.dto';
import { UpdateAgreementDto } from './dto/update-agreement.dto';
import { AddAgreementNoteDto } from './dto/add-agreement-note.dto';
import { SoftDeleteAgreementDto } from './dto/soft-delete-agreement.dto';

@Controller('agreements')
export class AgreementController {
  constructor(private readonly agreementService: AgreementService) {}

  // ── POST /agreements ──────────────────────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAgreementDto) {
    return this.agreementService.create(dto);
  }

  // ── GET /agreements ───────────────────────────────────────────────────────
  // Query: page, limit, search (nombre/employee_number/reason), status (upcoming|active|expired),
  // employeeNumber (match exacto contra agreement.employee.employee_number -- usado por la
  // pestaña Agreements en Employees, ver AgreementsEmployeeTab.vue).
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(15), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: AgreementComputedStatus,
    @Query('employeeNumber') employeeNumber?: string,
  ) {
    return this.agreementService.findAll(page, limit, { search, status, employeeNumber });
  }

  // ── GET /agreements/:id ───────────────────────────────────────────────────
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.agreementService.findOne(id);
  }

  // ── PATCH /agreements/:id ─────────────────────────────────────────────────
  // Actualización general de campos (incluido attachments, ver UpdateAgreementDto).
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAgreementDto) {
    return this.agreementService.update(id, dto);
  }

  // ── PATCH /agreements/:id/notes ───────────────────────────────────────────
  // Agrega una nota al historial (append-only, nunca se edita/borra una nota existente).
  @Patch(':id/notes')
  addNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddAgreementNoteDto) {
    return this.agreementService.addNote(id, dto);
  }

  // ── DELETE /agreements/:id ────────────────────────────────────────────────
  // Soft delete -- el registro nunca se borra físicamente, ver AgreementService.remove().
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SoftDeleteAgreementDto) {
    return this.agreementService.remove(id, dto);
  }
}
