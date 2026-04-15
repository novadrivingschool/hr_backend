import { IsNotEmpty, IsString } from 'class-validator';

export class CreateInstructorRestrictionDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}