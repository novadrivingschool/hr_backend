import { Injectable, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as ExcelJS from 'exceljs'
import { AssignmentRateType } from './entities/assignment-rate-type.entity'

@Injectable()
export class AssignmentRateTypesService {
  constructor(
    @InjectRepository(AssignmentRateType)
    private readonly repo: Repository<AssignmentRateType>,
  ) {}

  async uploadExcel(buffer: Buffer): Promise<{ upserted: number; skipped: number }> {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const sheet = workbook.worksheets[0]
    if (!sheet) throw new BadRequestException('El archivo Excel no tiene hojas')

    // Row 1 = rate type headers
    const rateTypes: string[] = []
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      rateTypes[col - 1] = String(cell.value ?? '').trim()
    })

    if (rateTypes.filter(Boolean).length === 0) {
      throw new BadRequestException('La fila 1 debe contener los tipos de rate')
    }

    // Parse all name→type pairs from rows 2+
    const pairs: { assignment_name: string; rate_type: string }[] = []
    let skipped = 0

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i)
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const rateType = rateTypes[col - 1]
        const name = String(cell.value ?? '').trim()
        if (rateType && name) {
          pairs.push({ assignment_name: name, rate_type: rateType })
        } else {
          skipped++
        }
      })
    }

    if (pairs.length === 0) return { upserted: 0, skipped }

    // Dedup within the file (same assignment_name + rate_type)
    const dedupMap = new Map<string, { assignment_name: string; rate_type: string }>()
    for (const p of pairs) {
      dedupMap.set(`${p.assignment_name}|${p.rate_type}`, p)
    }
    const uniquePairs = Array.from(dedupMap.values())

    // Upsert: insert or update on conflict
    const CHUNK = 100
    for (let i = 0; i < uniquePairs.length; i += CHUNK) {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(AssignmentRateType)
        .values(uniquePairs.slice(i, i + CHUNK))
        .orUpdate(['updated_at'], ['assignment_name', 'rate_type'])
        .execute()
    }

    return { upserted: pairs.length, skipped }
  }

  async findAll(): Promise<AssignmentRateType[]> {
    return this.repo.find({ order: { rate_type: 'ASC', assignment_name: 'ASC' } })
  }

  async findByName(name: string): Promise<AssignmentRateType | null> {
    return this.repo.findOne({ where: { assignment_name: name } })
  }
}
