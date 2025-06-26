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
  ],
})
export class AppModule { }
