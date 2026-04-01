export function buildSingleEmployeeHtml(
  emp: any,
  work_schedule: string,
  start_date: string,
  end_date: string,
): string {
  const esc = (value: any): string =>
    String(value ?? '—')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const num = (value: any): number => {
    const n = Number(value);
    return isFinite(n) ? n : 0;
  };

  const hasValue = (value: any): boolean =>
    value !== null && value !== undefined && String(value).trim() !== '';

  const fmtMoney = (value: any): string => `$${num(value).toFixed(2)}`;
  const fmtHours = (value: any): string => `${num(value).toFixed(2)} hrs`;
  const fmtMoneyMaybe = (value: any): string => (hasValue(value) ? fmtMoney(value) : '—');
  const fmtHoursMaybe = (value: any): string => (hasValue(value) ? fmtHours(value) : '—');

  const formatRangeText = (start: any, end: any): string => {
    const left = hasValue(start) ? String(start) : '';
    const right = hasValue(end) ? String(end) : '';

    if (left && right) return `${left} - ${right}`;
    return left || right || '—';
  };

  const fullName = [emp?.name, emp?.last_name].filter(Boolean).join(' ') || '—';
  const periodStart = emp?.period?.start_date || start_date || '—';
  const periodEnd = emp?.period?.end_date || end_date || '—';

  const totals = emp?.payroll_totals ?? {};
  const scheduleSummary = totals?.schedule_summary_hours ?? {};
  const realSummary = totals?.real_summary_hours ?? {};

  const scheduleDetails = Array.isArray(emp?.schedule_details) ? emp.schedule_details : [];
  const effectiveRates = Array.isArray(emp?.effective_rates) ? emp.effective_rates : [];
  const holidaysInRange = Array.isArray(emp?.holidays_in_range) ? emp.holidays_in_range : [];
  const timeOffDetails = Array.isArray(emp?.time_off?.details) ? emp.time_off.details : [];
  const extraHoursDetails = Array.isArray(emp?.extra_hours?.details) ? emp.extra_hours.details : [];
  const advancedDetails = Array.isArray(emp?.advanced_requests?.details) ? emp.advanced_requests.details : [];
  const compInFavor = Array.isArray(emp?.compensation_summary?.in_favor) ? emp.compensation_summary.in_favor : [];
  const compToDeduct = Array.isArray(emp?.compensation_summary?.to_deduct) ? emp.compensation_summary.to_deduct : [];
  const commissions = Array.isArray(emp?.commissions_summary) ? emp.commissions_summary : [];

  const effectiveRateById = effectiveRates
    .filter((rate: any) => hasValue(rate?.rate_id))
    .reduce((acc: Record<string, any>, rate: any) => {
      acc[String(rate.rate_id)] = rate;
      return acc;
    }, {} as Record<string, any>);

  const attendanceLabel = (source: any): string => {
    switch (source) {
      case 'time_clock_wizard': return 'TCW';
      case 'activity_report': return 'Activity';
      case 'holiday_schedule': return 'Holiday';
      case 'holiday_default_8h': return 'Holiday 8h';
      case 'none': return 'No attendance';
      default: return source || '—';
    }
  };

  const payableLabel = (source: any): string => {
    switch (source) {
      case 'master_schedule': return 'Master';
      case 'time_clock_wizard': return 'TCW';
      case 'activity_report': return 'Activity';
      case 'holiday_schedule': return 'Holiday';
      case 'holiday_default_8h': return 'Holiday 8h';
      case 'no_attendance_data': return 'No data';
      default: return source || '—';
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'BONUS': return 'Bonus';
      case 'GIFT': return 'Gift';
      case 'RECOGNITION': return 'Recognition';
      case 'INCENTIVE': return 'Incentive';
      case 'LOAN': return 'Loan';
      case 'FIXED_DEDUCTION': return 'Deduction';
      default: return type || '—';
    }
  };

  const moneyClass = (value: any, fallback: 'green' | 'red' | 'neutral' = 'neutral') => {
    const n = num(value);
    if (n > 0) return 'amount-green';
    if (n < 0) return 'amount-red';
    if (fallback === 'green') return 'amount-green';
    if (fallback === 'red') return 'amount-red';
    return '';
  };

  const holidayMeta = (holiday: any) => {
    const matchedRate = hasValue(holiday?.rate_id)
      ? (effectiveRateById[String(holiday.rate_id)] || null)
      : null;

    const matchedPeriodRate = matchedRate ? matchedRate.period_rate : null;
    const matchedRangeStart = matchedRate ? matchedRate.range_start : null;
    const matchedRangeEnd = matchedRate ? matchedRate.range_end : null;
    const matchedType = matchedRate ? matchedRate.type : null;
    const matchedTypeOfRate = matchedRate ? matchedRate.type_of_rate : null;

    return {
      period:
        holiday?.period ||
        holiday?.period_title ||
        (hasValue(holiday?.period_rate)
          ? fmtMoney(holiday.period_rate)
          : hasValue(matchedPeriodRate)
            ? fmtMoney(matchedPeriodRate)
            : '—'),
      range:
        holiday?.range ||
        holiday?.range_text ||
        (hasValue(holiday?.range_start) || hasValue(holiday?.range_end)
          ? formatRangeText(holiday?.range_start, holiday?.range_end)
          : hasValue(matchedRangeStart) || hasValue(matchedRangeEnd)
            ? formatRangeText(matchedRangeStart, matchedRangeEnd)
            : '—'),
      type:
        holiday?.type ||
        matchedType ||
        holiday?.type_of_rate ||
        matchedTypeOfRate ||
        '—',
    };
  };

  const buildSourceDetail = (
    label: string,
    sourceData: any,
    sourcePrefix?: string | null,
  ) => {
    if (!sourceData) {
      return `<div><strong>${esc(label)}:</strong> —</div>`;
    }

    const parts: string[] = [];

    if (hasValue(sourcePrefix)) {
      parts.push(esc(sourcePrefix));
    }

    parts.push(`${esc(sourceData?.shift_start || '—')} - ${esc(sourceData?.shift_end || '—')}`);
    parts.push(`Lunch ${esc(sourceData?.lunch_start || '—')} - ${esc(sourceData?.lunch_end || '—')}`);
    parts.push(`Lunch Total ${fmtHoursMaybe(sourceData?.lunch_total_hours)}`);
    parts.push(`Shift Span ${fmtHoursMaybe(sourceData?.scheduled_hours)}`);
    parts.push(`Net Worked ${fmtHoursMaybe(sourceData?.worked_hours)}`);

    return `<div><strong>${esc(label)}:</strong> ${parts.join(' · ')}</div>`;
  };

  const emptyInline = (text: string) => `<div class="empty-inline">${esc(text)}</div>`;

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>Payroll Report - ${esc(emp?.employee_number)}</title>
      <style>
        * { box-sizing: border-box; }

        html, body {
          margin: 0;
          padding: 0;
          font-family: Arial, Helvetica, sans-serif;
          background: #f4f6f8;
          color: #1f2937;
          font-size: 11px;
        }

        body {
          padding: 18px;
        }

        #report-container {
          width: 100%;
        }

        .sheet {
          background: #ffffff;
          border-radius: 14px;
          padding: 18px;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 16px;
        }

        .title {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
          color: #0f172a;
        }

        .subtitle {
          margin: 4px 0 0;
          color: #64748b;
          font-size: 12px;
        }

        .tag {
          display: inline-block;
          font-size: 10px;
          line-height: 1.2;
          padding: 5px 8px;
          border-radius: 999px;
          background: #eef2ff;
          color: #4338ca;
          border: 1px solid #c7d2fe;
          white-space: nowrap;
          text-align: left;
        }

        .tag-purple-fill {
          background: #ede9fe;
          border-color: #d8b4fe;
          color: #6d28d9;
          margin-left: 0;
        }

        .tag-group {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: flex-start;
        }

        .date-cell {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
        }

        .box {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 14px;
          background: #fff;
          margin-bottom: 12px;
        }

        .box-gray { background: #f8fafc; }
        .box-red { background: #fff7f7; border-color: #fecaca; }
        .box-green { background: #f5fff8; border-color: #bbf7d0; }
        .box-orange { background: #fffaf3; border-color: #fed7aa; }
        .box-comp { background: #faf7ff; border-color: #ddd6fe; }

        .box-title {
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 10px;
          color: #0f172a;
        }

        .box-subtitle {
          color: #64748b;
          margin-bottom: 8px;
          font-size: 11px;
        }

        .box-amount {
          margin-top: 10px;
          font-weight: 700;
          text-align: right;
          color: #0f172a;
        }

        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .mt-12 { margin-top: 12px; }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        .summary-table td {
          padding: 8px 6px;
          border-bottom: 1px solid #e5e7eb;
          vertical-align: top;
          text-align: left;
        }

        .summary-table td:last-child {
          text-align: right;
        }

        .payroll-totals-table,
        .event-table,
        .comp-table,
        .comm-table,
        .rates-table {
          table-layout: fixed;
        }

        .daily-log-table,
        .holidays-table {
          table-layout: auto;
        }

        .payroll-totals-table th,
        .payroll-totals-table td,
        .daily-log-table th,
        .daily-log-table td,
        .event-table th,
        .event-table td,
        .comp-table th,
        .comp-table td,
        .comm-table th,
        .comm-table td,
        .rates-table th,
        .rates-table td,
        .holidays-table th,
        .holidays-table td {
          padding: 8px 6px;
          border-bottom: 1px solid #e5e7eb;
          vertical-align: top;
          text-align: left;
          overflow-wrap: normal;
          word-break: normal;
        }

        .payroll-totals-table th,
        .daily-log-table th,
        .event-table th,
        .comp-table th,
        .comm-table th,
        .rates-table th,
        .holidays-table th {
          background: #f8fafc;
          color: #334155;
          font-size: 10px;
          font-weight: 700;
          text-align: left;
        }

        .text-right { text-align: right !important; }

        .daily-log-table .text-right,
        .holidays-table .text-right,
        .rates-table .text-right {
          text-align: left !important;
        }

        .amount-green { color: #15803d; font-weight: 700; }
        .amount-red { color: #b91c1c; font-weight: 700; }

        .holiday-row {
          background: #faf5ff;
        }

        .detail-soft td {
          background: #fbfdff;
          color: #475569;
          font-size: 10px;
          text-align: left;
          padding-top: 10px;
          padding-bottom: 10px;
        }

        .day-detail-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 6px;
        }

        .day-detail-grid > div {
          text-align: left;
        }

        .left-table th,
        .left-table td {
          text-align: left !important;
        }

        .nowrap {
          white-space: nowrap;
          overflow-wrap: normal !important;
          word-break: normal !important;
        }

        .comp-subtotal {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px dashed #cbd5e1;
          font-weight: 700;
        }

        .empty-inline {
          color: #64748b;
          font-style: italic;
          padding: 6px 0;
        }

        @media print {
          html, body {
            background: #fff;
          }

          body {
            padding: 0;
          }

          .sheet {
            box-shadow: none;
            border-radius: 0;
          }
        }
      </style>
    </head>
    <body>
      <div id="report-container">
        <div class="sheet">
          <div class="header">
            <div>
              <h1 class="title">Payroll Report</h1>
              <p class="subtitle">
                ${esc(fullName)} · ${esc(emp?.employee_number)} · ${esc(periodStart)} — ${esc(periodEnd)}
              </p>
            </div>
            <span class="tag">${esc(emp?.work_schedule || work_schedule || '—')}</span>
          </div>

          <div class="grid-2">
            <div class="box">
              <div class="box-title">👤 Employee Information</div>
              <table class="summary-table">
                <tbody>
                  <tr><td>Employee</td><td>${esc(fullName)}</td></tr>
                  <tr><td>Employee Number</td><td>${esc(emp?.employee_number)}</td></tr>
                  <tr><td>Work Schedule</td><td>${esc(emp?.work_schedule || work_schedule)}</td></tr>
                  <tr><td>Type of Income</td><td>${esc(emp?.type_of_income)}</td></tr>
                  <tr><td>Pay Frequency</td><td>${esc(emp?.pay_frequency)}</td></tr>
                  <tr><td>Payment Method</td><td>${esc(emp?.payment_method)}</td></tr>
                  <tr><td>Days Worked</td><td>${esc(emp?.days_worked ?? 0)}</td></tr>
                  <tr><td>Authorized Hours</td><td>${fmtHours(emp?.authorized_hours)}</td></tr>
                </tbody>
              </table>
            </div>

            <div class="box">
              <div class="box-title">⏱️ Schedule and Attendance Summary</div>
              <table class="summary-table">
                <tbody>
                  <tr><td>Authorized Schedule Hours</td><td>${fmtHours(scheduleSummary?.authorized_schedule?.work_hours)}</td></tr>
                  <tr><td>Authorized Schedule Lunch Hours</td><td>${fmtHours(scheduleSummary?.authorized_schedule?.lunch_hours)}</td></tr>
                  <tr><td>Time Clock Wizard Schedule Hours</td><td>${fmtHours(scheduleSummary?.time_clock_wizard?.work_hours)}</td></tr>
                  <tr><td>Activity Report Schedule Hours</td><td>${fmtHours(scheduleSummary?.activity_report?.work_hours)}</td></tr>
                  <tr><td>Time Clock Wizard Real Worked Hours</td><td>${fmtHours(realSummary?.time_clock_wizard?.work_hours)}</td></tr>
                  <tr><td>Activity Report Real Worked Hours</td><td>${fmtHours(realSummary?.activity_report?.work_hours)}</td></tr>
                  <tr><td>Total Payable Hours</td><td>${fmtHours(emp?.total_payable_hours ?? emp?.payroll_totals?.total_payable_hours)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="box box-gray">
            <div class="box-title">💰 Payroll Totals</div>
            <table class="payroll-totals-table">
              <colgroup>
                <col style="width: 28%;">
                <col style="width: 22%;">
                <col style="width: 28%;">
                <col style="width: 22%;">
              </colgroup>
              <tbody>
                <tr>
                  <td>Days Amount</td>
                  <td class="text-right ${moneyClass(totals?.days_amount, 'green')}">${fmtMoney(totals?.days_amount)}</td>
                  <td>Time Off Amount</td>
                  <td class="text-right ${moneyClass(totals?.time_off_amount, 'red')}">${fmtMoney(totals?.time_off_amount)}</td>
                </tr>
                <tr>
                  <td>Extra Hours Amount</td>
                  <td class="text-right ${moneyClass(totals?.extra_hours_amount, 'green')}">${fmtMoney(totals?.extra_hours_amount)}</td>
                  <td>Compensations In Favor</td>
                  <td class="text-right ${moneyClass(totals?.compensations_in_favor_amount, 'green')}">${fmtMoney(totals?.compensations_in_favor_amount)}</td>
                </tr>
                <tr>
                  <td>Compensations To Deduct</td>
                  <td class="text-right ${moneyClass(totals?.compensations_to_deduct_amount, 'red')}">${fmtMoney(totals?.compensations_to_deduct_amount)}</td>
                  <td>Commissions Amount</td>
                  <td class="text-right ${moneyClass(totals?.commissions_amount, 'green')}">${fmtMoney(totals?.commissions_amount)}</td>
                </tr>
                <tr>
                  <td>Advanced Amount</td>
                  <td class="text-right ${moneyClass(totals?.advanced_amount, 'red')}">${fmtMoney(totals?.advanced_amount)}</td>
                  <td><strong>Total Payroll Amount</strong></td>
                  <td class="text-right"><strong>${fmtMoney(totals?.total_payroll_amount)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="box box-gray">
            <div class="box-title">📘 Daily Log</div>
            ${
              scheduleDetails.length
                ? `
                  <table class="daily-log-table left-table">
                    <colgroup>
                      <col style="width: 14%;">
                      <col style="width: 12%;">
                      <col style="width: 12%;">
                      <col style="width: 10%;">
                      <col style="width: 10%;">
                      <col style="width: 10%;">
                      <col style="width: 10%;">
                      <col style="width: 10%;">
                      <col style="width: 12%;">
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Attendance Used</th>
                        <th>Master Schedule Authorized Hrs</th>
                        <th>TCW Worked Hrs</th>
                        <th>Activity Report Hrs</th>
                        <th>Activity Source</th>
                        <th>Payable Hrs</th>
                        <th>Paid From</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${scheduleDetails.map((day: any) => {
                        const holidayBadge = day?.is_holiday
                          ? `<span class="tag tag-purple-fill">★ ${esc(day?.holiday_name || 'Holiday')}</span>`
                          : '';

                        return `
                          <tr class="${day?.is_holiday ? 'holiday-row' : ''}">
                            <td>
                              <div class="date-cell">
                                <div class="nowrap">${esc(day?.date)}</div>
                                ${holidayBadge ? `<div class="tag-group">${holidayBadge}</div>` : ''}
                              </div>
                            </td>
                            <td><div class="tag-group"><span class="tag">${esc(attendanceLabel(day?.payroll_day?.attendance_source))}</span></div></td>
                            <td class="nowrap">${fmtHoursMaybe(day?.payroll_day?.authorized_hours ?? day?.master_schedule?.worked_hours)}</td>
                            <td class="nowrap">${fmtHoursMaybe(day?.time_clock_wizard?.worked_hours)}</td>
                            <td class="nowrap">${fmtHoursMaybe(day?.activity_report?.worked_hours)}</td>
                            <td>${esc(day?.activity_report?.source || '—')}</td>
                            <td class="nowrap">${fmtHoursMaybe(day?.payroll_day?.payable_hours)}</td>
                            <td><div class="tag-group"><span class="tag">${esc(payableLabel(day?.payroll_day?.payable_hours_source))}</span></div></td>
                            <td class="nowrap">${fmtMoneyMaybe(day?.payroll_day?.day_payable_amount)}</td>
                          </tr>
                          <tr class="detail-soft">
                            <td colspan="9">
                              <div class="day-detail-grid">
                                <div><strong>Payroll Day:</strong> Real Worked ${fmtHoursMaybe(day?.payroll_day?.real_worked_hours)} · Real Lunch ${fmtHoursMaybe(day?.payroll_day?.real_lunch_hours)} · Authorized Hours ${fmtHoursMaybe(day?.payroll_day?.authorized_hours)} · Payable Hours ${fmtHoursMaybe(day?.payroll_day?.payable_hours)} · Rate/Hr ${fmtMoneyMaybe(day?.payroll_day?.rate_per_hour)}</div>
                                <div>${buildSourceDetail('Master Schedule', day?.master_schedule, day?.master_schedule?.source)}</div>
                                <div>${buildSourceDetail('TCW', day?.time_clock_wizard)}</div>
                                <div>${buildSourceDetail('Activity Report', day?.activity_report, day?.activity_report?.source)}</div>
                              </div>
                            </td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                `
                : emptyInline('No daily log in this payroll period.')
            }
          </div>

          <div class="grid-2 mt-12">
            <div class="box box-red">
              <div class="box-title">🕒 Time Off</div>
              <div class="box-subtitle">${esc(emp?.time_off?.total_requests ?? 0)} requests · ${fmtHours(emp?.time_off?.total_hours)}</div>
              ${
                timeOffDetails.length
                  ? `
                    <table class="event-table">
                      <colgroup>
                        <col style="width: 20%;">
                        <col style="width: 22%;">
                        <col style="width: 22%;">
                        <col style="width: 16%;">
                        <col style="width: 20%;">
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Start</th>
                          <th>End</th>
                          <th class="text-right">Hours</th>
                          <th class="text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${timeOffDetails.map((d: any) => `
                          <tr>
                            <td>${esc(d?.date)}</td>
                            <td>${esc(d?.start || '—')}</td>
                            <td>${esc(d?.end || '—')}</td>
                            <td class="text-right">${fmtHours(d?.total_hours)}</td>
                            <td class="text-right ${moneyClass(d?.calculated_total ?? d?.amount, 'red')}">${fmtMoney(d?.calculated_total ?? d?.amount)}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  `
                  : emptyInline('No time off records in this payroll period.')
              }
              <div class="box-amount ${moneyClass(totals?.time_off_amount, 'red')}">${fmtMoney(totals?.time_off_amount)}</div>
            </div>

            <div class="box box-green">
              <div class="box-title">⏫ Extra Hours</div>
              <div class="box-subtitle">${esc(emp?.extra_hours?.total_requests ?? 0)} requests · ${fmtHours(emp?.extra_hours?.total_hours)}</div>
              ${
                extraHoursDetails.length
                  ? `
                    <table class="event-table">
                      <colgroup>
                        <col style="width: 20%;">
                        <col style="width: 22%;">
                        <col style="width: 22%;">
                        <col style="width: 16%;">
                        <col style="width: 20%;">
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Start</th>
                          <th>End</th>
                          <th class="text-right">Hours</th>
                          <th class="text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${extraHoursDetails.map((d: any) => `
                          <tr>
                            <td>${esc(d?.date)}</td>
                            <td>${esc(d?.start || '—')}</td>
                            <td>${esc(d?.end || '—')}</td>
                            <td class="text-right">${fmtHours(d?.total_hours)}</td>
                            <td class="text-right ${moneyClass(d?.calculated_total ?? d?.amount, 'green')}">${fmtMoney(d?.calculated_total ?? d?.amount)}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  `
                  : emptyInline('No extra hours records in this payroll period.')
              }
              <div class="box-amount ${moneyClass(totals?.extra_hours_amount, 'green')}">${fmtMoney(totals?.extra_hours_amount)}</div>
            </div>
          </div>

          <div class="box box-orange mt-12">
            <div class="box-title">💸 Advanced Requests</div>
            <div class="box-subtitle">${esc(emp?.advanced_requests?.total_requests ?? 0)} requests</div>
            ${
              advancedDetails.length
                ? `
                  <table class="event-table">
                    <colgroup>
                      <col style="width: 18%;">
                      <col style="width: 22%;">
                      <col style="width: 40%;">
                      <col style="width: 20%;">
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Payment Type</th>
                        <th>Processed</th>
                        <th class="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${advancedDetails.map((d: any) => `
                        <tr>
                          <td>${esc(d?.date)}</td>
                          <td>${esc(d?.payment_type || '—')}</td>
                          <td>${esc([d?.processed_date, d?.processed_time].filter(Boolean).join(' ') || '—')}</td>
                          <td class="text-right ${moneyClass(d?.amount, 'red')}">${fmtMoney(d?.amount)}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                `
                : emptyInline('No advanced requests in this payroll period.')
            }
            <div class="box-amount ${moneyClass(totals?.advanced_amount, 'red')}">${fmtMoney(totals?.advanced_amount)}</div>
          </div>

          ${
            compInFavor.length || compToDeduct.length
              ? `
                <div class="box box-comp">
                  <div class="box-title">💼 Employee Compensations</div>
                  <table class="comp-table">
                    <colgroup>
                      <col style="width: 28%;">
                      <col style="width: 18%;">
                      <col style="width: 34%;">
                      <col style="width: 20%;">
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Detail</th>
                        <th class="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${compInFavor.map((l: any) => `
                        <tr>
                          <td>${esc(l?.name ?? '—')}</td>
                          <td>${esc(typeLabel(l?.type))}</td>
                          <td>${esc(l?.installment ? `Installment #${l.installment.installment_number} · ${l.installment.status}` : (l?.effective_date ?? l?.date ?? '—'))}</td>
                          <td class="text-right ${moneyClass(l?.amount, 'green')}">${fmtMoney(l?.amount)}</td>
                        </tr>
                      `).join('')}
                      ${compToDeduct.map((l: any) => `
                        <tr>
                          <td>${esc(l?.name ?? '—')}</td>
                          <td>${esc(typeLabel(l?.type))}</td>
                          <td>${esc(l?.installment ? `Installment #${l.installment.installment_number} · ${l.installment.status}` : (l?.effective_date ?? l?.date ?? '—'))}</td>
                          <td class="text-right ${moneyClass(l?.amount, 'red')}">${fmtMoney(l?.amount)}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                  <div class="comp-subtotal">
                    <span>Compensation net</span>
                    <span>${fmtMoney(emp?.payroll_totals?.compensation_net ?? emp?.payroll_totals?.compensations_net_amount)}</span>
                  </div>
                </div>
              `
              : ''
          }

          ${
            commissions.length
              ? `
                <div class="box box-green">
                  <div class="box-title">📈 Commissions</div>
                  <table class="comm-table">
                    <colgroup>
                      <col style="width: 30%;">
                      <col style="width: 38%;">
                      <col style="width: 12%;">
                      <col style="width: 20%;">
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Created</th>
                        <th>Label</th>
                        <th>Rate</th>
                        <th class="text-right">Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${commissions.map((row: any) => `
                        <tr>
                          <td>${esc(row?.createdAt || '—')}</td>
                          <td>${esc(row?.rowLabel || row?.employeeName || '—')}</td>
                          <td>${esc(row?.rate || '—')}</td>
                          <td class="text-right ${moneyClass(row?.commission, 'green')}">${fmtMoney(row?.commission)}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                  <div class="box-amount ${moneyClass(totals?.commissions_amount, 'green')}">${fmtMoney(totals?.commissions_amount)}</div>
                </div>
              `
              : ''
          }

          ${
            effectiveRates.length
              ? `
                <div class="box">
                  <div class="box-title">🏷️ Effective Rates</div>
                  <table class="rates-table left-table">
                    <colgroup>
                      <col style="width: 20%;">
                      <col style="width: 24%;">
                      <col style="width: 18%;">
                      <col style="width: 18%;">
                      <col style="width: 20%;">
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Type of Rate</th>
                        <th>Authorized Hours</th>
                        <th>Period Rate</th>
                        <th class="nowrap">Rate / Hour</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${effectiveRates.map((rate) => `
                        <tr>
                          <td>${esc(rate?.type ?? '—')}</td>
                          <td>${esc(rate?.type_of_rate ?? '—')}</td>
                          <td class="nowrap">${fmtHoursMaybe(rate?.authorized_hours)}</td>
                          <td class="nowrap">${fmtMoneyMaybe(rate?.period_rate)}</td>
                          <td class="nowrap">${fmtMoneyMaybe(rate?.rate_per_hour)}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              `
              : ''
          }

          ${
            holidaysInRange.length
              ? `
                <div class="box box-gray">
                  <div class="box-title">🎉 Holidays in Range</div>
                  <table class="holidays-table left-table">
                    <colgroup>
                      <col style="width: 12%;">
                      <col style="width: 22%;">
                      <col style="width: 10%;">
                      <col style="width: 14%;">
                      <col style="width: 18%;">
                      <col style="width: 10%;">
                      <col style="width: 8%;">
                      <col style="width: 8%;">
                      <col style="width: 8%;">
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Name</th>
                        <th>Rate ID</th>
                        <th>Period</th>
                        <th>Range</th>
                        <th>Type</th>
                        <th class="nowrap">Rate / Hour</th>
                        <th class="nowrap">Hours</th>
                        <th class="nowrap">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${holidaysInRange.map((holiday) => {
                        const meta = holidayMeta(holiday);

                        return `
                          <tr class="holiday-row">
                            <td class="nowrap">${esc(holiday?.date)}</td>
                            <td>${esc(holiday?.name || holiday?.holiday_name || 'Holiday')}</td>
                            <td class="nowrap">${esc(holiday?.rate_id ?? '—')}</td>
                            <td class="nowrap">${esc(meta.period)}</td>
                            <td class="nowrap">${esc(meta.range)}</td>
                            <td class="nowrap">${esc(meta.type)}</td>
                            <td class="nowrap">${fmtMoneyMaybe(holiday?.rate_per_hour)}</td>
                            <td class="nowrap">${fmtHoursMaybe(holiday?.total_hours ?? holiday?.hours)}</td>
                            <td class="nowrap">${fmtMoneyMaybe(holiday?.calculated_total ?? holiday?.amount)}</td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              `
              : ''
          }
        </div>
      </div>
    </body>
  </html>
  `;
}
