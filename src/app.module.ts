import * as dotenv from 'dotenv';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from './schedule/schedule.module';
import { TimeOffRequestModule } from './time_off_request/time_off_request.module';
import { EmployeesModule } from './employees/employees.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmployeeScheduleModule } from './employee_schedule/employee_schedule.module';
import { FixedScheduleModule } from './fixed_schedule/fixed_schedule.module';
import { ScheduleEventModule } from './schedule_event/schedule_event.module';
import { LogbookModule } from './logbook/logbook.module';
import { CompanyModule } from './company/company.module';
import { TypeOfScheduleModule } from './type_of_schedule/type_of_schedule.module';
import { PositionModule } from './position/position.module';
import { GenderModule } from './gender/gender.module';
import { WorkerCategoryModule } from './worker_category/worker_category.module';
import { EthnicityModule } from './ethnicity/ethnicity.module';
import { MaritalStatusModule } from './marital_status/marital_status.module';
import { TypeOfJobModule } from './type_of_job/type_of_job.module';
import { RaceModule } from './race/race.module';
import { TypeOfStaffModule } from './type_of_staff/type_of_staff.module';
import { OfficeSuppliesModule } from './office_supplies/office_supplies.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { Facility } from './facilities/entities/facility.entity';
import { ChecklistModule } from './checklist/checklist.module';


dotenv.config();
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Hace que las variables estén disponibles en todo el proyecto
      envFilePath: '.env', // Asegúrate de que apunta al archivo correcto
    }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.POSTGRES_HOST,
      port: +(process.env.POSTGRES_PORT ?? 25060),
      database: process.env.POSTGRES_DB,
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      autoLoadEntities: true,
      synchronize: false,
      ssl: {
        rejectUnauthorized: false, // Úsalo solo si tienes certificados autofirmados
      },
      logging: false,
      // ✅ Aquí defines solo las entidades que SÍ quieres que entren en las migraciones
      entities: [
        __dirname + '/time_off_request/entities/*.entity.{ts,js}',
        __dirname + '/schedule/entities/*.entity.{ts,js}',
        __dirname + '/departments/entities/*.entity.{ts,js}',
        __dirname + '/fixed_schedule/entities/*.entity.{ts,js}',
        __dirname + '/Employee_schedule/entities/*.entity.{ts,js}',
        __dirname + '/schedule_event/entities/*.entity.{ts,js}',
        __dirname + '/logbook/entities/*.entity.{ts,js}',
        __dirname + '/company/entities/*.entity.{ts,js}',
        __dirname + '/type_of_schedule/entities/*.entity.{ts,js}',
        __dirname + '/position/entities/*.entity.{ts,js}',
        __dirname + '/gender/entities/*.entity.{ts,js}',
        __dirname + '/worker_category/entities/*.entity.{ts,js}',
        __dirname + '/ethnicity/entities/*.entity.{ts,js}',
        __dirname + '/marital_status/entities/*.entity.{ts,js}',
        __dirname + '/type_of_job/entities/*.entity.{ts,js}',
        __dirname + '/race/entities/*.entity.{ts,js}',
        __dirname + '/type_of_staff/entities/*.entity.{ts,js}',
        __dirname + '/OfficeSupply/entities/*.entity.{ts,js}',
        __dirname + '/Facility/entities/*.entity.{ts,js}',
        __dirname + '/Checklist/entities/*.entity.{ts,js}',        
      ],
    }),
    ScheduleModule,
    TimeOffRequestModule,
    EmployeesModule,
    DepartmentsModule,
    EmployeeScheduleModule,
    FixedScheduleModule,
    ScheduleEventModule,
    LogbookModule,
    CompanyModule,
    TypeOfScheduleModule,
    PositionModule,
    GenderModule,
    WorkerCategoryModule,
    EthnicityModule,
    MaritalStatusModule,
    TypeOfJobModule,
    RaceModule,
    TypeOfStaffModule,
    OfficeSuppliesModule,
    FacilitiesModule,
    Facility,
    ChecklistModule
  ],
})
export class AppModule { }
