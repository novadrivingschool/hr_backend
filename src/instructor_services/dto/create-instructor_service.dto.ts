import { IsNotEmpty, IsString } from 'class-validator';

export class CreateInstructorServiceDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}