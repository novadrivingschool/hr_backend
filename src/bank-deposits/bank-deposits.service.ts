import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm'
import axios from 'axios'
import { BankDeposit } from './entities/bank-deposit.entity'
import { CreateBankDepositDto } from './dto/create-bank-deposit.dto'
import { UpdateBankDepositDto } from './dto/update-bank-deposit.dto'
import { UpdateAccountingStatusDto } from './dto/update-accounting-status.dto'
import { QueryBankDepositDto } from './dto/query-bank-deposit.dto'

@Injectable()
export class BankDepositsService {
  private readonly logger = new Logger(BankDepositsService.name)

  constructor(
    @InjectRepository(BankDeposit)
    private readonly repo: Repository<BankDeposit>,
  ) {}

  async create(dto: CreateBankDepositDto) {
    const entity = this.repo.create(dto)
    const saved  = await this.repo.save(entity)

    // Fire-and-forget: notify accounting admins
    setImmediate(() => {
      this.triggerEmail('created', saved.id).catch(err =>
        this.logger.error(`❌ Email trigger failed (created) for ${saved.id}: ${err?.message}`)
      )
    })

    return saved
  }

  async findAll(query: QueryBankDepositDto) {
    const page  = query.page  || 1
    const limit = query.limit || 50
    const skip  = (page - 1) * limit

    const where: any = { deleted: false }

    if (query.location)        where.location        = query.location
    if (query.employee_number) where.employee_number = query.employee_number

    if (query.date_from && query.date_to) {
      where.date = Between(query.date_from, query.date_to)
    } else if (query.date_from) {
      where.date = MoreThanOrEqual(query.date_from)
    } else if (query.date_to) {
      where.date = LessThanOrEqual(query.date_to)
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    })

    const filtered = query.search
      ? items.filter(r =>
          [r.location, r.receipt_number, r.fullName, r.employee_number, String(r.amount), r.notes]
            .some(v => String(v || '').toLowerCase().includes(query.search!.toLowerCase())),
        )
      : items

    return { items: filtered, total, page, limit }
  }

  async findByEmployee(employee_number: string, query: QueryBankDepositDto) {
    return this.findAll({ ...query, employee_number })
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id, deleted: false } })
    if (!item) throw new NotFoundException(`Bank deposit ${id} not found`)
    return item
  }

  async update(id: string, dto: UpdateBankDepositDto) {
    const item = await this.findOne(id)
    Object.assign(item, dto)
    return await this.repo.save(item)
  }

  async updateAccountingStatus(id: string, dto: UpdateAccountingStatusDto) {
    const item = await this.findOne(id)
    Object.assign(item, {
      status:                      dto.status,
      accounting_comments:         dto.accounting_comments,
      accounting_employee_number:  dto.accounting_employee_number,
      accounting_fullName:         dto.accounting_fullName,
      accounting_files:            dto.accounting_files ?? item.accounting_files,
    })
    const saved = await this.repo.save(item)

    // Fire-and-forget: notify the staff member that their deposit was verified
    setImmediate(() => {
      this.triggerEmail('verified', id).catch(err =>
        this.logger.error(`❌ Email trigger failed (verified) for ${id}: ${err?.message}`)
      )
    })

    return saved
  }

  async remove(id: string) {
    const item = await this.findOne(id)
    item.deleted = true
    await this.repo.save(item)
    return { id, deleted: true }
  }

  // ── Email trigger ───────────────────────────────────────────────────────────

  private async triggerEmail(event: 'created' | 'verified', id: string): Promise<void> {
    const base = process.env.EMAIL_SERVICE_BASE
    if (!base) {
      this.logger.warn('EMAIL_SERVICE_BASE not configured — skipping bank deposit email')
      return
    }

    const url = `${base.replace(/\/+$/, '')}/bank-deposits-email/${event}/${encodeURIComponent(id)}`
    this.logger.log(`📧 POST ${url}`)

    const response = await axios.post(url, {}, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15_000,
    })

    this.logger.log(`✅ Email service responded ${response.status} for ${event} — deposit ${id}`)
  }
}
