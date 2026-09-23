import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { HrJwtGuard } from '../common/guards/hr-jwt.guard';
import { PermissionGuard, RequirePermission } from '../common/guards/permission.guard';

import { CandidateTrackerPositionsService } from './candidate-tracker-positions.service';
import { CreateCandidateTrackerPositionDto } from './dto/create-candidate-tracker-position.dto';
import { UpdateCandidateTrackerPositionDto } from './dto/update-candidate-tracker-position.dto';

/**
 * Catalogo de positions propio de Candidate Tracker -- ruta separada a
 * proposito de /candidate-tracker/:id (path propio en vez de nested bajo
 * /candidate-tracker/positions) para no repetir el problema de matching que
 * ya documentaron en CandidateTrackerController con "history" vs ":id".
 *
 * Mismo permiso que el resto del modulo (hr_candidate_tracker): quien
 * administra el tracker administra su catalogo de positions.
 */
@Controller('candidate-tracker-positions')
@UseGuards(HrJwtGuard, PermissionGuard)
@RequirePermission('hr_candidate_tracker')
export class CandidateTrackerPositionsController {
  constructor(private readonly service: CandidateTrackerPositionsService) {}

  @Post()
  create(@Body() dto: CreateCandidateTrackerPositionDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateTrackerPositionDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
