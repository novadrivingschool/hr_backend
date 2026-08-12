import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { HrWhatsappUpdate } from './entities/hr-whatsapp-update.entity';
import { HrWhatsappUpdateStatusHistory } from './entities/hr-whatsapp-update-status-history.entity';
import { ChangedByDto, CreateHrWhatsappUpdateDto } from './dto/create-hr-whatsapp-update.dto';
import { UpdateHrWhatsappUpdateDto } from './dto/update-hr-whatsapp-update.dto';
import {
  HR_WHATSAPP_ASIGNACION_OPTIONS,
  HR_WHATSAPP_DEFAULT_STATUS,
  HR_WHATSAPP_STATUS_OPTIONS,
} from './constants/hr-whatsapp-update.constants';
import { buildEmployeeIndex, fetchNovaOneEmployees, matchEmployee } from './utils/employee-matcher.util';

export interface FindAllHrWhatsappUpdatesFilters {
  date_from?: string;
  date_to?: string;
  status?: string;
  asignacion?: string;
  responsable?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ImportRowError {
  row: number;
  reason: string;
}

@Injectable()
export class HrWhatsappUpdatesService {
  private readonly logger = new Logger(HrWhatsappUpdatesService.name);

  // Rango unicode de diacríticos combinantes (U+0300–U+036F), construido con
  // fromCharCode para evitar problemas de encoding al escribir el literal
  // "̀-ͯ" directamente en el código fuente.
  private static readonly DIACRITICS_REGEX = new RegExp(
    `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
    'g',
  );

  constructor(
    @InjectRepository(HrWhatsappUpdate)
    private readonly repo: Repository<HrWhatsappUpdate>,
    @InjectRepository(HrWhatsappUpdateStatusHistory)
    private readonly historyRepo: Repository<HrWhatsappUpdateStatusHistory>,
  ) {}

  // Inserta una fila de historial. Nunca lanza — un fallo acá no debe tumbar
  // el create/update principal, solo se loguea (el dashboard simplemente
  // tendría un dato menos si esto llegara a fallar).
  private async recordStatusChange(
    hrWhatsappUpdateId: string,
    previousStatus: string | null,
    newStatus: string,
    changedBy?: ChangedByDto,
  ): Promise<void> {
    try {
      const entry = this.historyRepo.create({
        hr_whatsapp_update_id: hrWhatsappUpdateId,
        previous_status: previousStatus,
        new_status: newStatus,
        changed_by_name: changedBy
          ? `${changedBy.name || ''} ${changedBy.last_name || ''}`.trim() || null
          : null,
        changed_by_employee_number: changedBy?.employee_number ?? null,
      });
      await this.historyRepo.save(entry);
    } catch (error) {
      this.logger.error(
        `No se pudo registrar el historial de status de ${hrWhatsappUpdateId}: ${error.message}`,
        error.stack,
      );
    }
  }

  // "Name" es obligatorio: o es un empleado real (reported_employee_number +
  // reported_name), o es texto libre (reported_other, ej. "CS chat").
  private validateReportedGroup(dto: Partial<CreateHrWhatsappUpdateDto>) {
    const hasEmployee = !!dto.reported_employee_number && !!dto.reported_name;
    const hasOther = !!(dto.reported_other && dto.reported_other.trim());

    if (!hasEmployee && !hasOther) {
      throw new BadRequestException(
        'Debe indicar quién reportó: seleccione un empleado o escriba un valor libre (reported_other)',
      );
    }
  }

  async create(dto: CreateHrWhatsappUpdateDto) {
    this.validateReportedGroup(dto);

    try {
      const { changed_by, ...rest } = dto;
      const entity = this.repo.create({
        ...rest,
        status: dto.status ?? HR_WHATSAPP_DEFAULT_STATUS,
      });
      const saved = await this.repo.save(entity);
      await this.recordStatusChange(saved.id, null, saved.status, changed_by);
      this.logger.log(`HR WhatsApp update created: ${saved.id}`);
      return saved;
    } catch (error) {
      this.logger.error(`Error creating HR WhatsApp update: ${error.message}`, error.stack);
      throw new BadRequestException('No se pudo crear el registro');
    }
  }

  async findAll(filters: FindAllHrWhatsappUpdatesFilters = {}) {
    const {
      date_from,
      date_to,
      status,
      asignacion,
      responsable,
      search,
      page = 1,
      limit = 50,
    } = filters;

    const qb = this.repo
      .createQueryBuilder('u')
      .orderBy('u.entry_date', 'DESC')
      .addOrderBy('u.created_at', 'DESC');

    if (date_from) qb.andWhere('u.entry_date >= :date_from', { date_from });
    if (date_to) qb.andWhere('u.entry_date <= :date_to', { date_to });
    if (status) qb.andWhere('u.status = :status', { status });
    if (asignacion) qb.andWhere('u.asignacion = :asignacion', { asignacion });

    if (responsable) {
      qb.andWhere(
        '(u.responsable_name ILIKE :responsable OR u.responsable_last_name ILIKE :responsable OR u.responsable_other ILIKE :responsable)',
        { responsable: `%${responsable}%` },
      );
    }

    if (search) {
      qb.andWhere(
        `(u.reported_name ILIKE :search OR u.reported_last_name ILIKE :search OR u.reported_other ILIKE :search
          OR u.responsable_name ILIKE :search OR u.responsable_last_name ILIKE :search OR u.responsable_other ILIKE :search
          OR u.question ILIKE :search OR u.observations ILIKE :search)`,
        { search: `%${search}%` },
      );
    }

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const result = await this.repo.findOneBy({ id });

    if (!result) {
      this.logger.warn(`HR WhatsApp update ${id} not found`);
      throw new NotFoundException(`Registro ${id} no encontrado`);
    }

    return result;
  }

  async update(id: string, dto: UpdateHrWhatsappUpdateDto) {
    const current = await this.findOne(id);

    // Solo validar el grupo "reported" si el PATCH efectivamente lo toca —
    // si no vino ninguno de los 4 campos, no hay nada que revalidar.
    const touchesReported =
      dto.reported_employee_number !== undefined ||
      dto.reported_name !== undefined ||
      dto.reported_other !== undefined;

    if (touchesReported) {
      this.validateReportedGroup({
        reported_employee_number: dto.reported_employee_number ?? current.reported_employee_number ?? undefined,
        reported_name: dto.reported_name ?? current.reported_name ?? undefined,
        reported_other: dto.reported_other ?? current.reported_other ?? undefined,
      } as Partial<CreateHrWhatsappUpdateDto>);
    }

    const { changed_by, ...rest } = dto;
    const statusChanged = rest.status !== undefined && rest.status !== current.status;
    const previousStatus = current.status;

    try {
      const updated = this.repo.merge(current, rest);
      const saved = await this.repo.save(updated);

      if (statusChanged) {
        await this.recordStatusChange(id, previousStatus, saved.status, changed_by);
      }

      this.logger.log(`HR WhatsApp update ${id} updated`);
      return saved;
    } catch (error) {
      this.logger.error(`Error updating HR WhatsApp update ${id}`, error.stack);
      throw new BadRequestException('No se pudo actualizar el registro');
    }
  }

  async remove(id: string) {
    const current = await this.findOne(id);
    await this.repo.remove(current);
    this.logger.log(`HR WhatsApp update ${id} deleted`);
    return { message: 'Registro eliminado correctamente', id };
  }

  // ─────────────────────────────────────────────────────────────────────
  // IMPORTACIÓN MASIVA DESDE EXCEL
  // Replica el formato de la hoja "HR Whatsapp Updates" (Google Sheets):
  //  Date | Name | Question/ concern | Responsable | Asignación | Status |
  //  Observations | Seguimiento | Asana Link
  //
  // "Name" y "Responsable" vienen como texto plano en el Excel (a veces solo
  // un nombre, a veces nombre+apellido en cualquier orden). Se matchean
  // contra la tabla real de empleados en nova-one-backend; si no hay match
  // confiable, se guardan tal cual en *_other para revisión manual.
  // ─────────────────────────────────────────────────────────────────────
  async uploadExcel(buffer: Buffer): Promise<{
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    unmatchedReported: number;
    unmatchedResponsable: number;
    // Textos originales (deduplicados) que NO se pudieron matchear contra
    // ningún empleado y quedaron guardados en *_other. Sirve para revisar
    // rápido después de importar si quedaron casos por apodos (ej. "Vane"
    // cuando el empleado está registrado como "Vanessa") o errores de tipeo
    // (ej. "Martines" vs "Martinez") — el matcher es deliberadamente estricto
    // (sin aproximación difusa) para no asignar mal un registro.
    unmatchedReportedNames: string[];
    unmatchedResponsableNames: string[];
    errors: ImportRowError[];
  }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('El archivo Excel no tiene hojas');

    const headerRow = sheet.getRow(1);
    const headers: Record<string, number> = {};
    headerRow.eachCell((cell, col) => {
      const key = String(cell.value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(HrWhatsappUpdatesService.DIACRITICS_REGEX, ''); // quita diacríticos: "asignación" -> "asignacion"
      headers[key] = col;
    });

    const col = (names: string[]): number | null => {
      for (const n of names) if (headers[n] !== undefined) return headers[n];
      return null;
    };

    const colDate = col(['date']);
    const colName = col(['name']);
    const colQuestion = col(['question/ concern', 'question/concern', 'question', 'concern']);
    const colResponsable = col(['responsable']);
    const colAsignacion = col(['asignacion']);
    const colStatus = col(['status']);
    const colObservations = col(['observations']);
    const colSeguimiento = col(['seguimiento']);
    const colAsanaLink = col(['asana link', 'asana_link']);

    if (!colDate || !colName || !colQuestion) {
      throw new BadRequestException(
        'Columnas requeridas no encontradas: Date, Name, Question/ concern',
      );
    }

    const EXCEL_ZERO_DATE = '1899-12-30';

    // La hoja de origen guarda las fechas en formato dd/mm/yyyy.
    const getCellDate = (row: ExcelJS.Row, colIdx: number | null): string => {
      if (!colIdx) return '';
      const cell = row.getCell(colIdx);
      if (cell.value === null || cell.value === undefined) return '';
      if (cell.value instanceof Date) {
        const iso = cell.value.toISOString().split('T')[0];
        return iso === EXCEL_ZERO_DATE ? '' : iso;
      }
      const str = String(cell.value).trim();
      if (!str || str === EXCEL_ZERO_DATE) return '';
      const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (m) {
        const day = m[1].padStart(2, '0');
        const month = m[2].padStart(2, '0');
        const year = m[3].length === 2 ? `20${m[3]}` : m[3];
        return `${year}-${month}-${day}`;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
      return '';
    };

    const getCellValue = (row: ExcelJS.Row, colIdx: number | null): string => {
      if (!colIdx) return '';
      const cell = row.getCell(colIdx);
      if (cell.value === null || cell.value === undefined) return '';
      if (cell.value instanceof Date) {
        const iso = cell.value.toISOString().split('T')[0];
        return iso === EXCEL_ZERO_DATE ? '' : iso;
      }
      if (typeof cell.value === 'object' && 'richText' in (cell.value as any)) {
        return (cell.value as any).richText.map((r: any) => r.text).join('');
      }
      if (typeof cell.value === 'object' && 'text' in (cell.value as any)) {
        return String((cell.value as any).text ?? '').trim();
      }
      return String(cell.value).trim();
    };

    // Trae la lista completa de empleados UNA sola vez y arma el índice de
    // matching — mismo patrón que ya usa ip-summary.service.ts.
    const employees = await fetchNovaOneEmployees();
    const employeeIndex = buildEmployeeIndex(employees);
    if (!employees.length) {
      this.logger.warn('No se pudo obtener la lista de empleados — todas las filas caerán a *_other sin matchear');
    }

    const entities: Partial<HrWhatsappUpdate>[] = [];
    const errors: ImportRowError[] = [];
    let skipped = 0;
    let unmatchedReported = 0;
    let unmatchedResponsable = 0;
    const unmatchedReportedNames = new Set<string>();
    const unmatchedResponsableNames = new Set<string>();

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);

      const entryDate = getCellDate(row, colDate);
      const rawName = getCellValue(row, colName).trim();
      const question = getCellValue(row, colQuestion).trim();

      if (!entryDate && !rawName && !question) continue; // fila vacía, se ignora sin contar como error

      if (!entryDate || !rawName || !question) {
        skipped++;
        errors.push({ row: i, reason: 'Faltan campos requeridos (Date, Name o Question/ concern)' });
        continue;
      }

      const rawAsignacion = getCellValue(row, colAsignacion).trim();
      const asignacion = HR_WHATSAPP_ASIGNACION_OPTIONS.includes(rawAsignacion as any)
        ? rawAsignacion
        : null;

      if (rawAsignacion && !asignacion) {
        skipped++;
        errors.push({ row: i, reason: `Asignación "${rawAsignacion}" no es una opción válida` });
        continue;
      }

      if (!asignacion) {
        skipped++;
        errors.push({ row: i, reason: 'Asignación es requerida' });
        continue;
      }

      const rawStatus = getCellValue(row, colStatus).trim();
      const status = rawStatus && HR_WHATSAPP_STATUS_OPTIONS.includes(rawStatus as any)
        ? rawStatus
        : HR_WHATSAPP_DEFAULT_STATUS;

      if (rawStatus && status !== rawStatus) {
        errors.push({ row: i, reason: `Status "${rawStatus}" no es válido, se usó "${HR_WHATSAPP_DEFAULT_STATUS}" por defecto` });
      }

      // ── Match de "Name" contra empleados ──────────────────────────────
      const reportedMatch = matchEmployee(rawName, employeeIndex);
      if (!reportedMatch) {
        unmatchedReported++;
        unmatchedReportedNames.add(rawName);
      }

      // ── Match de "Responsable" contra empleados (opcional) ────────────
      const rawResponsable = getCellValue(row, colResponsable).trim();
      const responsableMatch = rawResponsable ? matchEmployee(rawResponsable, employeeIndex) : null;
      if (rawResponsable && !responsableMatch) {
        unmatchedResponsable++;
        unmatchedResponsableNames.add(rawResponsable);
      }

      entities.push({
        entry_date: entryDate,
        reported_employee_number: reportedMatch?.employee_number ?? null,
        reported_name: reportedMatch?.name ?? null,
        reported_last_name: reportedMatch?.last_name ?? null,
        reported_other: reportedMatch ? null : rawName,
        question,
        responsable_employee_number: responsableMatch?.employee_number ?? null,
        responsable_name: responsableMatch?.name ?? null,
        responsable_last_name: responsableMatch?.last_name ?? null,
        responsable_other: !responsableMatch && rawResponsable ? rawResponsable : null,
        asignacion,
        status,
        observations: getCellValue(row, colObservations) || null,
        seguimiento: getCellValue(row, colSeguimiento) || null,
        asana_link: getCellValue(row, colAsanaLink) || null,
      });
    }

    if (!entities.length) {
      throw new BadRequestException('No se encontraron filas válidas para importar');
    }

    // Nota: el historial de status de las filas importadas arranca en el
    // momento de la importación (changed_at = ahora), no en la fecha real del
    // Excel (que no se conoce) — el dashboard de analytics debe tratar estas
    // filas como "sin historial confiable" para métricas de tiempo de
    // resolución, no solo para conteos/distribuciones.
    const CHUNK = 200;
    let importedRows = 0;
    for (let i = 0; i < entities.length; i += CHUNK) {
      const chunk = entities.slice(i, i + CHUNK).map((e) => this.repo.create(e));
      const saved = await this.repo.save(chunk);
      importedRows += saved.length;

      const historyRows = saved.map((row) =>
        this.historyRepo.create({
          hr_whatsapp_update_id: row.id,
          previous_status: null,
          new_status: row.status,
          changed_by_name: null,
          changed_by_employee_number: null,
        }),
      );
      try {
        await this.historyRepo.save(historyRows);
      } catch (error) {
        this.logger.error(`No se pudo registrar historial inicial del lote importado: ${error.message}`, error.stack);
      }
    }

    this.logger.log(
      `Excel importado: ${importedRows} filas creadas, ${skipped} omitidas, ` +
        `${unmatchedReported} "Name" sin matchear, ${unmatchedResponsable} "Responsable" sin matchear`,
    );

    return {
      totalRows: sheet.rowCount - 1,
      importedRows,
      skippedRows: skipped,
      unmatchedReported,
      unmatchedResponsable,
      unmatchedReportedNames: Array.from(unmatchedReportedNames).sort(),
      unmatchedResponsableNames: Array.from(unmatchedResponsableNames).sort(),
      errors,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // ANALYTICS
  // Devuelve TODOS los registros del rango (sin paginar) con su historial de
  // status completo. Siguiendo el patrón ya usado en el repo (ver
  // EmploymentAnalytics.vue / AbsenceAnalytics.vue): el backend entrega datos
  // crudos y el frontend calcula/agrega todas las métricas — acá no se hace
  // ningún cálculo, solo se arma el dataset para no pagar el join del
  // historial en los listados normales (findAll).
  // ─────────────────────────────────────────────────────────────────────
  async getAnalyticsData(filters: { date_from?: string; date_to?: string } = {}) {
    const { date_from, date_to } = filters;

    const qb = this.repo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.statusHistory', 'h')
      .orderBy('u.entry_date', 'ASC')
      .addOrderBy('u.created_at', 'ASC')
      .addOrderBy('h.changed_at', 'ASC');

    if (date_from) qb.andWhere('u.entry_date >= :date_from', { date_from });
    if (date_to) qb.andWhere('u.entry_date <= :date_to', { date_to });

    return qb.getMany();
  }
}
