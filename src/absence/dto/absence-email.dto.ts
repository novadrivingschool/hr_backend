// dto/absence-email.dto.ts
//
// Contrato entre hr_backend y el recurso /absence-email del email_service.

export type AbsenceTimeType = 'Days' | 'Hours';
export type AbsenceStatusType = 'Registered' | 'Cancelled';

export interface AbsenceEmployeeData {
    name: string;
    last_name: string;
    employee_number: string;
    multi_department: string[];
    multi_location: string[];
    multi_company: string[];
    nova_email?: string;
}

export interface AbsenceSavedDto {
    id: string;
    timeType: AbsenceTimeType;

    // Days
    startDate?: string | null;
    endDate?: string | null;

    // Hours
    hourDate?: string | null;
    startTime?: string | null;
    /** null = outage abierto ('No Internet' / 'Power Outage' sin hora de fin). */
    endTime?: string | null;

    /** Razón de la absence — uno de OUTAGE_REASONS. */
    requestType: string;

    comments?: string | null;
    dateOrRange: string;

    status?: AbsenceStatusType;

    employee_data: AbsenceEmployeeData;

    cancellation_info?: {
        cancelled_by: string;
        role: string;
        reason?: string;
        date: string;
        time: string;
    } | null;

    is_paid?: boolean;
    recovery_required?: boolean;

    createdDate?: string;
    createdTime?: string;
}

export interface AbsenceRecipientDto {
    employee_number: string;
    name: string;
    last_name: string;
    nova_email: string;
}

/** Envío por lista de correos planos (supervisors, staff). */
export interface SendAbsenceTemplateDto {
    recipients: string[];
    templateName: string;
    subject?: string;
    formData: AbsenceSavedDto;
    actor?: 'Staff' | 'HR' | 'Coordinator' | 'Management' | 'System';
}

/** Envío por objetos de empleado (HR, management — resueltos por permiso). */
export interface SendAbsenceTemplateObjDto {
    recipientsObjects: AbsenceRecipientDto[];
    templateName: string;
    subject?: string;
    formData: AbsenceSavedDto;
    actor?: 'Staff' | 'HR' | 'Coordinator' | 'Management' | 'System';
}

export interface SendAbsenceTemplateResponse {
    success: boolean;
    templateName: string;
    subject: string;
    total: number;
}
