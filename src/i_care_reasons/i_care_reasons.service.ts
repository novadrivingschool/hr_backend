import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateICareReasonDto } from './dto/create-i_care_reason.dto';
import { UpdateICareReasonDto } from './dto/update-i_care_reason.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ICareReason } from './entities/i_care_reason.entity';
import { Repository } from 'typeorm';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';

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
      { header: 'Description', key: 'description', width: 50 },
    ];

    worksheet.getRow(1).font = { bold: true };

    data.forEach((item) => {
      worksheet.addRow({
        id: item.id,
        category: item.category,
        reason: item.reason,
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
}
