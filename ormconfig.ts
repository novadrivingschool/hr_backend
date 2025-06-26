import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { TimeOffRequest } from 'src/time_off_request/entities/time_off_request.entity';
import { Schedule } from 'src/schedule/entities/schedule.entity';
import { Department } from 'src/departments/entities/department.entity';
import { FixedSchedule } from 'src/fixed_schedule/entities/fixed_schedule.entity';
import { EmployeeSchedule } from 'src/employee_schedule/entities/employee_schedule.entity';
import { ScheduleEvent } from 'src/schedule_event/entities/schedule_event.entity';
import { Employee } from 'src/employees/entities/employee.entity';
import { Logbook } from 'src/logbook/entities/logbook.entity';

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
    Logbook 
  ],
  migrations: [path.join(__dirname, 'src/migrations/*.{ts,js}')],
  synchronize: false,
  logging: ['query', 'error'],
  ssl: {
    rejectUnauthorized: false,
  },
});

