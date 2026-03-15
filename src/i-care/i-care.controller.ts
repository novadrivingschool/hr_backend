import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import { ICareService } from './i-care.service';
import { CreateICareDto } from './dto/create-i-care.dto';
import { UpdateICareDto } from './dto/update-i-care.dto';
import { CommitICareDto } from './dto/commit-i-care.dto';
import { JustifyICareDto } from './dto/justify-i-care.dto';
import { ResolveICareDto } from './dto/resolve-i-care.dto';
import { ICareStatus, ICareUrgency } from './entities/i-care.entity';

@Controller('i-care')
export class ICareController {
  constructor(private readonly iCareService: ICareService) { }

  // ── POST /i-care ────────────────────────────────────────────────────────────
  // Crea un nuevo iCare. Notifica solo a HR al momento de la creación.
  // El Staff NO es notificado hasta que HR justifique el registro.

  @Post()
  @UsePipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }))
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createICareDto: CreateICareDto) {
    try {
      const result = await this.iCareService.create(createICareDto);
      console.log('ICare record created:', result.id);
      return result;
    } catch (error) {
      console.error('Error creating ICare record:', error);
      throw error;
    }
  }

  // ── GET /i-care ─────────────────────────────────────────────────────────────
  // Retorna todos los registros paginados ordenados por createdAt DESC.

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(15), ParseIntPipe) limit: number,
  ) {
    try {
      return await this.iCareService.findAll(page, limit);
    } catch (error) {
      console.error('Error fetching ICare records:', error);
      throw error;
    }
  }

  // ── GET /i-care/stats ───────────────────────────────────────────────────────
  // Retorna métricas agregadas: totales, distribución por urgency/status,
  // committed/pending, críticos activos y tendencia mensual de 6 meses.
  // Acepta los mismos filtros que /search para acotar el universo de datos.

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async getStats(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('submitterEmployeeNumber') submitterEmployeeNumber?: string,
    @Query('staffEmployeeNumber') staffEmployeeNumber?: string,
    @Query('urgency') urgencyRaw?: string,
    @Query('status') statusRaw?: string,
    @Query('department') department?: string,
  ) {
    try {
      const urgency = this.parseUrgency(urgencyRaw);
      const status = this.parseStatus(statusRaw);

      return await this.iCareService.getStats({
        dateFrom,
        dateTo,
        submitterEmployeeNumber,
        staffEmployeeNumber,
        urgency,
        status,
        department,
      });
    } catch (error) {
      console.error('Error fetching ICare statistics:', error);
      throw error;
    }
  }

  // ── GET /i-care/search ──────────────────────────────────────────────────────
  // Búsqueda filtrada con paginación. Soporta filtros por fechas, empleados,
  // urgency, status, committed y departamento (múltiples separados por coma).

  @Get('search')
  @HttpCode(HttpStatus.OK)
  async findByFilters(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(15), ParseIntPipe) limit: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('submitterEmployeeNumber') submitterEmployeeNumber?: string,
    @Query('staffEmployeeNumber') staffEmployeeNumber?: string,
    @Query('responsibleEmployeeNumber') responsibleEmployeeNumber?: string,
    @Query('urgency') urgencyRaw?: string,
    @Query('committed') committed?: string,
    @Query('department') department?: string,
    @Query('status') statusRaw?: string,
  ) {
    try {
      const urgency = this.parseUrgency(urgencyRaw);
      const status = this.parseStatus(statusRaw);
      const committedBool =
        committed === 'true' ? true :
          committed === 'false' ? false :
            undefined;

      return await this.iCareService.findByFilters(
        {
          dateFrom,
          dateTo,
          submitterEmployeeNumber,
          staffEmployeeNumber,
          responsibleEmployeeNumber,
          urgency,
          committed: committedBool,
          department,
          status,
        },
        page,
        limit,
      );
    } catch (error) {
      console.error('Error searching ICare records:', error);
      throw error;
    }
  }

  // ── GET /i-care/advanced-search ─────────────────────────────────────────────
  // Búsqueda full-text sobre reason, details, y datos del submitter/staff.
  // Requiere mínimo 2 caracteres en ?q=. Soporta filtros opcionales de fecha y urgency.

  @Get('advanced-search')
  @HttpCode(HttpStatus.OK)
  async search(
    @Query('q') query: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('urgency') urgencyRaw?: string,
  ) {
    try {
      if (!query || query.trim().length < 2) return [];

      const urgency = this.parseUrgency(urgencyRaw);

      return await this.iCareService.search(query.trim(), { dateFrom, dateTo, urgency });
    } catch (error) {
      console.error('Error in advanced search:', error);
      throw error;
    }
  }

  // ── GET /i-care/emails-by-role/:role ────────────────────────────────────────
  // Endpoint auxiliar para el email service.
  // Retorna los nova_email de todos los empleados activos con el rol dado.
  // Roles permitidos: 'hr' | 'management'
  // IMPORTANTE: debe ir ANTES de /:id para evitar conflicto de rutas.

  @Get('emails-by-role/:role')
  @HttpCode(HttpStatus.OK)
  async getEmailsByRole(@Param('role') role: string) {
    try {
      if (!['hr', 'management'].includes(role)) {
        throw new BadRequestException(
          `Invalid role "${role}". Allowed: hr, management`,
        );
      }
      return await this.iCareService.getEmailsByRole(role as 'hr' | 'management');
    } catch (error) {
      console.error('Error fetching emails by role:', role, error);
      throw error;
    }
  }

  // ── GET /i-care/by-submitter/:employeeNumber ────────────────────────────────
  // Retorna todos los iCare levantados por un empleado específico (submitter).

  @Get('by-submitter/:employeeNumber')
  @HttpCode(HttpStatus.OK)
  async findByCurrentSubmitter(
    @Param('employeeNumber') employeeNumber: string,
    @Query('page') page = '1',
    @Query('limit') limit = '15',
  ) {
    try {
      return await this.iCareService.findByCurrentSubmitter(
        employeeNumber,
        parseInt(page, 10),
        parseInt(limit, 10),
      );
    } catch (error) {
      console.error('Error fetching ICare records by submitter:', error);
      throw error;
    }
  }

  // ── GET /i-care/by-staff/:employeeNumber ────────────────────────────────────
  // Retorna todos los iCare asignados a un empleado de staff específico.

  @Get('by-staff/:employeeNumber')
  @HttpCode(HttpStatus.OK)
  async findByStaff(@Param('employeeNumber') employeeNumber: string) {
    try {
      return await this.iCareService.findByStaff(employeeNumber);
    } catch (error) {
      console.error('Error fetching ICare records by staff:', error);
      throw error;
    }
  }

  // ── GET /i-care/:id ─────────────────────────────────────────────────────────
  // Retorna un único iCare por su UUID. Lanza 404 si no existe.
  // IMPORTANTE: debe ir DESPUÉS de todas las rutas GET con segmentos estáticos.

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    try {
      return await this.iCareService.findOne(id);
    } catch (error) {
      console.error('Error fetching ICare record:', id, error);
      throw error;
    }
  }

  // ── PATCH /i-care/batch/update ──────────────────────────────────────────────
  // Actualiza en bulk múltiples iCare por sus UUIDs.
  // Aplica los mismos campos a todos los registros del array ids.
  // IMPORTANTE: rutas estáticas ANTES de /:id para evitar conflictos.

  @Patch('batch/update')
  @HttpCode(HttpStatus.OK)
  async batchUpdate(
    @Body('ids') ids: string[],
    @Body('updates') updates: UpdateICareDto,
  ) {
    try {
      if (!ids || ids.length === 0) {
        throw new BadRequestException('No IDs provided for batch update');
      }
      return await this.iCareService.batchUpdate(ids, updates);
    } catch (error) {
      console.error('Error in batch update:', error);
      throw error;
    }
  }

  // ── PATCH /i-care/:id/justify ───────────────────────────────────────────────
  // HR justifica (o rechaza) un iCare.
  // Si justified=true: avanza a IN_PROGRESS y notifica a Staff + Coordinator + Management.
  // Si justified=false: cambia status a REJECTED. El flujo termina aquí, no se envían emails.

  @Patch(':id/justify')
  @UsePipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }))
  @HttpCode(HttpStatus.OK)
  async justify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() justifyDto: JustifyICareDto,
  ) {
    try {
      return await this.iCareService.justify(id, justifyDto);
    } catch (error) {
      console.error('Error justifying ICare record:', id, error);
      throw error;
    }
  }

  // ── PATCH /i-care/:id/commit ────────────────────────────────────────────────
  // El Staff registra su commit sobre el iCare.
  // Si committed=true: guarda fecha/hora/notas y notifica a HR + Coordinator + Management.
  // Si committed=false: limpia los campos de commit sin notificaciones.

  @Patch(':id/commit')
  @UsePipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }))
  @HttpCode(HttpStatus.OK)
  async commit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() commitDto: CommitICareDto,
  ) {
    try {
      return await this.iCareService.commit(id, commitDto);
    } catch (error) {
      console.error('Error committing ICare record:', id, error);
      throw error;
    }
  }

  // ── PATCH /i-care/:id/resolve ───────────────────────────────────────────────
  // HR marca el iCare como resuelto (SOLVED).
  // Registra quién resolvió, fecha, hora y notas opcionales.
  // Notifica a: Staff + Coordinator + Management.

  @Patch(':id/resolve')
  @UsePipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }))
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() resolveDto: ResolveICareDto,
  ) {
    try {
      return await this.iCareService.resolve(id, resolveDto);
    } catch (error) {
      console.error('Error resolving ICare record:', id, error);
      throw error;
    }
  }

  // ── PATCH /i-care/:id ───────────────────────────────────────────────────────
  // Actualiza campos generales de un iCare. No usar para acciones del flujo
  // (justify/commit/resolve) — usar sus endpoints dedicados.
  // IMPORTANTE: debe ir DESPUÉS de todos los PATCH con segmentos estáticos.

  @Patch(':id')
  @UsePipes(new ValidationPipe({
    transform: true,
    skipMissingProperties: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }))
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateICareDto: UpdateICareDto,
  ) {
    try {
      if (Object.keys(updateICareDto).length === 0) {
        throw new BadRequestException('No fields provided for update');
      }
      return await this.iCareService.update(id, updateICareDto);
    } catch (error) {
      console.error('Error updating ICare record:', id, error);
      throw error;
    }
  }

  // ── DELETE /i-care/batch/delete ─────────────────────────────────────────────
  // Elimina en bulk múltiples iCare por sus UUIDs.
  // IMPORTANTE: ruta estática ANTES de /:id para evitar conflictos.

  @Delete('batch/delete')
  @HttpCode(HttpStatus.OK)
  async batchDelete(@Body('ids') ids: string[]) {
    try {
      if (!ids || ids.length === 0) {
        throw new BadRequestException('No IDs provided for batch delete');
      }
      return await this.iCareService.batchDelete(ids);
    } catch (error) {
      console.error('Error in batch delete:', error);
      throw error;
    }
  }

  // ── DELETE /i-care/:id ──────────────────────────────────────────────────────
  // Elimina un iCare por su UUID. Retorna 204 No Content.
  // IMPORTANTE: debe ir DESPUÉS de todas las rutas DELETE con segmentos estáticos.

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    try {
      await this.iCareService.remove(id);
    } catch (error) {
      console.error('Error removing ICare record:', id, error);
      throw error;
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Parsea y valida el query param de urgency.
   * Lanza BadRequestException si el valor no es un ICareUrgency válido.
   */
  private parseUrgency(value?: string): ICareUrgency | undefined {
    if (!value) return undefined;
    if (Object.values(ICareUrgency).includes(value as ICareUrgency)) {
      return value as ICareUrgency;
    }
    throw new BadRequestException(
      `Invalid urgency value "${value}". Allowed: ${Object.values(ICareUrgency).join(', ')}`,
    );
  }

  /**
   * Parsea y valida el query param de status.
   * Lanza BadRequestException si el valor no es un ICareStatus válido.
   */
  private parseStatus(value?: string): ICareStatus | undefined {
    if (!value) return undefined;
    if (Object.values(ICareStatus).includes(value as ICareStatus)) {
      return value as ICareStatus;
    }
    throw new BadRequestException(
      `Invalid status value "${value}". Allowed: ${Object.values(ICareStatus).join(', ')}`,
    );
  }
}