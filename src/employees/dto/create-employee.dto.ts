import { Type } from 'class-transformer';
import { 
  IsString, 
  IsOptional, 
  IsDateString, 
  IsNotEmpty, 
  IsBoolean, 
  IsNumber, 
  IsArray, 
  IsObject,
  IsIn,
  MaxLength
} from 'class-validator';

// Usamos la misma interfaz que definiste en la Entity
export interface SupervisorRef {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email?: string;
    __label?: string;
}

export class CreateEmployeeDto {
  @IsOptional()
  @IsString()
  employee_number: string;

  @IsOptional()
  @IsIn(['Active', 'Inactive'])
  status?: 'Active' | 'Inactive';

  // ==========================================
  // TAB 0: JOB INFORMATION
  // ==========================================
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  multi_company?: string[];

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  personal_email?: string;

  @IsOptional()
  @IsString()
  country_code?: string;

  @IsOptional()
  @IsString()
  personal_phone?: string;

  @IsOptional()
  @IsString()
  nova_email?: string;

  @IsOptional()
  @IsDateString()
  hire_date?: string | Date;

  @IsOptional()
  @IsString()
  job_change_reason?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  multi_type_of_job?: string[];

  @IsOptional()
  @IsString()
  worker_category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  multi_position?: string[];

  @IsOptional()
  @IsString()
  driver_license?: string;

  @IsOptional()
  @IsDateString()
  driver_license_expiration?: string | Date;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  multi_department?: string[];

  @IsOptional()
  @IsArray()
  supervisors?: SupervisorRef[];

  @IsOptional()
  @IsString()
  activity_details?: string;

  @IsOptional()
  @IsString()
  work_schedule?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  multi_location?: string[];

  @IsOptional()
  @IsString()
  observations?: string;

  // ==========================================
  // TAB 1: ACCOUNTING
  // ==========================================
  @IsOptional()
  @IsString()
  type_of_income?: string;

  @IsOptional()
  @IsString()
  pay_frequency?: string;

  @IsOptional()
  @IsNumber()
  rate_office_staff?: number;

  @IsOptional()
  @IsString()
  receives_comissions?: string;

  @IsOptional()
  @IsNumber()
  commissions?: number;

  @IsOptional()
  @IsString()
  type_of_schedule?: string;

  @IsOptional()
  @IsString()
  payment_method?: string;

  @IsOptional()
  @IsNumber()
  assignment_rate?: number;

  @IsOptional()
  @IsNumber()
  btw_rate?: number;

  @IsOptional()
  @IsNumber()
  class_c_rate?: number;

  @IsOptional()
  @IsNumber()
  cr_rate?: number;

  @IsOptional()
  @IsNumber()
  ss_rate?: number;

  @IsOptional()
  @IsNumber()
  corporate_rate?: number;

  @IsOptional()
  @IsNumber()
  mechanics_rate?: number;

  @IsOptional()
  @IsNumber()
  office_maintenance?: number;

  @IsOptional()
  @IsNumber()
  amount_bonus?: number;

  @IsOptional()
  @IsString()
  bonus_type?: string;

  @IsOptional()
  @IsString()
  type_of_comissions?: string;

  // ==========================================
  // TAB 2: OTHER DATA
  // ==========================================
  @IsOptional()
  @IsString()
  phone_8x8?: string;

  @IsOptional()
  @IsString()
  extension_phone_8x8?: string;

  @IsOptional()
  @IsString()
  danubanet_name_1?: string;

  @IsOptional()
  @IsString()
  danubanet_name_2?: string;

  @IsOptional()
  @IsString()
  assigned_vehicle?: string;

  @IsOptional()
  @IsString()
  vehicle_name?: string;

  // ==========================================
  // TAB 3: PERSONAL INFORMATION
  // ==========================================
  @IsOptional()
  @IsDateString()
  birthdate?: string | Date;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  id_type?: string;

  @IsOptional()
  @IsString()
  id_number?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  postal_code?: string;

  @IsOptional()
  @IsString()
  marital_status?: string;

  @IsOptional()
  @IsDateString()
  since?: string | Date;

  @IsOptional()
  @IsString()
  ethnicity?: string;

  @IsOptional()
  @IsString()
  race?: string;

  @IsOptional()
  @IsString()
  medicare?: string;

  @IsOptional()
  @IsString()
  medicaid?: string;

  @IsOptional()
  @IsString()
  tabacco_user?: string;

  @IsOptional()
  @IsString()
  veteran?: string;

  @IsOptional()
  @IsString()
  name_emergency?: string;

  @IsOptional()
  @IsString()
  last_name_emergency?: string;

  @IsOptional()
  @IsString()
  phone_emergency?: string;

  @IsOptional()
  @IsString()
  address_emergency?: string;

  @IsOptional()
  @IsString()
  relationship_emergency?: string;

  // ==========================================
  // TAB 4: DOCUMENTS (URLs / Booleans)
  // ==========================================
  @IsOptional()
  @IsBoolean()
  form_status?: boolean;

  @IsOptional()
  @IsBoolean()
  recentphotourl?: boolean;

  @IsOptional()
  @IsBoolean()
  bachellordegreeurl?: boolean;

  @IsOptional()
  @IsBoolean()
  resumeurl?: boolean;

  @IsOptional()
  @IsBoolean()
  idurl?: boolean;

  @IsOptional()
  @IsBoolean()
  passporturl?: boolean;

  @IsOptional()
  @IsBoolean()
  tax_certificateurl?: boolean;

  @IsOptional()
  @IsBoolean()
  invoice_exampleurl?: boolean;

