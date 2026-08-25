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

  async uploadExcel(buffer: Buffer): Promise<{
    upserted: number
    skipped: number
    reassigned: { assignment_name: string; from: string; to: string }[]
  }> {
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

    if (pairs.length === 0) return { upserted: 0, skipped, reassigned: [] }

    // Un assignment_name = un solo rate_type activo. Antes se deduplicaba
    // por (assignment_name, rate_type) y un mismo nombre subido bajo 2
    // rate_types distintos (ej. reclasificar "BTW New instructor training"
    // de BTW a TRAINEE) dejaba 2 filas conviviendo en la tabla — cuál
    // "ganaba" en el cálculo de payroll dependía del orden no garantizado
    // de la query. Acá se resuelve a nivel de aplicación: si el nombre se
    // repite en el archivo (misma columna o columnas distintas), gana la
    // ÚLTIMA ocurrencia en orden de lectura (fila↓, columna→).
    const byName = new Map<string, string>()
    for (const p of pairs) byName.set(p.assignment_name, p.rate_type)
    const uniquePairs = Array.from(byName.entries()).map(([assignment_name, rate_type]) => ({
      assignment_name,
      rate_type,
    }))

    // Detectar reasignaciones contra lo que YA había en el catálogo, antes
    // de tocar la tabla, para poder reportarlas y para borrar la fila vieja
    // (el índice único sigue siendo el PAR (assignment_name, rate_type) —
    // sin migración de esquema — así que sin este borrado explícito, insertar
    // el nuevo par no reemplaza al viejo, lo deja como una segunda fila).
    const names = uniquePairs.map((p) => p.assignment_name)
    const existing = names.length
      ? await this.repo
          .createQueryBuilder('art')
          .where('art.assignment_name IN (:...names)', { names })
          .getMany()
      : []
    const existingByName = new Map(existing.map((e) => [e.assignment_name, e.rate_type]))

    const reassigned: { assignment_name: string; from: string; to: string }[] = []
    const toDelete: { assignment_name: string; rate_type: string }[] = []
    for (const p of uniquePairs) {
      const prevType = existingByName.get(p.assignment_name)
      if (prevType && prevType !== p.rate_type) {
        reassigned.push({ assignment_name: p.assignment_name, from: prevType, to: p.rate_type })
        toDelete.push({ assignment_name: p.assignment_name, rate_type: prevType })
      }
    }

    // Borrado de filas viejas en conflicto + upsert, en una sola transacción
    // (o queda todo aplicado, o no queda nada a medias).
    const CHUNK = 100
    await this.repo.manager.transaction(async (trx) => {
      for (const d of toDelete) {
        await trx.delete(AssignmentRateType, { assignment_name: d.assignment_name, rate_type: d.rate_type })
      }
      for (let i = 0; i < uniquePairs.length; i += CHUNK) {
        await trx
          .createQueryBuilder()
          .insert()
          .into(AssignmentRateType)
          .values(uniquePairs.slice(i, i + CHUNK))
          .orUpdate(['updated_at'], ['assignment_name', 'rate_type'])
          .execute()
      }
    })

    return { upserted: pairs.length, skipped, reassigned }
  }

  async findAll(): Promise<AssignmentRateType[]> {
    return this.repo.find({ order: { rate_type: 'ASC', assignment_name: 'ASC' } })
  }

  async findByName(name: string): Promise<AssignmentRateType | null> {
    return this.repo.findOne({ where: { assignment_name: name } })
  }
}
