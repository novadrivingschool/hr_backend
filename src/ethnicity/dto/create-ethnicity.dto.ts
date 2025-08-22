import { IsNotEmpty, IsString } from "class-validator";

export class CreateEthnicityDto {
    @IsString()
    @IsNotEmpty()
    name: string;
}