  @IsOptional()
  @IsBoolean()
  bank_certificateurl?: boolean;

  @IsOptional()
  @IsBoolean()
  work_authorizationurl?: boolean;

  @IsOptional()
  @IsBoolean()
  w4url?: boolean;

  @IsOptional()
  @IsBoolean()
  i9url?: boolean;

  @IsOptional()
  @IsBoolean()
  ilurl?: boolean;

  @IsOptional()
  @IsBoolean()
  w9url?: boolean;

  @IsOptional()
  @IsBoolean()
  ssnurl?: boolean;

  @IsOptional()
  @IsBoolean()
  job_offerurl?: boolean;

  // ==========================================
  // TAB 5: POLICIES (URLs / Booleans)
  // ==========================================
  @IsOptional()
  @IsBoolean()
  employee_handbookurl?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledgement_of_handbookurl?: boolean;

  @IsOptional()
  @IsBoolean()
  code_of_discipline_policyurl?: boolean;

  @IsOptional()
  @IsBoolean()
  dress_code_policyurl?: boolean;

  @IsOptional()
  @IsBoolean()
  dress_code_policy_videourl?: boolean;

  @IsOptional()
  @IsBoolean()
  sales_enrollment_policyurl?: boolean;

  @IsOptional()
  @IsBoolean()
  attendance_policyurl?: boolean;

  @IsOptional()
  @IsBoolean()
  advances_and_loan_policyurl?: boolean;

  @IsOptional()
  @IsBoolean()
  no_show_and_late_cancellationurl?: boolean;

  @IsOptional()
  @IsBoolean()
  sexual_harassment_training_videourl?: boolean;

  @IsOptional()
  @IsBoolean()
  sexual_harassment_training_acknowledgementurl?: boolean;

  @IsOptional()
  @IsBoolean()
  time_clock_wizard_videourl?: boolean;

  @IsOptional()
  @IsBoolean()
  timekeeping_policyurl?: boolean;

  @IsOptional()
  @IsBoolean()
  remote_staff_working_policyurl?: boolean;

  @IsOptional()
  @IsBoolean()
  cash_handling_policyurl?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledgement_invoice_submissionurl?: boolean;

  @IsOptional()
  @IsBoolean()
  vehicle_use_and_careurl?: boolean;

  // ==========================================
  // NOT IN USE / LEGACY / DEPRECATED
  // ==========================================
  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  department2?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  type_of_job?: string;

  @IsOptional()
  @IsString()
  type_of_staff?: string;

  @IsOptional()
  @IsString()
  permissions?: string;

  @IsOptional()
  @IsBoolean()
  report_to?: boolean;

  @IsOptional()
  @IsObject()
  report?: any;

  @IsOptional()
  @IsString()
  permit?: string;

  @IsOptional()
  @IsDateString()
  permit_expiration?: string | Date;

  @IsOptional()
  @IsNumber()
  training_rate?: number;

  @IsOptional()
  @IsNumber()
  traveling_time_rate?: number;

  @IsOptional()
  @IsObject()
  days?: any;

  @IsOptional()
  @IsString()
  mondaystr?: string;

  @IsOptional()
  @IsString()
  tuesdaystr?: string;

  @IsOptional()
  @IsString()
  wednesdaystr?: string;

  @IsOptional()
  @IsString()
  thursdaystr?: string;

  @IsOptional()
  @IsString()
  fridaystr?: string;

  @IsOptional()
  @IsString()
  saturdaystr?: string;

  @IsOptional()
  @IsString()
  sundaystr?: string;

  @IsOptional()
  @IsString()
  normal_schedule?: string;

  @IsOptional()
  @IsObject()
  history_change_schedule?: any;

  @IsOptional()
  @IsBoolean()
  walk_ins?: boolean;

  @IsOptional()
  @IsBoolean()
  training_logs?: boolean;

  @IsOptional()
  @IsBoolean()
  job_offer?: boolean;

  @IsOptional()
  @IsBoolean()
  nova_in_out?: boolean;

  @IsOptional()
  @IsBoolean()
  hr?: boolean;

  @IsOptional()
  @IsBoolean()
  hr_philippines?: boolean;

  @IsOptional()
  @IsBoolean()
  accounting?: boolean;

  @IsOptional()
  @IsBoolean()
  accounting_validation?: boolean;

  @IsOptional()
  @IsBoolean()
  marketing?: boolean;

  @IsOptional()
  @IsBoolean()
  fleet?: boolean;

  @IsOptional()
  @IsBoolean()
  it?: boolean;

  @IsOptional()
  @IsBoolean()
  activity_report?: boolean;

  @IsOptional()
  @IsBoolean()
  sales?: boolean;

  @IsOptional()
  @IsString()
  dn_name?: string;

  @IsOptional()
  @IsString()
  type_of_position?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string | Date;

  @IsOptional()
  @IsNumber()
  years_with_nova?: number;

  @IsOptional()
  @IsString()
  address_location?: string;

  @IsOptional()
  @IsString()
  preferences?: string;

  @IsOptional()
  @IsNumber()
  porcentage_of_docs?: number;

  @IsOptional()
  @IsBoolean()
  has_assigned_equipment?: boolean;

  @IsOptional()
  @IsBoolean()
  had_assigned_equipment?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  wire_payment_method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  wire_bank?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  wire_location_city_country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  wire_routing_swift?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  wire_type_of_account?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  wire_account_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  wire_street_address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  wire_address_line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  wire_city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  wire_state_region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  wire_postal_zip_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  wire_country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  other_rate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  other_rate_notes?: string;
}