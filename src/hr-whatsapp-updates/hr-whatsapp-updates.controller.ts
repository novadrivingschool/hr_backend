import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HrWhatsappUpdatesService } from './hr-whatsapp-updates.service';
import { CreateHrWhatsappUpdateDto } from './dto/create-hr-whatsapp-update.dto';
import { UpdateHrWhatsappUpdateDto } from './dto/update-hr-whatsapp-update.dto';
import { CreateHrWhatsappUpdateCommentDto } from './dto/create-hr-whatsapp-update-comment.dto';
import {
  HR_WHATSAPP_ASIGNACION_OPTIONS,
  HR_WHATSAPP_STATUS_OPTIONS,
} from './constants/hr-whatsapp-update.constants';

@Controller('hr-whatsapp-updates')
export class HrWhatsappUpdatesController {
  constructor(private readonly service: HrWhatsappUpdatesService) {}

  // Catálogos para poblar los dropdowns del formulario en el frontend.
  @Get('options')
  getOptions() {
    return {
      asignacion: HR_WHATSAPP_ASIGNACION_OPTIONS,
      status: HR_WHATSAPP_STATUS_OPTIONS,
    };
  }

  // Dataset crudo para el dashboard de analytics (todos los registros del
  // rango + su historial de status). Debe ir ANTES de @Get(':id') para que
  // Nest no interprete "analytics" como un :id.
  @Get('analytics/raw')
  getAnalyticsRaw(@Query('date_from') date_from?: string, @Query('date_to') date_to?: string) {
    return this.service.getAnalyticsData({ date_from, date_to });
  }

  // Diagnóstico del matcher de empleados contra los datos REALES de
  // nova-one-backend en este momento — sin esto hay que adivinar a ciegas
  // por qué un texto puntual no matchea. Ej:
  // GET /hr-whatsapp-updates/debug/match?text=Ana%20Maria%20Gallegos
  // Devuelve totalEmployeesFetched (si da 0, el problema es NOVA_ONE_API /
  // conectividad, no el algoritmo de matching) y el detalle de cada tier.
  // Debe ir ANTES de @Get(':id') por la misma razón que 'analytics/raw'.
  @Get('debug/match')
  async debugMatch(@Query('text') text?: string) {
    if (!text || !text.trim()) {
      throw new BadRequestException('Falta el parámetro "text"');
    }
    return this.service.debugMatchEmployee(text);
  }

  @Post()
  create(@Body() dto: CreateHrWhatsappUpdateDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
    @Query('status') status?: string,
    @Query('asignacion') asignacion?: string,
    @Query('reported') reported?: string,
    @Query('responsable') responsable?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      date_from,
      date_to,
      status,
      asignacion,
      reported,
      responsable,
      search,
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHrWhatsappUpdateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get(':id/comments')
  listComments(@Param('id') id: string) {
    return this.service.listComments(id);
  }

  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body() dto: CreateHrWhatsappUpdateCommentDto) {
    return this.service.addComment(id, dto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    if (!file.originalname.match(/\.(xlsx|xls)$/i)) {
      throw new BadRequestException('Solo se permiten archivos .xlsx o .xls');
    }
    return this.service.uploadExcel(file.buffer);
  }
}
