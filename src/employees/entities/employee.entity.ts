import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { CrmPermissions } from './crm-permissions.entity';

export interface SupervisorRef {
    name: string;
    last_name: string;
    employee_number: string;
    nova_email?: string;
    __label?: string;
}

@Entity('employees')
export class Employee {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 255, unique: true, nullable: false })
    employee_number: string;

    @Column({ type: 'varchar', length: 50, default: 'Active', nullable: true })
    status: 'Active' | 'Inactive';

    // ==========================================
    // TAB 0: JOB INFORMATION
    // ==========================================
    @Column({ type: 'json', nullable: false, default: () => "'[]'" })
    multi_company: string[];

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    name: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    last_name: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    personal_email: string;

    @Column({ type: 'varchar', length: 50, default: '', nullable: true })
    country_code: string;

    @Column({ type: 'varchar', length: 50, default: '', nullable: true })
    personal_phone: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    nova_email: string;

    @Column({ type: 'date', nullable: true })
    hire_date: Date;

    @Column({ type: 'varchar', length: 150, default: '', nullable: true })
    job_change_reason: string;

    @Column({ type: 'json', nullable: false, default: () => "'[]'" })
    multi_type_of_job: string[];

    @Column({ type: 'varchar', length: 50, default: '', nullable: true })
    worker_category: string;

    @Column({ type: 'json', nullable: false, default: () => "'[]'" })
    multi_position: string[];

    @Column({ type: 'varchar', length: 100, default: 'N/A', nullable: true })
    driver_license: string;

    @Column({ type: 'date', nullable: true })
    driver_license_expiration: Date;

    @Column({ type: 'json', nullable: false, default: () => "'[]'" })
    roles: string[];

    @Column({ type: 'json', nullable: false, default: () => "'[]'" })
    multi_department: string[];

    @Column({ type: 'jsonb', nullable: true, default: () => "'[]'" })
    supervisors!: SupervisorRef[];

    @Column({ type: 'varchar', length: 5000, default: '', nullable: true })
    activity_details: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    work_schedule: string;

    @Column({ type: 'json', nullable: false, default: () => "'[]'" })
    multi_location: string[];

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    observations: string;

    // ==========================================
    // TAB 1: ACCOUNTING
    // ==========================================
    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    type_of_income: string;

    @Column({ type: 'varchar', length: 50, default: '', nullable: true })
    pay_frequency: string;

    @Column({ type: 'float', default: 0.0, nullable: true })
    rate_office_staff: number;

    @Column({ type: 'varchar', length: 50, default: '', nullable: true })
    receives_comissions: string;

    @Column({ type: 'float', default: 0.0, nullable: true })
    commissions: number;

    @Column({ type: 'varchar', length: 50, default: '', nullable: true })
    type_of_schedule: string;

    @Column({ type: 'varchar', length: 50, default: '', nullable: true })
    payment_method: string;

    @Column({ type: 'float', default: 0.0, nullable: true })
    assignment_rate: number;

    @Column({ type: 'float', default: 0.0, nullable: true })
    btw_rate: number;

    @Column({ type: 'float', default: 0.0, nullable: true })
    class_c_rate: number;

    @Column({ type: 'float', default: 0.0, nullable: true })
    cr_rate: number;

    @Column({ type: 'float', default: 0.0, nullable: true })
    ss_rate: number;

    @Column({ type: 'float', default: 0.0, nullable: true })
    corporate_rate: number;

    @Column({ type: 'float', default: 0.0, nullable: true })
    mechanics_rate: number;

    @Column({ type: 'float', default: 0.0, nullable: true })
    office_maintenance: number;

    @Column({ type: 'float', default: 0.0, nullable: true })
    amount_bonus: number;

    @Column({ type: 'varchar', default: '0.0', nullable: true })
    bonus_type: string;

    @Column({ type: 'varchar', length: 100, default: '', nullable: true })
    type_of_comissions: string;

    // ==========================================
    // TAB 2: OTHER DATA
    // ==========================================
    @Column({ type: 'varchar', length: 20, default: '', nullable: true })
    phone_8x8: string;

    @Column({ type: 'varchar', length: 20, default: '', nullable: true })
    extension_phone_8x8: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    danubanet_name_1: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    danubanet_name_2: string;

    @Column({ type: 'varchar', length: 100, default: '', nullable: true })
    assigned_vehicle: string;

    @Column({ type: 'varchar', length: 100, default: '', nullable: true })
    vehicle_name: string;

    // ==========================================
    // TAB 3: PERSONAL INFORMATION
    // ==========================================
    @Column({ type: 'date', nullable: true })
    birthdate: Date;

    @Column({ type: 'varchar', length: 10, default: '', nullable: true })
    gender: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    id_type: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    id_number: string;

    @Column({ type: 'varchar', length: 50, default: '', nullable: true })
    country: string;

    @Column({ type: 'varchar', length: 50, default: '', nullable: true })
    state: string;

    @Column({ type: 'varchar', length: 50, default: '', nullable: true })
    city: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    address: string;

    @Column({ type: 'varchar', length: 20, default: '', nullable: true })
    postal_code: string;

    @Column({ type: 'varchar', length: 50, default: '', nullable: true })
    marital_status: string;

    @Column({ type: 'date', nullable: true })
    since: Date;

    @Column({ type: 'varchar', length: 50, default: '', nullable: true })
    ethnicity: string;

    @Column({ type: 'varchar', length: 50, default: '', nullable: true })
    race: string;

    @Column({ type: 'varchar', length: 10, default: '', nullable: true })
    medicare: string;

    @Column({ type: 'varchar', length: 10, default: '', nullable: true })
    medicaid: string;

    @Column({ type: 'varchar', length: 10, default: '', nullable: true })
    tabacco_user: string;

    @Column({ type: 'varchar', length: 10, default: '', nullable: true })
    veteran: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    name_emergency: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    last_name_emergency: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    phone_emergency: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    address_emergency: string;

    @Column({ type: 'varchar', length: 255, default: '', nullable: true })
    relationship_emergency: string;

    // ==========================================
    // TAB 4: DOCUMENTS (URLs / Booleans)
    // ==========================================
    @Column({ type: 'boolean', default: false, nullable: true }) form_status: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) recentphotourl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) bachellordegreeurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) resumeurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) idurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) passporturl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) tax_certificateurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) invoice_exampleurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) bank_certificateurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) work_authorizationurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) w4url: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) i9url: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) ilurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) w9url: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) ssnurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) job_offerurl: boolean;

    // ==========================================
    // TAB 5: POLICIES (URLs / Booleans)
    // ==========================================
    @Column({ type: 'boolean', default: false, nullable: true }) employee_handbookurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) acknowledgement_of_handbookurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) code_of_discipline_policyurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) dress_code_policyurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) dress_code_policy_videourl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) sales_enrollment_policyurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) attendance_policyurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) advances_and_loan_policyurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) no_show_and_late_cancellationurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) sexual_harassment_training_videourl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) sexual_harassment_training_acknowledgementurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) time_clock_wizard_videourl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) timekeeping_policyurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) remote_staff_working_policyurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) cash_handling_policyurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) acknowledgement_invoice_submissionurl: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) vehicle_use_and_careurl: boolean;

    @OneToOne(() => CrmPermissions, (crmPermissions) => crmPermissions.employee)
    permissions_relation: CrmPermissions;

    // ==========================================
    // NOT IN USE / LEGACY / DEPRECATED
    // ==========================================
    @Column({ type: 'varchar', length: 50, default: '', nullable: true }) department: string;
    @Column({ type: 'varchar', length: 50, default: '', nullable: true }) department2: string;
    @Column({ type: 'varchar', length: 50, default: '', nullable: true }) company: string;
    @Column({ type: 'varchar', length: 20, default: '', nullable: true }) location: string;
    @Column({ type: 'varchar', length: 100, default: '', nullable: true }) position: string;
    @Column({ type: 'varchar', length: 100, default: '', nullable: true }) type_of_job: string;
    @Column({ type: 'varchar', length: 100, default: '', nullable: true }) type_of_staff: string;
    @Column({ type: 'varchar', length: 100, default: 'Employee', nullable: true }) permissions: string;
    
    @Column({ type: 'boolean', default: false, nullable: true }) report_to: boolean;
    @Column({ type: 'jsonb', nullable: true, default: { report_to: [] } }) report: any;

    @Column({ type: 'varchar', length: 100, default: 'N/A', nullable: true }) permit: string;
    @Column({ type: 'date', nullable: true }) permit_expiration: Date;

    @Column({ type: 'float', default: 0.0, nullable: true }) training_rate: number;
    @Column({ type: 'float', default: 0.0, nullable: true }) traveling_time_rate: number;

    @Column({ type: 'jsonb', nullable: true }) days: any;
    @Column({ type: 'varchar', length: 255, default: '', nullable: true }) mondaystr: string;
    @Column({ type: 'varchar', length: 255, default: '', nullable: true }) tuesdaystr: string;
    @Column({ type: 'varchar', length: 255, default: '', nullable: true }) wednesdaystr: string;
    @Column({ type: 'varchar', length: 255, default: '', nullable: true }) thursdaystr: string;
    @Column({ type: 'varchar', length: 255, default: '', nullable: true }) fridaystr: string;
    @Column({ type: 'varchar', length: 255, default: '', nullable: true }) saturdaystr: string;
    @Column({ type: 'varchar', length: 255, default: '', nullable: true }) sundaystr: string;
    @Column({ type: 'varchar', length: 1000, default: '', nullable: true }) normal_schedule: string;
    @Column({ type: 'jsonb', nullable: true }) history_change_schedule: any;

    @Column({ type: 'boolean', default: false, nullable: true }) walk_ins: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) training_logs: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) job_offer: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) nova_in_out: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) hr: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) hr_philippines: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) accounting: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) accounting_validation: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) marketing: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) fleet: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) it: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) activity_report: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) sales: boolean;

    @Column({ type: 'varchar', length: 100, default: '', nullable: true }) dn_name: string;
    @Column({ type: 'varchar', length: 100, default: '', nullable: true }) type_of_position: string;
    @Column({ type: 'date', nullable: true }) end_date: Date;
    @Column({ type: 'float', default: 0.0, nullable: true }) years_with_nova: number;
    @Column({ type: 'varchar', length: 20, default: '', nullable: true }) address_location: string;
    @Column({ type: 'varchar', length: 50, default: '', nullable: true }) preferences: string;
    @Column({ type: 'float', default: 0.0, nullable: true }) porcentage_of_docs: number;
    @Column({ type: 'boolean', default: false, nullable: true }) has_assigned_equipment: boolean;
    @Column({ type: 'boolean', default: false, nullable: true }) had_assigned_equipment: boolean;
}