import { IsNotEmpty, IsString } from "class-validator";

export class CreateRaceDto {
    @IsString()
    @IsNotEmpty()
    name: string;
}
