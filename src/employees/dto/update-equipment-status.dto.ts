import { IsBoolean } from 'class-validator';

export class UpdateEquipmentStatusDto {
    @IsBoolean()
    has_assigned_equipment: boolean;
}
