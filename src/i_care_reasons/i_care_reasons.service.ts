import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateICareReasonDto } from './dto/create-i_care_reason.dto';
import { UpdateICareReasonDto } from './dto/update-i_care_reason.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ICareReason } from './entities/i_care_reason.entity';
import { Repository } from 'typeorm';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { ICareUrgency } from '../i-care/entities/i-care.entity';
import { ICareOffenseCategory } from './enums/offense-category.enum';

export interface ImportICareReasonsResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string; message: string }[];
}

@Injectable()
export class ICareReasonsService {

  constructor(
    @InjectRepository(ICareReason)
    private readonly repository: Repository<ICareReason>,
  ) { }

  async create(dto: CreateICareReasonDto): Promise<ICareReason> {
    const record = this.repository.create(dto);
    return await this.repository.save(record);
  }

  async findAll(category?: string): Promise<ICareReason[]> {
    const queryCustom = category ? { where: { category } } : {};
    return await this.repository.find(queryCustom);
  }

  async findOne(id: number): Promise<ICareReason> {
    const record = await this.repository.findOneBy({ id });
    if (!record) throw new NotFoundException(`Record with ID ${id} not found`);
    return record;
  }

  async update(id: number, dto: UpdateICareReasonDto): Promise<ICareReason> {
    const record = await this.findOne(id);
    this.repository.merge(record, dto);
    return await this.repository.save(record);
  }

  async remove(id: number): Promise<{ message: string }> {
    const record = await this.findOne(id);
    await this.repository.remove(record);
    return { message: `Record ${id} deleted successfully` };
  }

