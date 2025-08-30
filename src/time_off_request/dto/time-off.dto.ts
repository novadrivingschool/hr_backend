// dto/time-off.dto.ts

export type TimeType = 'Days' | 'Hours';

// Status sí lo dejamos restringido porque es fijo en el flujo
export type StatusType = 'Pending' | 'Approved' | 'Not Approved';

export interface EmployeeDataDto {
    name: string;
    last_name: string;
    employee_number: string;
    multi_department: string[];
    country: string;
    multi_company: string[];
    nova_email?: string;
}

export interface ApprovalDto {
    approved: boolean;
    by: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:mm:ss
}

export interface CreateTimeOffRequestSavedDto {
    id: string;
    timeType: TimeType;

    // Days flow
    startDate?: string | null;
    endDate?: string | null;

    // Hours flow
    hourDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;

    /** 
     * Request Type (puede ser cualquier string)
     * Ejemplos: "Vacation", "Personal Leave", "Other", "Special Case", etc.
     */
    requestType: string;

    otherDescription?: string;
    comments?: string;
    dateOrRange: string;

    status?: StatusType;

    employee_data: EmployeeDataDto;

    coordinator_approval?: ApprovalDto;
    hr_approval?: ApprovalDto;

    coordinator_comments?: string;
    hr_comments?: string;
}

export interface RecipientDto {
    employee_number: string;
    last_name: string;
    name: string;
    nova_email: string;
}

export interface SendTimeOffTemplateDto {
    recipients?: string[];
    templateName: string;
    subject?: string;
    formData: CreateTimeOffRequestSavedDto;
}

export interface SendTimeOffTemplateObjDto {
    recipientsObjects: RecipientDto[];
    templateName: string;
    subject?: string;
    formData: CreateTimeOffRequestSavedDto;
}

export interface SendTemplateResponse {
    success: boolean;
    templateName: string;
    subject: string;
    total: number;
}
