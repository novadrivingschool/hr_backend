// dto/loa-email.dto.ts
//
// Contrato entre hr_backend y el recurso /loa-email del email_service.
// LOA siempre resuelve destinatarios como objetos de empleado (findByRoles
// o el created_by del propio registro) — a diferencia de absence, nunca
// manda una lista de correos planos.

export interface LoaEmailEmployeeData {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email?: string;
}

export interface LoaEmailFormDataDto {
    id: string;
    loaType: string;
    startDate: string;
    endDate: string;
    returnDate?: string | null;
    notes?: string | null;

    /** Solo en templates de depto (creación / returned_to_work). */
    departmentLabel?: string;
    /** Fragmento HTML (<li>...</li>) — ya armado, el email_service no lo escapa. */
    actionItems?: string;

    actorName?: string;
    submitterName?: string;
    submittedAt?: string;

    employee_data: LoaEmailEmployeeData;
}

export interface LoaEmailRecipientDto {
    employee_number?: string;
    name?: string;
    last_name?: string;
    nova_email: string;
}

export type LoaTemplateName =
    | 'loa_created_submitter'
    | 'loa_created_department'
    | 'loa_department_attended'
    | 'loa_returned_to_work'
    | 'loa_department_reactivated'
    | 'loa_returned_to_work_undo';

export interface SendLoaTemplateDto {
    recipientsObjects: LoaEmailRecipientDto[];
    templateName: LoaTemplateName;
    subject?: string;
    formData: LoaEmailFormDataDto;
    actor?: 'Submitter' | 'Department' | 'HR' | 'System';
}

export interface SendLoaTemplateResponse {
    success: boolean;
    templateName: string;
    subject: string;
    total: number;
}
