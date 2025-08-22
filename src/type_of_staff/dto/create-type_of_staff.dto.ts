import { IsNotEmpty, IsString } from "class-validator";

export class CreateTypeOfStaffDto {
    @IsString()
    @IsNotEmpty()
    name: string;
}
