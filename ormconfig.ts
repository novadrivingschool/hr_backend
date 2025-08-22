import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { TimeOffRequest } from 'src/time_off_request/entities/time_off_request.entity';
import { Schedule } from 'src/schedule/entities/schedule.entity';
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
    Schedule,
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
  ],
  migrations: [path.join(__dirname, 'src/migrations/*.{ts,js}')],
  synchronize: false,
  logging: ['query', 'error'],
  ssl: {
    rejectUnauthorized: false,
  },
});

