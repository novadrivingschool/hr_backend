export function buildSummaryEmployeeHtml(emp: any): string {
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

  const moneyClass = (value: any, fallback: 'green' | 'red' | 'neutral' = 'neutral') => {
    const n = num(value);
    if (n > 0) return 'amount-green';
    if (n < 0) return 'amount-red';
    if (fallback === 'green') return 'amount-green';
    if (fallback === 'red') return 'amount-red';
    return '';
  };

  const emptyInline = (text: string) => `<div class="empty-inline">${esc(text)}</div>`;

  const fullName = [emp?.name, emp?.last_name].filter(Boolean).join(' ') || '—';
  const tcwDisplayName = emp?.tcw_display_name || null;
  const periodStart = emp?.period?.start_date || '—';
  const periodEnd = emp?.period?.end_date || '—';

  const totals = emp?.payroll_totals ?? {};
  const rate = emp?.rate ?? {};
  const validRate = rate?.valid_rate ?? {};

  const scheduleDetails = Array.isArray(emp?.schedule_details) ? emp.schedule_details : [];
  const timeOffDetails = Array.isArray(emp?.time_off?.details) ? emp.time_off.details : [];
  const extraHoursDetails = Array.isArray(emp?.extra_hours?.details) ? emp.extra_hours.details : [];
  const advancedDetails = Array.isArray(emp?.advanced_requests?.details) ? emp.advanced_requests.details : [];
  const compInFavor = Array.isArray(emp?.compensation_summary?.in_favor) ? emp.compensation_summary.in_favor : [];
  const compToDeduct = Array.isArray(emp?.compensation_summary?.to_deduct) ? emp.compensation_summary.to_deduct : [];
  const commissions = Array.isArray(emp?.commissions_summary) ? emp.commissions_summary : [];
  const holidaysInRange = Array.isArray(emp?.holidays_in_range) ? emp.holidays_in_range : [];
  const seasonalRates = Array.isArray(validRate?.seasonal_rates) ? validRate.seasonal_rates : [];

  const typeLabel = (type: string) => {
    switch (type) {
      case 'BONUS': return 'Bonus';
      case 'GIFT': return 'Gift';
      case 'RECOGNITION': return 'Recognition';
      case 'INCENTIVE': return 'Incentive';
      case 'LOAN': return 'Loan';
      case 'FIXED_DEDUCTION': return 'Deduction';
      case 'SALARY_ADJUSTMENT': return 'Salary Adjustment';
      default: return type || '—';
    }
  };

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>Payroll Summary - ${esc(emp?.employee_number)}</title>
      <style>
        * { box-sizing: border-box; }
        html, body {
          margin: 0; padding: 0;
          font-family: Arial, Helvetica, sans-serif;
          background: #f4f6f8;
          color: #1f2937;
          font-size: 11px;
        }
        body { padding: 18px; }
        #report-container { width: 100%; }
        .sheet {
          background: #ffffff;
          border-radius: 14px;
          padding: 18px;
          box-shadow: 0 8px 24px rgba(15,23,42,0.08);
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 16px;
        }
        .title { margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; }
        .subtitle { margin: 4px 0 0; color: #64748b; font-size: 12px; }
        .tag {
          display: inline-block; font-size: 10px; padding: 4px 8px;
          border-radius: 999px; background: #eef2ff; color: #4338ca;
          border: 1px solid #c7d2fe; white-space: nowrap;
        }
        .tag-season { background: #fef3c7; color: #92400e; border-color: #fde68a; }
        .tag-office { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
        .tag-holiday { background: #f5f3ff; color: #6d28d9; border-color: #ddd6fe; }
        .box {
          border: 1px solid #e5e7eb; border-radius: 12px;
          padding: 14px; background: #fff; margin-bottom: 12px;
        }
        .box-gray { background: #f8fafc; }
        .box-red { background: #fff7f7; border-color: #fecaca; }
        .box-green { background: #f5fff8; border-color: #bbf7d0; }
        .box-orange { background: #fffaf3; border-color: #fed7aa; }
        .box-comp { background: #faf7ff; border-color: #ddd6fe; }
        .box-title { font-size: 13px; font-weight: 700; margin-bottom: 10px; color: #0f172a; }
        .box-subtitle { color: #64748b; margin-bottom: 8px; font-size: 11px; }
        .box-amount { margin-top: 10px; font-weight: 700; text-align: right; color: #0f172a; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .mt-12 { margin-top: 12px; }
        table { width: 100%; border-collapse: collapse; }
        .summary-table td {
          padding: 8px 6px; border-bottom: 1px solid #e5e7eb;
          vertical-align: top; text-align: left;
        }
        .summary-table td:last-child { text-align: right; }
        th, td {
          padding: 8px 6px; border-bottom: 1px solid #e5e7eb;
          vertical-align: top; text-align: left;
        }
        th {
          background: #f8fafc; color: #334155;
          font-size: 10px; font-weight: 700;
        }
        .text-right { text-align: right !important; }
        .nowrap { white-space: nowrap; }
        .amount-green { color: #15803d; font-weight: 700; }
        .amount-red { color: #b91c1c; font-weight: 700; }
        .holiday-row { background: #faf5ff; }
        .season-row { background: #fffbeb; }
        .empty-inline { color: #64748b; font-style: italic; padding: 6px 0; }
        .comp-subtotal {
          display: flex; justify-content: space-between; align-items: center;
          margin-top: 10px; padding-top: 10px;
          border-top: 1px dashed #cbd5e1; font-weight: 700;
        }
        .hours-bar {
          display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 10px;
        }
        .hours-chip {
          display: flex; flex-direction: column; align-items: center;
          background: #f1f5f9; border-radius: 10px; padding: 8px 14px;
          border: 1px solid #e2e8f0; min-width: 90px;
        }
        .hours-chip__label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
        .hours-chip__value { font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px; }
        .hours-chip--tcw { background: #ecfeff; border-color: #a5f3fc; }
        .hours-chip--tcw .hours-chip__value { color: #0e7490; }
        .hours-chip--payable { background: #f0fdf4; border-color: #bbf7d0; }
        .hours-chip--payable .hours-chip__value { color: #15803d; }
        .hours-chip--total { background: #eef2ff; border-color: #c7d2fe; }
        .hours-chip--total .hours-chip__value { color: #4338ca; }
        .hours-chip--timeoff { background: #fdecec; border-color: #f1b0b0; }
        .hours-chip--timeoff .hours-chip__value { color: #c0392b; }
        .hours-chip--extra { background: #f3e9fb; border-color: #d3aee8; }
        .hours-chip--extra .hours-chip__value { color: #6a1b9a; }
        .source-badge {
          display: inline-block; padding: 3px 8px; border-radius: 6px;
          font-size: 10px; font-weight: 700;
          background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;
        }
        .source-badge--tcw { background: #ecfeff; color: #0e7490; border-color: #a5f3fc; }
        .emp-tcw-name {
          display: block; font-size: 26px; font-weight: 900;
          background: linear-gradient(90deg, #4f46e5, #0ea5e9);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          margin-top: 6px; letter-spacing: -0.5px; line-height: 1.15;
        }
        .emp-real-name {
          display: inline-block; font-size: 10px; color: #64748b;
          font-style: italic; margin-top: 5px; padding: 2px 8px;
          background: #f1f5f9; border-radius: 4px; border: 1px solid #e2e8f0;
        }
      </style>
    </head>
    <body>
      <div id="report-container">
        <div class="sheet">

          <!-- HEADER -->
          <div class="header">
            <div>
              <h1 class="title">Payroll Summary Report</h1>
              ${tcwDisplayName
                ? `<span class="emp-tcw-name">${esc(tcwDisplayName)}</span>
                   <span class="emp-real-name">&#128101; ${esc(fullName)}</span>`
                : `<p class="subtitle">${esc(fullName)}</p>`
              }
              <p class="subtitle" style="margin-top:6px">
                ${esc(emp?.employee_number)}
              </p>
              <p style="margin:6px 0 0; font-size:13px; font-weight:700; color:#4f46e5; background:#eef2ff; display:inline-block; padding:3px 10px; border-radius:6px; border:1px solid #c7d2fe;">
                📅 ${esc(periodStart)} — ${esc(periodEnd)}
              </p>
            </div>
          </div>

          <!-- EMPLOYEE INFO + RATES -->
          <div class="grid-2">
            <div class="box">
              <div class="box-title">👤 Employee Information</div>
              <table class="summary-table">
                <tbody>
                  <tr><td>Work Schedule</td><td>${esc(emp?.work_schedule)}</td></tr>
                  <tr><td>Days Worked</td><td>${esc(emp?.days_worked ?? 0)}</td></tr>
                  <tr><td>Payment Method</td><td>${esc(rate?.payment_method)}</td></tr>
                </tbody>
              </table>
            </div>

            <div class="box">
              <div class="box-title">🏷️ Valid Rates</div>
              ${seasonalRates.length ? `
                <div class="box-subtitle">Seasonal Rates</div>
                <table>
                  <thead><tr><th>Season</th><th>From</th><th>To</th><th class="text-right">Rate</th></tr></thead>
                  <tbody>
                    ${seasonalRates.map((r: any) => `
                      <tr>
                        <td><span class="tag tag-season">${esc(r?.season)}</span></td>
                        <td class="nowrap">${esc(r?.start_date)}</td>
                        <td class="nowrap">${esc(r?.end_date)}</td>
                        <td class="text-right">${fmtMoney(r?.amount)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : ''}
              <div class="box-subtitle" style="margin-top:${seasonalRates.length ? '10px' : '0'}">Office Rate</div>
              <table>
                <tbody>
                  <tr>
                    <td><span class="tag tag-office">Office Staff</span></td>
                    <td class="text-right">${fmtMoney(validRate?.office_rate?.amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- HOURS SUMMARY -->
          <div class="box box-gray">
            <div class="box-title">⏱️ Hours Summary</div>
            <div class="hours-bar">
              <div class="hours-chip">
                <span class="hours-chip__label">Auth. Work Hrs</span>
                <span class="hours-chip__value">${num(totals?.authorized_hours?.work_hours).toFixed(2)}</span>
              </div>
              <div class="hours-chip">
                <span class="hours-chip__label">Lunch Hrs</span>
                <span class="hours-chip__value">${num(totals?.authorized_hours?.lunch_hours).toFixed(2)}</span>
              </div>
              <div class="hours-chip hours-chip--tcw">
                <span class="hours-chip__label">TCW Hrs</span>
                <span class="hours-chip__value">${num(totals?.time_clock_wizard_hours).toFixed(2)}</span>
              </div>
              <div class="hours-chip hours-chip--timeoff">
                <span class="hours-chip__label">Time Off Hrs</span>
                <span class="hours-chip__value">&minus;${num(totals?.time_off_hours).toFixed(2)}</span>
              </div>
              <div class="hours-chip hours-chip--extra">
                <span class="hours-chip__label">Extra Hrs</span>
                <span class="hours-chip__value">+${num(totals?.extra_hours_hours).toFixed(2)}</span>
              </div>
              <div class="hours-chip hours-chip--total">
                <span class="hours-chip__label">Auth. + Adjust.</span>
                <span class="hours-chip__value">${num(totals?.authorized_hours_with_adjustments).toFixed(2)}</span>
              </div>
              <div class="hours-chip hours-chip--payable">
                <span class="hours-chip__label">Payable Hrs</span>
                <span class="hours-chip__value">${num(totals?.payable_hours).toFixed(2)}</span>
              </div>
            </div>
            <div>
              Payable hours source:
              <span class="source-badge ${totals?.payable_hours_source === 'tcw' ? 'source-badge--tcw' : ''}">
                ${esc(totals?.payable_hours_source)}
              </span>
            </div>
          </div>

          <!-- PAYROLL TOTALS -->
          <div class="box box-gray">
            <div class="box-title">💰 Payroll Totals</div>
            <table>
              <colgroup>
                <col style="width:30%"><col style="width:20%">
                <col style="width:30%"><col style="width:20%">
              </colgroup>
              <tbody>
                <tr>
                  <td>Work Shift Amount</td>
                  <td class="text-right ${moneyClass(totals?.authorized_work_shift_amount, 'green')}">${fmtMoney(totals?.authorized_work_shift_amount)}</td>
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
                  <td></td><td></td>
                </tr>
              </tbody>
            </table>
            <!-- TOTAL DESTACADO -->
            <div style="margin-top:12px; padding:10px 16px; border-top:2px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:12px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.5px;">Total Payroll Amount</span>
              <span style="font-size:20px; font-weight:800; color:#0f172a;">${fmtMoney(totals?.total_payroll_amount)}</span>
            </div>
          </div>

          <!-- DAILY LOG -->
          <div class="box box-gray">
            <div class="box-title">📘 Daily Log</div>
            ${scheduleDetails.length ? `
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th class="text-right">Nova Sched.</th>
                    <th class="text-right">Vout Sched.</th>
                    <th class="text-right">AR Nova</th>
                    <th class="text-right">AR Vout</th>
                    <th class="text-right">TCW</th>
                  </tr>
                </thead>
                <tbody>
                  ${(() => {
                    let totalNovaSchedH = 0, totalVoutSchedH = 0;
                    let totalArNova = 0, totalArVout = 0, totalTcwH = 0;
                    const rows = scheduleDetails.map((day: any) => {
                      const novaShifts = Array.isArray(day?.nova_shifts) ? day.nova_shifts : [];
                      const voutShifts = Array.isArray(day?.vout_shifts) ? day.vout_shifts : [];
                      const novaSchedH = novaShifts.reduce((s: number, sh: any) => s + num(sh?.hours), 0);
                      const voutSchedH = voutShifts.reduce((s: number, sh: any) => s + num(sh?.hours), 0);
                      const arNova    = num(day?.ar_nova_hours);
                      const arVout    = num(day?.ar_vout_hours);
                      const tcwH      = num(day?.tcw_hours);
                      totalNovaSchedH += novaSchedH;
                      totalVoutSchedH += voutSchedH;
                      totalArNova     += arNova;
                      totalArVout     += arVout;
                      totalTcwH       += tcwH;
                      const typeTag = day?.is_holiday
                        ? '<span class="tag tag-holiday">' + esc(day?.holiday_name || 'Holiday') + '</span>'
                        : day?.season
                          ? '<span class="tag tag-season">Seasonal</span>'
                          : '<span class="tag tag-office">Office</span>';
                      return `
                        <tr class="${day?.is_holiday ? 'holiday-row' : day?.season ? 'season-row' : ''}">
                          <td class="nowrap">${esc(day?.date)}</td>
                          <td>${typeTag}</td>
                          <td class="text-right nowrap">${novaSchedH > 0 ? fmtHours(novaSchedH) : '—'}</td>
                          <td class="text-right nowrap">${voutSchedH > 0 ? fmtHours(voutSchedH) : '—'}</td>
                          <td class="text-right nowrap">${arNova > 0 ? fmtHours(arNova) : '—'}</td>
                          <td class="text-right nowrap">${arVout > 0 ? fmtHours(arVout) : '—'}</td>
                          <td class="text-right nowrap">${tcwH > 0 ? fmtHours(tcwH) : '—'}</td>
                        </tr>
                      `;
                    });
                    const totalsRow = `
                      <tr style="background:#f1f5f9;font-weight:700;border-top:2px solid #cbd5e1;">
                        <td class="nowrap" colspan="2" style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:0.5px;">TOTAL</td>
                        <td class="text-right nowrap">${totalNovaSchedH > 0 ? fmtHours(totalNovaSchedH) : '—'}</td>
                        <td class="text-right nowrap">${totalVoutSchedH > 0 ? fmtHours(totalVoutSchedH) : '—'}</td>
                        <td class="text-right nowrap">${totalArNova > 0 ? fmtHours(totalArNova) : '—'}</td>
                        <td class="text-right nowrap">${totalArVout > 0 ? fmtHours(totalArVout) : '—'}</td>
                        <td class="text-right nowrap">${num(totals?.time_clock_wizard_hours) > 0 ? fmtHours(num(totals?.time_clock_wizard_hours)) : '—'}</td>
                      </tr>
                    `;
                    return rows.join('') + totalsRow;
                  })()}
                </tbody>
              </table>
            ` : emptyInline('No daily log in this payroll period.')}
          </div>

          <!-- TIME OFF + EXTRA HOURS -->
          <div class="grid-2 mt-12">
            <div class="box box-red">
              <div class="box-title">🕒 Time Off</div>
              <div class="box-subtitle">${esc(emp?.time_off?.total_requests ?? 0)} requests · ${fmtHours(emp?.time_off?.total_hours)}</div>
              ${timeOffDetails.length ? `
                <table>
                  <thead><tr><th>Date</th><th>Season</th><th>Status</th><th class="text-right">Hrs</th><th class="text-right">Deducted</th></tr></thead>
                  <tbody>
                    ${timeOffDetails.map((d: any) => `
                      <tr>
                        <td class="nowrap">${esc(d?.date)}</td>
                        <td>${d?.season ? '<span class="tag tag-season">Seasonal</span>' : '<span class="tag tag-office">Office</span>'}</td>
                        <td>${d?.will_make_up_hours ? '<span class="tag" style="background:#f0fdf4;color:#166534;border-color:#bbf7d0">Recovery</span>' : '<span class="tag" style="background:#fff7f7;color:#b91c1c;border-color:#fecaca">Deducted</span>'}</td>
                        <td class="text-right">${fmtHours(d?.total_hours)}</td>
                        <td class="text-right ${d?.will_make_up_hours ? '' : moneyClass(d?.calculated_total, 'red')}">${d?.will_make_up_hours ? '—' : fmtMoney(d?.calculated_total)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : emptyInline('No time off records.')}
              <div class="box-amount ${moneyClass(totals?.time_off_amount, 'red')}">${fmtMoney(totals?.time_off_amount)}</div>
            </div>

            <div class="box box-green">
              <div class="box-title">⏫ Extra Hours</div>
              <div class="box-subtitle">${esc(emp?.extra_hours?.total_requests ?? 0)} requests · ${fmtHours(emp?.extra_hours?.total_hours)}</div>
              ${extraHoursDetails.length ? `
                <table>
                  <thead><tr><th>Date</th><th>Season</th><th class="text-right">Hrs</th><th class="text-right">Amount</th></tr></thead>
                  <tbody>
                    ${extraHoursDetails.map((d: any) => `
                      <tr>
                        <td class="nowrap">${esc(d?.date)}</td>
                        <td>${d?.season ? '<span class="tag tag-season">Seasonal</span>' : '<span class="tag tag-office">Office</span>'}</td>
                        <td class="text-right">${fmtHours(d?.total_hours)}</td>
                        <td class="text-right ${moneyClass(d?.calculated_total, 'green')}">${fmtMoney(d?.calculated_total)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : emptyInline('No extra hours records.')}
              <div class="box-amount ${moneyClass(totals?.extra_hours_amount, 'green')}">${fmtMoney(totals?.extra_hours_amount)}</div>
            </div>
          </div>

          <!-- HOLIDAYS -->
          ${holidaysInRange.length ? `
            <div class="box box-gray mt-12">
              <div class="box-title">🎉 Holidays in Range</div>
              <table>
                <thead><tr><th>Date</th><th>Name</th><th>Season</th><th class="text-right">Hrs</th><th class="text-right">Amount</th></tr></thead>
                <tbody>
                  ${holidaysInRange.map((h: any) => `
                    <tr class="holiday-row">
                      <td class="nowrap">${esc(h?.date)}</td>
                      <td>${esc(h?.name || 'Holiday')}</td>
                      <td>${h?.season ? '<span class="tag tag-season">Seasonal</span>' : '<span class="tag tag-office">Office</span>'}</td>
                      <td class="text-right">${fmtHoursMaybe(h?.total_hours)}</td>
                      <td class="text-right">${fmtMoneyMaybe(h?.calculated_total)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}

          <!-- ADVANCED REQUESTS -->
          ${advancedDetails.length ? `
            <div class="box box-orange mt-12">
              <div class="box-title">💸 Advanced Requests</div>
              <table>
                <thead><tr><th>Date</th><th>Payment Type</th><th>Processed</th><th class="text-right">Amount</th></tr></thead>
                <tbody>
                  ${advancedDetails.map((d: any) => `
                    <tr>
                      <td class="nowrap">${esc(d?.date)}</td>
                      <td>${esc(d?.payment_type || '—')}</td>
                      <td class="nowrap">${esc([d?.processed_date, d?.processed_time].filter(Boolean).join(' ') || '—')}</td>
                      <td class="text-right ${moneyClass(d?.amount, 'red')}">${fmtMoney(d?.amount)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div class="box-amount ${moneyClass(totals?.advanced_amount, 'red')}">${fmtMoney(totals?.advanced_amount)}</div>
            </div>
          ` : ''}

          <!-- COMPENSATIONS -->
          ${compInFavor.length || compToDeduct.length ? `
            <div class="box box-comp mt-12">
              <div class="box-title">💼 Employee Compensations</div>
              <table>
                <thead><tr><th>Name</th><th>Type</th><th>Detail</th><th class="text-right">Amount</th></tr></thead>
                <tbody>
                  ${compInFavor.map((l: any) => `
                    <tr>
                      <td>${esc(l?.name ?? '—')}</td>
                      <td>${esc(typeLabel(l?.reason))}</td>
                      <td>${esc(l?.installment ? `Installment #${l.installment.installment_number} · ${l.installment.status}` : (l?.effective_date ?? '—'))}</td>
                      <td class="text-right ${moneyClass(l?.amount, 'green')}">${fmtMoney(l?.installment?.amount ?? l?.amount)}</td>
                    </tr>
                  `).join('')}
                  ${compToDeduct.map((l: any) => `
                    <tr>
                      <td>${esc(l?.name ?? '—')}</td>
                      <td>${esc(typeLabel(l?.reason))}</td>
                      <td>${esc(l?.installment ? `Installment #${l.installment.installment_number} · ${l.installment.status}` : (l?.effective_date ?? '—'))}</td>
                      <td class="text-right ${moneyClass(-(l?.installment?.amount ?? l?.amount), 'red')}">${fmtMoney(l?.installment?.amount ?? l?.amount)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}

          <!-- COMMISSIONS -->
          ${commissions.length ? `
            <div class="box box-green mt-12">
              <div class="box-title">📈 Commissions</div>
              <table>
                <thead><tr><th>Label</th><th>Date Range</th><th>Rate</th><th class="text-right">Commission</th></tr></thead>
                <tbody>
                  ${commissions.map((row: any) => `
                    <tr>
                      <td>${esc(row?.rowLabel || row?.name || '—')}</td>
                      <td>${esc([row?.startDate, row?.endDate].filter(Boolean).join(' - ') || '—')}</td>
                      <td>${esc(row?.rate !== undefined ? `${row.rate}%` : '—')}</td>
                      <td class="text-right ${moneyClass(row?.commission, 'green')}">${fmtMoney(row?.commission || row?.amount)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div class="box-amount ${moneyClass(totals?.commissions_amount, 'green')}">${fmtMoney(totals?.commissions_amount)}</div>
            </div>
          ` : ''}

        </div>
      </div>
    </body>
  </html>
  `;
}
