import { IsNotEmpty, IsString } from "class-validator";

export class CreateTypeOfJobDto {
    @IsString()
    @IsNotEmpty()
    name: string;
}
