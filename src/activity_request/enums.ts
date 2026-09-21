// src/activity_request/enums.ts
export enum PunchTypeEnum {
  ClockIn = 'Clock In',
  ClockOut = 'Clock Out',
  LunchIn = 'Lunch In',
  LunchOut = 'Lunch Out',
}

export enum SourceEnum {
  ActivityReportOne = 'Activity Report ONE',
  TimeClockWizard = 'Time Clock Wizard',
}

export enum StatusEnum {
  Pending = 'Pending',
  Approved = 'Approved',
  NotApproved = 'Not Approved',
  Cancelled = 'Cancelled',
}
