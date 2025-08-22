import { IsNotEmpty, IsString } from "class-validator";

export class CreateTypeOfScheduleDto {
    @IsString()
    @IsNotEmpty()
    name: string;
}
