import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { TimeOffRequest } from 'src/time_off_request/entities/time_off_request.entity';
import { Department } from 'src/departments/entities/department.entity';
import { FixedSchedule } from 'src/fixed_schedule/entities/fixed_schedule.entity';
import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';
import { ScheduleEvent } from 'src/schedule_event/entities/schedule_event.entity';
import { Logbook } from 'src/logbook/entities/logbook.entity';
import { Company } from 'src/company/entities/company.entity';
import { TypeOfSchedule } from 'src/type_of_schedule/entities/type_of_schedule.entity';
import { Position } from 'src/position/entities/position.entity';
import { Gender } from 'src/gender/entities/gender.entity';
import { WorkerCategory } from 'src/worker_category/entities/worker_category.entity';
import { Ethnicity } from 'src/ethnicity/entities/ethnicity.entity';
import { MaritalStatus } from 'src/marital_status/entities/marital_status.entity';
import { TypeOfJob } from 'src/type_of_job/entities/type_of_job.entity';
import { Race } from 'src/race/entities/race.entity';
import { TypeOfStaff } from 'src/type_of_staff/entities/type_of_staff.entity';
import { OfficeSupply } from 'src/office_supplies/entities/office_supply.entity';
import { Facility } from 'src/facilities/entities/facility.entity';
import { Checklist } from 'src/checklist/entities/checklist.entity';
import { ICare } from 'src/i-care/entities/i-care.entity';
import { Employee } from 'src/employees/entities/employee.entity';
import { CrmPermissions } from 'src/employees/entities/crm-permissions.entity';
import { ICareReason } from 'src/i_care_reasons/entities/i_care_reason.entity';
import { EmployeeAccounting } from 'src/employee-accounting/entities/employee-accounting.entity';
import { Timesheet } from 'src/payroll/entities/timesheet.entity';
import { Holiday } from 'src/holidays/entities/holiday.entity';
import { HolidayAuditLog } from 'src/holidays/entities/holiday-audit-log.entity';
import { InstructorVehiclePickupDropoff } from 'src/instructor_vehicle_pickup_dropoff/entities/instructor_vehicle_pickup_dropoff.entity';
import { InstructorRestriction } from 'src/instructor_restrictions/entities/instructor_restriction.entity';
import { InstructorService } from 'src/instructor_services/entities/instructor_service.entity';
import { HappyForm } from 'src/happy_form/entities/happy_form.entity';
import { TimesheetRecord } from 'src/timesheet-records/entities/timesheet-record.entity';
import { InvWarehouse } from 'src/inventory/entities/inv_warehouse.entity';
import { InvItem } from 'src/inventory/entities/inv_item.entity';
import { InvTransfer } from 'src/inventory/entities/inv_transfer.entity';
import { InvDispatch } from 'src/inventory/entities/inv_dispatch.entity';
import { BankDeposit } from 'src/bank-deposits/entities/bank-deposit.entity';
import { InstructorPayroll } from 'src/instructor-payroll/entities/instructor-payroll.entity';
import { TeacherPayroll } from 'src/teacher-payroll/entities/teacher-payroll.entity';
import { AssignmentPayroll } from 'src/assignment-payroll/entities/assignment-payroll.entity';
import { NoShowPayroll } from 'src/no-show-payroll/entities/no-show-payroll.entity';
import { AssignmentRateType } from 'src/assignment-rate-types/entities/assignment-rate-type.entity';
import { Absence } from 'src/absence/entities/absence.entity';

dotenv.config();

console.log('Database Configuration:');
console.log({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  username: process.env.POSTGRES_USER,
  database: process.env.POSTGRES_DB,
});

console.log('Migrations Path:', path.join(__dirname, '/migrations/*.{ts,js}'));


export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: +(process.env.POSTGRES_PORT ?? 25060), // default to 5432 if undefined
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: [
    TimeOffRequest,
    Department,
    FixedSchedule,
    EmployeeSchedule,
    ScheduleEvent,
    Logbook,
    Company,
    TypeOfSchedule,
    Position,
    Gender,
    WorkerCategory,
    Ethnicity,
    MaritalStatus,
    TypeOfJob,
    Race,
    TypeOfStaff,
    OfficeSupply,
    Facility,
    Checklist,
    ICare,
    Employee,
    CrmPermissions,
    ICareReason,
    EmployeeAccounting,
    Timesheet,
    Holiday,
    HolidayAuditLog,
    InstructorVehiclePickupDropoff,
    InstructorRestriction,
    InstructorService,
    HappyForm,
    TimesheetRecord,
    InvWarehouse,
    InvItem,
    InvTransfer,
    InvDispatch,
    BankDeposit,
    InstructorPayroll,
    TeacherPayroll,
    AssignmentPayroll,
    NoShowPayroll,
    AssignmentRateType,
    Absence,
  ],
  migrations: [path.join(__dirname, 'src/migrations/*.{ts,js}')],
  synchronize: false,
  logging: ['query', 'error'],
  ssl: {
    rejectUnauthorized: false,
  },
});

