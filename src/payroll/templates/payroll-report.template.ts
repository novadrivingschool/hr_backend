/* src\payroll\templates\payroll-report.template.ts */
export function buildPayrollHtml(
  data: any[],
  work_schedule: string,
  start_date: string,
  end_date: string,
): string {

  const fmtDate = (raw: string) => {
    if (!raw) return '—';
    const [y, m, d] = raw.substring(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const cards = data.map(emp => {
    const ratePerHour       = emp.rate_office_staff / emp.authorized_hours;
    const timeOffDeduction  = emp.time_off.total_hours * ratePerHour;
    const extraHoursPay     = emp.extra_hours.total_hours * ratePerHour;
    const advancedDeduction = emp.advanced_requests?.total_amount ?? 0;

    const oneHours  = (emp.activity_report_one?.total_hours   ?? 0)
                    + (emp.activity_report_one?.total_minutes ?? 0) / 60;
    const voutHours = emp.activity_report_vout?.total_hours ?? 0;
    const tcwHours  = emp.tcw_hours?.total_hours            ?? null;

    const workedHours = oneHours + voutHours;
    const basePay     = workedHours >= emp.authorized_hours
      ? emp.rate_office_staff
      : workedHours * ratePerHour;

    // ── Holidays ────────────────────────────────────────────────
    const holidays: { id: string; name: string; date: string }[] =
      emp.holidays_in_range ?? [];
    const holidayPay = holidays.length * 8 * ratePerHour;

    // ── Compensations ───────────────────────────────────────────
    const inFavor:  any[] = emp.compensation_summary?.in_favor  ?? [];
    const toDeduct: any[] = emp.compensation_summary?.to_deduct ?? [];

    const compInFavorTotal  = inFavor.reduce((s: number, l: any)  => s + Number(l.amount ?? 0), 0);
    const compToDeductTotal = toDeduct.reduce((s: number, l: any) => s + Number(l.amount ?? 0), 0);
    const compNet           = compInFavorTotal - compToDeductTotal;

    const typeLabel = (type: string) => ({
      BONUS: 'Bonus', GIFT: 'Gift', RECOGNITION: 'Recognition',
      INCENTIVE: 'Incentive', LOAN: 'Loan', FIXED_DEDUCTION: 'Deduction',
    }[type] ?? type);

    const netPay = basePay
      - timeOffDeduction
      + extraHoursPay
      - advancedDeduction
      + holidayPay
      + compNet;

    // ── Holidays HTML block ──────────────────────────────────────
    const holidaysBlock = holidays.length === 0 ? '' : `
      <div class="box box-purple">
        <div class="box-title">⬆ Paid Holidays (addition)</div>

        <table class="holiday-table">
          <thead>
            <tr>
              <th>Holiday</th>
              <th>Date</th>
              <th>Hrs</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${holidays.map(h => `
              <tr>
                <td>${h.name}</td>
                <td>${fmtDate(h.date)}</td>
                <td>8 hrs</td>
                <td class="text-right amount-green">+$${(8 * ratePerHour).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="box-amount green">+$${holidayPay.toFixed(2)}</div>
      </div>
    `;

    // ── Compensations HTML block ────────────────────────────────
    const hasComps = inFavor.length > 0 || toDeduct.length > 0;
    const compensationsBlock = !hasComps ? '' : `
      <div class="box box-comp">
        <div class="box-title">💼 Employee Compensations</div>

        <table class="holiday-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Detail</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${inFavor.map((l: any) => `
              <tr>
                <td>${l.name ?? '—'}</td>
                <td>${typeLabel(l.type)}</td>
                <td>${l.installment
                  ? `Installment #${l.installment.installment_number} · ${l.installment.status}`
                  : (l.effective_date ?? '—')}</td>
                <td class="text-right amount-green">+$${Number(l.amount ?? 0).toFixed(2)}</td>
              </tr>
            `).join('')}
            ${toDeduct.map((l: any) => `
              <tr>
                <td>${l.name ?? '—'}</td>
                <td>${typeLabel(l.type)}</td>
                <td>${l.installment
                  ? `Installment #${l.installment.installment_number} · ${l.installment.status}`
                  : (l.effective_date ?? '—')}</td>
                <td class="text-right amount-red">-$${Number(l.amount ?? 0).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="comp-subtotal">
          <span class="comp-subtotal-label">Compensation net</span>
          <span class="comp-subtotal-val ${compNet >= 0 ? 'amount-green' : 'amount-red'}">
            ${compNet >= 0 ? '+' : ''}$${Math.abs(compNet).toFixed(2)}
          </span>
        </div>
      </div>
    `;

    return `
      <div class="card">
        <div class="card-header">
          <span class="emp-name">${emp.name} ${emp.last_name}</span>
          <span class="emp-number">${emp.employee_number}</span>
        </div>

        <div class="card-body">

          <div class="section">
            <div class="row">
              <div class="field">
                <span class="label">Income Type</span>
                <span class="value">${emp.type_of_income || '—'}</span>
              </div>
              <div class="field">
                <span class="label">Pay Frequency</span>
                <span class="value">${emp.pay_frequency || '—'}</span>
              </div>
              <div class="field">
                <span class="label">Monthly Rate</span>
                <span class="value">$${emp.rate_office_staff.toFixed(2)}</span>
              </div>
            </div>

            <div class="row">
              <div class="field">
                <span class="label">Authorized Hours</span>
                <span class="value">${emp.authorized_hours} hrs</span>
              </div>
              <div class="field">
                <span class="label">Rate / Hour</span>
                <span class="value">$${ratePerHour.toFixed(6)}</span>
              </div>
              <div class="field">
                <span class="label">Payment Method</span>
                <span class="value">${emp.payment_method || '—'}</span>
              </div>
            </div>

            <div class="row">
              <div class="field">
                <span class="label">Activity Report ONE</span>
                <span class="value">${oneHours > 0 ? `${oneHours} hrs` : '—'}</span>
              </div>
              <div class="field">
                <span class="label">Activity Report VOUT</span>
                <span class="value">${voutHours > 0 ? `${voutHours} hrs` : '—'}</span>
              </div>
              <div class="field">
                <span class="label">TCW Hours (info only)</span>
                <span class="value">${tcwHours !== null ? `${tcwHours} hrs` : '—'}</span>
              </div>
            </div>

            <div class="row">
              <div class="field">
                <span class="label">Base Pay</span>
                <span class="value ${workedHours >= emp.authorized_hours ? 'value-ok' : 'value-warn'}">
                  $${basePay.toFixed(2)} ${workedHours > 0 ? `(${workedHours} hrs)` : ''}
                </span>
              </div>
              <div class="field"></div>
              <div class="field"></div>
            </div>
          </div>

          <div class="divider"></div>

          <div class="boxes-grid">

            <div class="box box-red">
              <div class="box-title">⬇ Time Off (deduction)</div>
              <div class="box-row">
                <div class="field">
                  <span class="label">Requests</span>
                  <span class="value">${emp.time_off.total_requests}</span>
                </div>
                <div class="field">
                  <span class="label">Hours (max 8/day)</span>
                  <span class="value">${emp.time_off.total_hours} hrs</span>
                </div>
              </div>
              <div class="box-amount red">-$${timeOffDeduction.toFixed(2)}</div>
            </div>

            <div class="box box-green">
              <div class="box-title">⬆ Extra Hours (addition)</div>
              <div class="box-row">
                <div class="field">
                  <span class="label">Requests</span>
                  <span class="value">${emp.extra_hours.total_requests}</span>
                </div>
                <div class="field">
                  <span class="label">Hours</span>
                  <span class="value">${emp.extra_hours.total_hours} hrs</span>
                </div>
              </div>
              <div class="box-amount green">+$${extraHoursPay.toFixed(2)}</div>
            </div>

            <div class="box box-orange">
              <div class="box-title">⬇ Advanced Requests (deduction)</div>
              <div class="box-row">
                <div class="field">
                  <span class="label">Requests</span>
                  <span class="value">${emp.advanced_requests?.total_requests ?? 0}</span>
                </div>
                <div class="field">
                  <span class="label">Status</span>
                  <span class="value">Processed</span>
                </div>
              </div>
              <div class="box-amount orange">-$${advancedDeduction.toFixed(2)}</div>
            </div>

          </div>

          ${holidaysBlock}

          ${compensationsBlock}

          <div class="net-pay">
            <span class="net-label">NET PAY</span>
            <span class="net-amount">$${netPay.toFixed(2)}</span>
          </div>

        </div>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8"/>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          font-size: 11px;
          color: #222;
          background: #fff;
        }

        .report-header {
          background: #1a1a2e;
          color: #fff;
          padding: 16px 24px;
          margin-bottom: 20px;
          border-radius: 6px;
        }
        .report-header h1 { font-size: 20px; font-weight: 700; letter-spacing: 2px; }
        .report-header p  { font-size: 10px; color: #aaa; margin-top: 4px; }

        .card {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          margin-bottom: 16px;
          page-break-inside: avoid;
        }
        .card-header {
          background: #1a1a2e; color: #fff;
          padding: 10px 14px;
          display: flex; justify-content: space-between; align-items: center;
          border-radius: 7px 7px 0 0;
        }
        .emp-name   { font-size: 13px; font-weight: 700; }
        .emp-number { font-size: 10px; color: #aaa; }

        .card-body { padding: 14px; }
        .section   { margin-bottom: 10px; }

        .row   { display: flex; gap: 12px; margin-bottom: 8px; }
        .field { flex: 1; display: flex; flex-direction: column; gap: 2px; }

        .label {
          font-size: 8px; text-transform: uppercase;
          color: #999; font-weight: 400; letter-spacing: 0.5px;
        }
        .value      { font-size: 11px; font-weight: 700; color: #1a1a2e; }
        .value-ok   { color: #27ae60; }
        .value-warn { color: #c0622b; }

        .divider { border-top: 1px solid #eee; margin: 10px 0; }

        .boxes-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
          margin-bottom: 10px;
        }

        .box        { border-radius: 6px; padding: 10px 12px; margin-bottom: 10px; }
        .box-red    { background: #fff5f5; border: 1px solid #fcc; }
        .box-green  { background: #f0fff4; border: 1px solid #b2dfdb; }
        .box-orange { background: #fff8f0; border: 1px solid #f5c4a1; }
        .box-purple { background: #f5f3ff; border: 1px solid #ddd6fe; }

        .box-title {
          font-size: 9px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.5px;
          margin-bottom: 8px; color: #555;
        }
        .box-row { display: flex; gap: 12px; margin-bottom: 8px; }

        .box-amount            { font-size: 15px; font-weight: 800; text-align: right; margin-top: 6px; }
        .box-amount.red        { color: #c0392b; }
        .box-amount.green      { color: #27ae60; }
        .box-amount.orange     { color: #c0622b; }

        /* ── Holiday table ─────────────────────────────────────── */
        .holiday-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 6px;
          font-size: 10px;
        }
        .holiday-table th {
          text-align: left;
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          color: #7c3aed;
          font-weight: 700;
          padding: 3px 6px;
          border-bottom: 1px solid #ddd6fe;
        }
        .holiday-table td {
          padding: 4px 6px;
          color: #1a1a2e;
          border-bottom: 1px solid #ede9fe;
          font-weight: 500;
        }
        .holiday-table tr:last-child td { border-bottom: none; }
        .text-right  { text-align: right; }
        .amount-green { color: #27ae60; font-weight: 700; }

        /* ── Net Pay ───────────────────────────────────────────── */
        .net-pay {
          display: flex; justify-content: space-between; align-items: center;
          background: #f0f4ff;
          border-left: 4px solid #1a1a2e;
          border-radius: 4px;
          padding: 10px 14px;
          margin-top: 12px;
        }
        .net-label  { font-size: 10px; font-weight: 700; color: #1a1a2e; text-transform: uppercase; letter-spacing: 1px; }
        .net-amount { font-size: 16px; font-weight: 800; color: #1a1a2e; }

        .box-comp   { background: #f0f4ff; border: 1px solid #c7d2fe; }

        .comp-subtotal {
          display: flex; justify-content: space-between; align-items: center;
          background: #e0e7ff; border-radius: 4px;
          padding: 5px 8px; margin-top: 6px;
        }
        .comp-subtotal-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #3730a3; }
        .comp-subtotal-val   { font-size: 13px; font-weight: 800; }

        .amount-red  { color: #c0392b; font-weight: 700; }

        .footer { text-align: right; font-size: 8px; color: #bbb; margin-top: 10px; }
      </style>
    </head>
    <body>

      <div class="report-header">
        <h1>PAYROLL REPORT</h1>
        <p>
          Period: ${start_date} → ${end_date}
          &nbsp;|&nbsp;
          Schedule: ${work_schedule.toUpperCase()}
          &nbsp;|&nbsp;
          ${data.length} employee(s)
        </p>
      </div>

      ${cards}

      <div class="footer">Generated: ${new Date().toLocaleString()}</div>

    </body>
    </html>
  `;
}