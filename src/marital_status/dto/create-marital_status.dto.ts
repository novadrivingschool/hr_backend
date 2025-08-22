import { IsNotEmpty, IsString } from "class-validator";

export class CreateMaritalStatusDto {
    @IsString()
    @IsNotEmpty()
    name: string;
}
