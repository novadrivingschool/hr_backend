// dto/activity-request-email.dto.ts

export type StatusType = 'Pending' | 'Approved' | 'Not Approved' | 'Cancelled';

export interface EmployeeDataDto {
    name: string;
    last_name: string;
    employee_number: string;
    multi_department: string[];
    multi_location: string[];
    multi_company: string[];
    nova_email?: string;
}

export interface ApprovalDto {
    approved: boolean;
    by: string;
    date: string;
    time: string;
}

export interface ActivityRequestSavedDto {
    id: string;
    punchType: string;
    requestedDate: string;
    reason: string;
    status?: StatusType;
    employee_data: EmployeeDataDto;
    coordinator_approval?: ApprovalDto;
    hr_approval?: ApprovalDto;
    coordinator_comments?: string;
    hr_comments?: string;
    cancellation_info?: {
        cancelled_by: string;
        role: string;
        reason?: string;
        date: string;
        time: string;
    } | null;
    createdDate?: string;
    createdTime?: string;
}

export interface RecipientDto {
    employee_number: string;
    last_name: string;
    name: string;
    nova_email: string;
}

export interface SendActivityRequestTemplateDto {
    recipients?: string[];
    templateName: string;
    subject?: string;
    formData: ActivityRequestSavedDto;
    actor?: 'HR' | 'Coordinator' | 'System' | 'Staff' | 'Management';
}

export interface SendActivityRequestTemplateObjDto {
    recipientsObjects: RecipientDto[];
    templateName: string;
    subject?: string;
    formData: ActivityRequestSavedDto;
    actor?: 'HR' | 'Coordinator' | 'System' | 'Staff' | 'Management';
}

export interface SendTemplateResponse {
    success: boolean;
    templateName: string;
    subject: string;
    total: number;
}
