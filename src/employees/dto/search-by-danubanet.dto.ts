import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class SearchByDanubanetDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'El arreglo de nombres no puede estar vacío' })
  @IsString({ each: true, message: 'Cada elemento del arreglo debe ser un texto' })
  danubanet_names: string[];
}