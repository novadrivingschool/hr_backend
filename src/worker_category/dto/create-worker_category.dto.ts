import { IsNotEmpty, IsString } from "class-validator";

export class CreateWorkerCategoryDto {
    @IsString()
    @IsNotEmpty()
    name: string;
}
