import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { HrJwtGuard } from '../common/guards/hr-jwt.guard';
import { PermissionGuard, RequirePermission } from '../common/guards/permission.guard';
import { CurrentUser, HrUser } from '../common/current-user';

import { CandidateTrackerService } from './candidate-tracker.service';
import { CreateCandidateTrackerDto } from './dto/create-candidate-tracker.dto';
import { UpdateCandidateTrackerDto } from './dto/update-candidate-tracker.dto';
import { QueryCandidateTrackerDto } from './dto/query-candidate-tracker.dto';
import { QueryCandidateTrackerHistoryDto } from './dto/query-candidate-tracker-history.dto';
import { QueryWeeklyKpisDto } from './dto/query-weekly-kpis.dto';
import { AddAttachmentDto } from './dto/add-attachment.dto';

/**
 * Requiere el permiso 'hr_candidate_tracker' (ver
 * add_candidate_tracker_permission.sql en la raiz del monorepo) en TODOS los
 * endpoints — a diferencia de otros modulos de catalogo donde el GET queda
 * publico, aca la lista de candidatos es informacion de reclutamiento
 * sensible (telefono, email, resultados de entrevista), asi que tambien se
 * protege la lectura.
 */
@Controller('candidate-tracker')
@UseGuards(HrJwtGuard, PermissionGuard)
@RequirePermission('hr_candidate_tracker')
export class CandidateTrackerController {
  constructor(private readonly service: CandidateTrackerService) {}

  @Post()
  create(@Body() dto: CreateCandidateTrackerDto, @CurrentUser() user: HrUser) {
    return this.service.create({
      ...dto,
      createdByEmployeeNumber: user?.employee_number ?? dto.createdByEmployeeNumber ?? null,
      createdByName: user ? `${user.name} ${user.last_name}`.trim() : dto.createdByName ?? null,
    });
  }

  @Get()
  findAll(@Query() query: QueryCandidateTrackerDto) {
    return this.service.findAll(query);
  }

  // OJO: debe ir ANTES de @Get(':id') -- si no, Nest intenta matchear
  // "/candidate-tracker/history" contra ":id" y ParseUUIDPipe lo rechaza.
  @Get('history')
  findHistory(@Query() query: QueryCandidateTrackerHistoryDto) {
    return this.service.findHistory(query);
  }

  // Mismo motivo que 'history' arriba: rutas literales antes de ':id'.
  @Get('kpis/weekly')
  getWeeklyKpis(@Query() query: QueryWeeklyKpisDto) {
    return this.service.getWeeklyKpis(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateTrackerDto,
    @CurrentUser() user: HrUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: HrUser) {
    return this.service.remove(id, user);
  }

  @Post(':id/attachments')
  addAttachment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddAttachmentDto) {
    return this.service.addAttachment(id, dto.key);
  }

  @Delete(':id/attachments/:key')
  removeAttachment(@Param('id', ParseUUIDPipe) id: string, @Param('key') key: string) {
    return this.service.removeAttachment(id, decodeURIComponent(key));
  }
}
