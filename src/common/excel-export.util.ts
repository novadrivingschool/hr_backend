import { Workbook } from 'exceljs'

/**
 * Construye un .xlsx formateado (headers en negrita con color, bordes, filas
 * alternas, auto-ancho y header congelado) a partir de un arreglo de registros.
 * Devuelve el Buffer listo para enviar como descarga.
 */
export async function buildRecordsExcel(
  rows: any[],
  opts: { sheetName: string; headerColor: string; exclude?: string[] },
): Promise<Buffer> {
  const exclude = new Set(opts.exclude ?? ['id', 'created_at', 'updated_at'])
  const wb = new Workbook()
  const ws = wb.addWorksheet(opts.sheetName)

  const keys = rows.length ? Object.keys(rows[0]).filter((k) => !exclude.has(k)) : []
  const fmtHeader = (k: string) =>
    k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  ws.columns = keys.map((k) => ({ header: fmtHeader(k), key: k }))
  rows.forEach((r) => ws.addRow(r))

  const thin = { style: 'hair' as const, color: { argb: 'FFE0E0E0' } }

  const head = ws.getRow(1)
  head.height = 22
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.headerColor } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { top: thin, bottom: thin, left: thin, right: thin }
  })

  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i)
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: thin, bottom: thin, left: thin, right: thin }
      cell.alignment = { vertical: 'middle' }
    })
    if (i % 2 === 0) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7FC' } }
      })
    }
  }

  ws.columns.forEach((col) => {
    let max = String(col.header || '').length
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const v = cell.value == null ? '' : String(cell.value)
      if (v.length > max) max = v.length
    })
    col.width = Math.min(Math.max(max + 2, 10), 50)
  })

  ws.views = [{ state: 'frozen', ySplit: 1 }]

  return (await wb.xlsx.writeBuffer()) as Buffer
}

/**
 * Construye el .xlsx del RESUMEN de Instructor Payroll, coloreado por sección
 * (cada bloque de columnas con su color), con formato de moneda y auto-ancho.
 */
export async function buildIpSummaryExcel(
  rows: any[],
  asTypes: { key: string; label: string; cellBg: string; color: string; bg: string }[],
): Promise<Buffer> {
  const argb = (h: string) => 'FF' + String(h).replace('#', '').toUpperCase()
  const cols: any[] = [
    { header: 'Instructor', key: 'instructor_name', hFill: 'FF3C2F8C', dFill: 'FFEFEDFB' },
    { header: 'Employee #', key: 'matched_employee_number', hFill: 'FF3C2F8C', dFill: 'FFEFEDFB' },
    { header: 'Nombre', key: 'matched_full_name', hFill: 'FF3C2F8C', dFill: 'FFEFEDFB' },
    { header: 'BTW Reg', key: 'btw_count', hFill: 'FF5050B0', dFill: 'FFEDEDFC' },
    { header: 'BTW Hrs', key: 'btw_hours', hFill: 'FF5050B0', dFill: 'FFEDEDFC' },
    { header: 'BTW Rate', key: 'btw_rate', money: true, hFill: 'FF5050B0', dFill: 'FFEDEDFC' },
    { header: 'BTW $', key: 'btw_pay', money: true, hFill: 'FF5050B0', dFill: 'FFDDDDF5' },
    { header: 'CR Reg', key: 'tp_count', hFill: 'FF2E7D32', dFill: 'FFE8F5E9' },
    { header: 'CR Hrs', key: 'tp_hours', hFill: 'FF2E7D32', dFill: 'FFE8F5E9' },
    { header: 'CR Rate', key: 'cr_rate', money: true, hFill: 'FF2E7D32', dFill: 'FFE8F5E9' },
    { header: 'CR $', key: 'tp_pay', money: true, hFill: 'FF2E7D32', dFill: 'FFC8E6C9' },
  ]
  for (const t of asTypes) {
    const h = argb(t.color)
    const d = argb(t.cellBg)
    const dPay = argb(t.bg)
    cols.push({ header: `${t.label} Reg`, key: `as_${t.key}_count`, hFill: h, dFill: d })
    cols.push({ header: `${t.label} Hrs`, key: `as_${t.key}_hours`, hFill: h, dFill: d })
    cols.push({ header: `${t.label} Rate`, key: `as_${t.key}_rate`, money: true, hFill: h, dFill: d })
    cols.push({ header: `${t.label} $`, key: `as_${t.key}_pay`, money: true, hFill: h, dFill: dPay })
  }
  cols.push({ header: 'No Show Reg', key: 'ns_count', hFill: 'FF880E4F', dFill: 'FFFCE4EC' })
  cols.push({ header: 'No Show Hrs', key: 'ns_hours', hFill: 'FF880E4F', dFill: 'FFFCE4EC' })
  cols.push({ header: 'No Show Rate', key: 'no_show_cancellation_rate', money: true, hFill: 'FF880E4F', dFill: 'FFFCE4EC' })
  cols.push({ header: 'No Show $', key: 'ns_pay', money: true, hFill: 'FF880E4F', dFill: 'FFF8BBD0' })
  cols.push({ header: 'Total $', key: 'total_pay', money: true, hFill: 'FF1C1C3E', dFill: 'FFE8E7FC' })

  const wb = new Workbook()
  const ws = wb.addWorksheet('Instructor Payroll')
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key }))
  rows.forEach((r) => ws.addRow(r))

  const thin = { style: 'thin' as const, color: { argb: 'FFC8C8C8' } }
  const head = ws.getRow(1)
  head.height = 26
  head.eachCell((cell, colNumber) => {
    const c = cols[colNumber - 1] || {}
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.hFill || 'FF1C1C3E' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { top: thin, bottom: thin, left: thin, right: thin }
  })
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i)
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const c = cols[colNumber - 1] || {}
      cell.border = { top: thin, bottom: thin, left: thin, right: thin }
      cell.alignment = { vertical: 'middle' }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.dFill || 'FFFFFFFF' } }
    })
  }
  cols.forEach((c, idx) => {
    const col = ws.getColumn(idx + 1)
    if (c.money) col.numFmt = '"$"#,##0.00'
    let max = String(c.header || '').length
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      let v = cell.value == null ? '' : String(cell.value)
      // Para columnas de dinero, medir el ancho del valor YA formateado ($1,234.56), no el crudo.
      if (c.money && cell.value != null && cell.value !== '' && !isNaN(Number(cell.value))) {
        v = '$' + Number(cell.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      }
      if (v.length > max) max = v.length
    })
    col.width = Math.min(Math.max(max + 4, 12), 50)
  })
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]

  return (await wb.xlsx.writeBuffer()) as Buffer
}