  async exportExcel(res: Response, category?: string): Promise<void> {
    const data = await this.findAll(category);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Nova API';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('I Care Reasons');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Category', key: 'category', width: 25 },
      { header: 'Reason', key: 'reason', width: 35 },
      { header: 'Urgency', key: 'urgency', width: 15 },
      { header: 'Offense Category', key: 'offense_category', width: 18 },
      { header: 'Description', key: 'description', width: 50 },
    ];

    worksheet.getRow(1).font = { bold: true };

    data.forEach((item) => {
      worksheet.addRow({
        id: item.id,
        category: item.category,
        reason: item.reason,
        urgency: item.urgency ?? '',
        offense_category: item.offense_category ?? '',
        description: item.description ?? '',
      });
    });

    const fileName = category
      ? `i-care-reasons-${category}.xlsx`
      : 'i-care-reasons.xlsx';

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  }

  async importExcel(buffer: Buffer): Promise<ImportICareReasonsResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('The Excel file has no sheets');

    const headerRow = sheet.getRow(1);
    const headers: Record<string, number> = {};
    headerRow.eachCell((cell, col) => {
      const key = String(cell.value ?? '').trim().toLowerCase();
      headers[key] = col;
    });

    const col = (names: string[]): number | null => {
      for (const n of names) if (headers[n] !== undefined) return headers[n];
      return null;
    };

    const colCategory = col(['category', 'categoria', 'categor\u00eda']);
    const colReason = col(['reason', 'razon', 'raz\u00f3n']);
    const colUrgency = col(['urgency', 'urgencia']);
    const colOffenseCategory = col(['offense category', 'offensecategory', 'offense_category']);
    const colDescription = col(['description', 'descripcion', 'descripci\u00f3n']);

    if (!colCategory || !colReason || !colUrgency) {
      throw new BadRequestException(
        'Required columns not found: Category, Reason, Urgency',
      );
    }

    const getCellValue = (row: ExcelJS.Row, colIdx: number | null): string => {
      if (!colIdx) return '';
      const cell = row.getCell(colIdx);
      if (cell.value === null || cell.value === undefined) return '';
      if (typeof cell.value === 'object' && 'richText' in (cell.value as any)) {
        return (cell.value as any).richText.map((r: any) => r.text).join('');
      }
      return String(cell.value).trim();
    };

    const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Acepta tanto las etiquetas en espanol de la planilla de negocio
    // (Baja/Media/Alta/Critica) como el enum interno en ingles que ya usa
    // el resto del modulo (i_care.urgency, ICare.vue).
    const URGENCY_MAP: Record<string, ICareUrgency> = {
      low: ICareUrgency.LOW,
      baja: ICareUrgency.LOW,
      medium: ICareUrgency.MEDIUM,
      media: ICareUrgency.MEDIUM,
      high: ICareUrgency.HIGH,
      alta: ICareUrgency.HIGH,
      critical: ICareUrgency.CRITICAL,
      critica: ICareUrgency.CRITICAL,
    };

    const normalizeUrgency = (raw: string): ICareUrgency | null => {
      const key = stripAccents(raw.trim().toLowerCase());
      return URGENCY_MAP[key] ?? null;
    };

    // Sin mapa ES/EN como urgency (no hay traduccion corta natural para
    // "Class B Serious Offense", etc). Match exacto case-insensitive /
    // sin acentos contra los 3 valores del enum.
    const OFFENSE_CATEGORY_VALUES = Object.values(ICareOffenseCategory) as string[];
    const normalizeOffenseCategory = (raw: string): ICareOffenseCategory | null => {
      if (!raw.trim()) return null;
      const key = stripAccents(raw.trim().toLowerCase());
      const match = OFFENSE_CATEGORY_VALUES.find((v) => stripAccents(v.toLowerCase()) === key);
      return (match as ICareOffenseCategory) ?? null;
    };

    // -- 1. Parsear filas (con forward-fill de Category: la planilla trae
    //       celdas combinadas/vacias para las filas que comparten categoria) --
    const payloads: { category: string; reason: string; urgency: ICareUrgency; offense_category: ICareOffenseCategory | null; description: string | undefined }[] = [];
    const errors: { row: number; reason: string; message: string }[] = [];
    let skipped = 0;
    let lastCategory = '';

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const rawCategory = getCellValue(row, colCategory);
      const reasonText = getCellValue(row, colReason);
      const rawUrgency = getCellValue(row, colUrgency);
      const rawOffenseCategory = colOffenseCategory ? getCellValue(row, colOffenseCategory) : '';
      const description = colDescription ? getCellValue(row, colDescription) : '';

      if (rawCategory) lastCategory = rawCategory;
      const category = lastCategory;

      if (!category && !reasonText && !rawUrgency) continue; // fila vacia

      if (!reasonText) { skipped++; continue; }
      if (!category) {
        errors.push({ row: i, reason: reasonText, message: 'Missing category' });
        continue;
      }

      const urgency = normalizeUrgency(rawUrgency);
      if (!urgency) {
        errors.push({ row: i, reason: reasonText, message: `Unrecognized urgency: "${rawUrgency}"` });
        continue;
      }

      // Offense Category es opcional: columna ausente o celda vacia -> null
      // sin abortar la fila (a diferencia de urgency). Valor presente pero no
      // reconocido -> se reporta como aviso y la fila se guarda igual.
      let offenseCategory: ICareOffenseCategory | null = null;
      if (rawOffenseCategory) {
        offenseCategory = normalizeOffenseCategory(rawOffenseCategory);
        if (!offenseCategory) {
          errors.push({ row: i, reason: reasonText, message: `Unrecognized offense category: "${rawOffenseCategory}" (row saved, field left unset)` });
        }
      }

      payloads.push({ category, reason: reasonText, urgency, offense_category: offenseCategory, description: description || undefined });
    }

    if (payloads.length === 0) {
      return { inserted: 0, updated: 0, skipped, errors };
    }

    // -- 2. Dedup dentro del mismo archivo (por si hay filas repetidas) ------
    const rowKey = (c: string, r: string) => `${c.trim().toLowerCase()}|${r.trim().toLowerCase()}`;
    const dedupMap = new Map<string, typeof payloads[number]>();
    for (const p of payloads) dedupMap.set(rowKey(p.category, p.reason), p);
    const uniquePayloads = Array.from(dedupMap.values());

    // -- 3. Match contra existentes por (category, reason) -------------------
    const existing = await this.repository.find();
    const existingMap = new Map<string, ICareReason>();
    for (const r of existing) existingMap.set(rowKey(r.category, r.reason), r);

    const toInsert: ICareReason[] = [];
    const toUpdate: ICareReason[] = [];

    for (const p of uniquePayloads) {
      const match = existingMap.get(rowKey(p.category, p.reason));
      if (match) {
        match.urgency = p.urgency;
        // No pisar un offense_category/description ya cargado con una celda
        // vacia o no reconocida del Excel (mismo criterio que description).
        if (p.offense_category) match.offense_category = p.offense_category;
        if (p.description) match.description = p.description;
        toUpdate.push(match);
      } else {
        toInsert.push(
          this.repository.create({
            category: p.category,
            reason: p.reason,
            urgency: p.urgency,
            offense_category: p.offense_category,
            description: p.description,
          }),
        );
      }
    }

    // -- 4. Guardar en lotes ---------------------------------------------------
    const CHUNK = 200;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      await this.repository.save(toInsert.slice(i, i + CHUNK));
    }
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      await this.repository.save(toUpdate.slice(i, i + CHUNK));
    }

    return { inserted: toInsert.length, updated: toUpdate.length, skipped, errors };
  }
}
