import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateDanubanetDto {
  @IsString()
  @IsNotEmpty()
  danubanet_name_1: string;
}