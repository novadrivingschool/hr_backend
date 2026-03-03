import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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

    @Column({ unique: true })
    employee_number: string;

    // --- Employee Info ---
    @Column({ length: 255, default: '' })
    name: string;

    @Column({ length: 255, default: '' })
    last_name: string;

    @Column({ length: 255, default: '' })
    nova_email: string;

    @Column({ length: 50, default: '' })
    personal_phone: string;

    @Column({ length: 50, default: '' })
    country_code: string;

    @Column({ length: 50, default: '' })
    country: string;

    @Column({ length: 50, default: '' })
    state: string;

    @Column({ length: 50, default: '' })
    city: string;

    @Column({ length: 255, default: '' })
    address: string;

    @Column({ length: 20, default: '' })
    postal_code: string;

    @Column({ length: 10, default: '' })
    gender: string;

    @Column({ length: 100, default: '' })
    position: string;

    @Column({ length: 100, default: '' })
    type_of_staff: string;

    @Column({ length: 100, default: '' })
    type_of_position: string;

    @Column({ length: 100, default: '' })
    type_of_job: string;

    @Column({ length: 100, default: '' })
    roles: string;

    @Column({ length: 100, default: 'Employee' })
    permissions: string;

    @Column({ default: false })
    report_to: boolean;

    @Column({ type: 'jsonb', nullable: true, default: { report_to: [] } })
    report: any;

    @Column({ length: 50, default: 'Active' })
    status: string;

    @Column({ type: 'date', nullable: true })
    birthdate: Date;

    // --- Job Info ---
    @Column({ length: 50, default: '' })
    company: string;

    @Column({ type: 'date', nullable: true })
    since: Date;

    @Column({ length: 255, default: '' })
    observations: string;

    @Column({ length: 50, default: '' })
    department: string;

    @Column({ length: 50, default: '' })
    department2: string;

    @Column({ length: 100, default: '' })
    dn_name: string;

    @Column({ type: 'date', nullable: true })
    hire_date: Date;

    @Column({ length: 255, default: '' })
    personal_email: string;

    // --- Instructors ---
    @Column({ length: 100, default: 'N/A' })
    permit: string;

    @Column({ type: 'date', nullable: true })
    permit_expiration: Date;

    // --- Other Data ---
    @Column({ length: 20, default: '' })
    phone_8x8: string;

    @Column({ length: 20, default: '' })
    extension_phone_8x8: string;

    @Column({ length: 100, default: '' })
    assigned_vehicle: string;

    @Column({ length: 100, default: '' })
    vehicle_name: string;

    @Column({ length: 255, default: '' })
    danubanet_name_1: string;

    @Column({ length: 255, default: '' })
    danubanet_name_2: string;

    // --- Accounting & Rates ---
    @Column({ type: 'float', default: 0.0 })
    amount_bonus: number;

    @Column({ default: '0.0' })
    bonus_type: string;

    @Column({ length: 50, default: '' })
    receives_comissions: string;

    @Column({ type: 'float', default: 0.0 })
    commissions: number;

    @Column({ length: 255, default: '' })
    type_of_income: string;

    @Column({ type: 'float', default: 0.0 })
    rate_office_staff: number;

    @Column({ type: 'float', default: 0.0 })
    btw_rate: number;

    @Column({ type: 'float', default: 0.0 })
    class_c_rate: number;

    @Column({ type: 'float', default: 0.0 })
    cr_rate: number;

    @Column({ type: 'float', default: 0.0 })
    ss_rate: number;

    @Column({ type: 'float', default: 0.0 })
    training_rate: number;

    @Column({ type: 'float', default: 0.0 })
    assignment_rate: number;

    @Column({ type: 'float', default: 0.0 })
    corporate_rate: number;

    @Column({ type: 'float', default: 0.0 })
    mechanics_rate: number;

    @Column({ type: 'float', default: 0.0 })
    traveling_time_rate: number;

    @Column({ length: 20, default: '' })
    location: string;

    @Column({ length: 50, default: '' })
    payment_method: string;

    @Column({ length: 5000, default: '' })
    activity_details: string;

    @Column({ length: 150, default: '' })
    job_change_reason: string;

    @Column({ length: 50, default: '' })
    worker_category: string;

    @Column({ length: 50, default: '' })
    pay_frequency: string;

    @Column({ length: 50, default: '' })
    marital_status: string;

    @Column({ length: 50, default: '' })
    ethnicity: string;

    @Column({ length: 50, default: '' })
    race: string;

    @Column({ length: 10, default: '' })
    medicare: string;

    @Column({ length: 10, default: '' })
    medicaid: string;

    @Column({ length: 10, default: '' })
    tabacco_user: string;

    @Column({ length: 10, default: '' })
    veteran: string;

    // --- Emergency Contact ---
    @Column({ length: 255, default: '' })
    name_emergency: string;

    @Column({ length: 255, default: '' })
    last_name_emergency: string;

    @Column({ length: 255, default: '' })
    phone_emergency: string;

    @Column({ length: 255, default: '' })
    address_emergency: string;

    @Column({ length: 255, default: '' })
    relationship_emergency: string;

    // --- Documents & Policies (Boolean Flags) ---
    @Column({ default: false }) recentphotourl: boolean;
    @Column({ default: false }) bachellordegreeurl: boolean;
    @Column({ default: false }) resumeurl: boolean;
    @Column({ default: false }) idurl: boolean;
    @Column({ default: false }) passporturl: boolean;
    @Column({ default: false }) tax_certificateurl: boolean;
    @Column({ default: false }) invoice_exampleurl: boolean;
    @Column({ default: false }) bank_certificateurl: boolean;
    @Column({ default: false }) work_authorizationurl: boolean;
    @Column({ default: false }) w4url: boolean;
    @Column({ default: false }) i9url: boolean;
    @Column({ default: false }) ilurl: boolean;
    @Column({ default: false }) w9url: boolean;
    @Column({ default: false }) ssnurl: boolean;
    @Column({ default: false }) job_offerurl: boolean;
    @Column({ default: false }) employee_handbookurl: boolean;
    @Column({ default: false }) acknowledgement_of_handbookurl: boolean;
    @Column({ default: false }) code_of_discipline_policyurl: boolean;
    @Column({ default: false }) dress_code_policyurl: boolean;
    @Column({ default: false }) sales_enrollment_policyurl: boolean;
    @Column({ default: false }) attendance_policyurl: boolean;
    @Column({ default: false }) advances_and_loan_policyurl: boolean;
    @Column({ default: false }) no_show_and_late_cancellationurl: boolean;
    @Column({ default: false }) sexual_harassment_training_acknowledgementurl: boolean;
    @Column({ default: false }) timekeeping_policyurl: boolean;
    @Column({ default: false }) remote_staff_working_policyurl: boolean;
    @Column({ default: false }) cash_handling_policyurl: boolean;
    @Column({ default: false }) acknowledgement_invoice_submissionurl: boolean;
    @Column({ default: false }) sexual_harassment_training_videourl: boolean;
    @Column({ default: false }) dress_code_policy_videourl: boolean;
    @Column({ default: false }) time_clock_wizard_videourl: boolean;
    @Column({ default: false }) vehicle_use_and_careurl: boolean;

    // --- Schedule & JSON Data ---
    @Column({ type: 'jsonb', nullable: true })
    days: any;

    @Column({ length: 255, default: '' }) mondaystr: string;
    @Column({ length: 255, default: '' }) tuesdaystr: string;
    @Column({ length: 255, default: '' }) wednesdaystr: string;
    @Column({ length: 255, default: '' }) thursdaystr: string;
    @Column({ length: 255, default: '' }) fridaystr: string;
    @Column({ length: 255, default: '' }) saturdaystr: string;
    @Column({ length: 255, default: '' }) sundaystr: string;

    @Column({ length: 1000, default: '' })
    normal_schedule: string;

    @Column({ type: 'jsonb', nullable: true })
    history_change_schedule: any;

    @Column({ default: false })
    form_status: boolean;

    @Column({ length: 100, default: '' })
    type_of_comissions: string;

    @Column({ length: 255, default: '' })
    id_type: string;

    @Column({ length: 255, default: '' })
    id_number: string;

    @Column({ type: 'date', nullable: true })
    end_date: Date;

    @Column({ type: 'float', default: 0.0 })
    years_with_nova: number;

    @Column({ length: 20, default: '' })
    address_location: string;

    @Column({ length: 50, default: '' })
    preferences: string;

    @Column({ length: 50, default: '' })
    type_of_schedule: string;

    @Column({ type: 'float', default: 0.0 })
    porcentage_of_docs: number;

    // --- Permissions ---
    @Column({ default: false }) walk_ins: boolean;
    @Column({ default: false }) training_logs: boolean;
    @Column({ default: false }) job_offer: boolean;
    @Column({ default: false }) nova_in_out: boolean;
    @Column({ default: false }) hr: boolean;
    @Column({ default: false }) hr_philippines: boolean;
    @Column({ default: false }) accounting: boolean;
    @Column({ default: false }) accounting_validation: boolean;
    @Column({ default: false }) marketing: boolean;
    @Column({ default: false }) fleet: boolean;
    @Column({ default: false }) it: boolean;

    @Column({ default: false }) has_assigned_equipment: boolean;
    @Column({ default: false }) had_assigned_equipment: boolean;
    @Column({ default: false }) activity_report: boolean;
    @Column({ default: false }) sales: boolean;

    @Column({ length: 255, default: '' })
    work_schedule: string;

    @Column({ type: 'float', default: 0.0 })
    office_maintenance: number;

    // --- Multi-select & Arrays ---
    @Column({ type: 'jsonb', nullable: false, default: [] })
    multi_department: string[];

    @Column({ type: 'jsonb', nullable: false, default: [] })
    multi_company: string[];

    @Column({ type: 'jsonb', nullable: false, default: [] })
    multi_location: string[];

    @Column({ type: 'jsonb', nullable: false, default: [] })
    multi_position: string[];

    @Column({ type: 'jsonb', nullable: false, default: [] })
    multi_type_of_job: string[];

    @Column({
        type: 'jsonb',
        nullable: false,
        default: () => "'[]'",
    })
    supervisors!: SupervisorRef[];

    @Column({ length: 100, default: 'N/A' })
    driver_license: string;

    @Column({ type: 'date', nullable: true })
    driver_license_expiration: Date;
}