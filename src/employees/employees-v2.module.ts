// src/employees-v2/employees-v2.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesV2Controller } from './employees-v2.controller';
import { EmployeesV2Service } from './employees-v2.service';
import { Employee } from '../employees/entities/employee.entity'; // Apunta a tu Entity actual
import { CrmPermissions } from '../employees/entities/crm-permissions.entity'; 

@Module({
  // Importamos la entidad existente para usarla en este nuevo contexto
  imports: [TypeOrmModule.forFeature([Employee, CrmPermissions])],
  controllers: [EmployeesV2Controller], // Usamos el NUEVO controlador
  providers: [EmployeesV2Service],      // Usamos el NUEVO servicio
  exports: [EmployeesV2Service],
})
export class EmployeesV2Module {}