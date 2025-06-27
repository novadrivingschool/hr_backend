import { IsNotEmpty, IsObject, IsString } from 'class-validator';
import { LogbookDataBySection, EmployeeData } from '../interfaces/logbook-data.interfaces';


export class CreateLogbookDto {
  @IsObject()
  @IsNotEmpty()
  /* employee_data: {
    name: string;
    last_name: string;
    employee_number: string;
    department: string;
    country: string;
    company: string;
  }; */
  employee_data: EmployeeData;


  @IsString()
  @IsNotEmpty()
  section: LogbookDataBySection['section']; // tipado estricto por sección

  @IsObject()
  @IsNotEmpty()
  data: LogbookDataBySection['data'];
}
