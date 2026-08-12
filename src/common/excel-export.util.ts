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
  orphanDetail: any[] = [],
): Promise<Buffer> {
  const argb = (h: string) => 'FF' + String(h).replace('#', '').toUpperCase()
  const cols: any[] = [
    // Padre = empleado real (Employee #/Nombre/Employee Total $, fusionadas
    // más abajo cuando un empleado tiene 2+ danubenet names). Hijo = cada
    // danubenet name que ese empleado usó en el rango, con su propio período
    // y su propio Total $.
    { header: 'Employee #', key: 'matched_employee_number', hFill: 'FF241F5C', dFill: 'FFE3E1F5' },
    { header: 'Nombre', key: 'matched_full_name', hFill: 'FF241F5C', dFill: 'FFE3E1F5' },
    { header: 'DanubeNet Name', key: 'instructor_name', hFill: 'FF3C2F8C', dFill: 'FFEFEDFB' },
    { header: 'Período', key: 'period', hFill: 'FF3C2F8C', dFill: 'FFEFEDFB' },
    // Rate Period: sub-rango puntual de ESTA fila dentro del tramo (Período)
    // — distinto cuando employee_rate_history cambió de valor a mitad del
    // tramo, en cuyo caso el mismo tramo produce 2+ filas (una por cada
    // Rate Period), cada una con su propio Reg/Hrs/Rate/$.
    { header: 'Rate Period', key: 'rate_period', hFill: 'FF3C2F8C', dFill: 'FFEFEDFB' },
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
  cols.push({ header: 'Total $ (danubenet name)', key: 'total_pay', money: true, hFill: 'FF1C1C3E', dFill: 'FFE8E7FC' })
  cols.push({ header: 'Payroll Total $ (empleado)', key: 'employee_total_pay', money: true, hFill: 'FF241F5C', dFill: 'FFE3E1F5' })

  const wb = new Workbook()
  const ws = wb.addWorksheet('Instructor Payroll')
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key }))
  rows.forEach((r) => ws.addRow(r))

  // Fusiona verticalmente Employee #/Nombre/Payroll Total $ cuando un mismo
  // empleado (matched_employee_number) tiene 2+ filas consecutivas — o sea
  // usó 2+ danubenet names/tramos en el rango. `rows` ya viene ordenado por
  // empleado desde ip-summary.service.ts, así que basta con detectar
  // tramos contiguos. Sin employee_number (sin match) no se fusiona nada.
  const colIndexOf = (key: string) => cols.findIndex((c) => c.key === key) + 1
  const mergeSpans = (mergeCols: string[], sameSpan: (a: any, b: any) => boolean) => {
    let spanStart = 2 // fila 1 = header
    for (let i = 0; i < rows.length; i++) {
      const rowIdx = i + 2
      const isLastOfSpan = i === rows.length - 1 || !sameSpan(rows[i], rows[i + 1])
      if (isLastOfSpan) {
        if (rowIdx > spanStart) {
          for (const key of mergeCols) {
            const c = colIndexOf(key)
            if (c > 0) ws.mergeCells(spanStart, c, rowIdx, c)
          }
        }
        spanStart = rowIdx + 1
      }
    }
  }
  mergeSpans(
    ['matched_employee_number', 'matched_full_name', 'employee_total_pay'],
    (a, b) => !!a.matched_employee_number && a.matched_employee_number === b.matched_employee_number,
  )
  // DanubeNet Name/Período: fusiona SOLO las sub-filas de rate_period que
  // pertenecen al MISMO tramo de danubenet_history (segment_id) — nunca
  // entre tramos distintos, aunque compartan danubenet_name (ver
  // segment_id en ip-summary.service.ts::buildRow).
  mergeSpans(
    ['instructor_name', 'period'],
    (a, b) => a.segment_id != null && a.segment_id === b.segment_id,
  )

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
    const dataRow = rows[i - 2]
    const isUnmatched = !!dataRow?.unmatched
    const row = ws.getRow(i)
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const c = cols[colNumber - 1] || {}
      cell.border = { top: thin, bottom: thin, left: thin, right: thin }
      cell.alignment = { vertical: 'middle' }
      // Fila sin employee_number resuelto (sin tramo en danubenet_history
      // para esa fecha) — se pinta en rojo en vez de perderse en silencio,
      // para que salte a la vista que hay que revisar el historial.
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isUnmatched ? 'FFFDECEA' : (c.dFill || 'FFFFFFFF') } }
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

  // Segunda hoja: detalle REGISTRO POR REGISTRO de todo lo que no resolvió
  // ningún tramo de danubenet_history — incluye BTW no-completos (que no
  // cuentan para pago, pero antes desaparecían de toda la vista sin dejar
  // rastro). Es la fuente de verdad para auditar exactamente qué registros
  // faltan y por qué, en vez de adivinar a partir de un conteo agregado.
  if (orphanDetail.length) {
    const wsDetail = wb.addWorksheet('Sin empleado (detalle)')
    wsDetail.columns = [
      { header: 'Tipo', key: 'type', width: 22 },
      { header: 'DanubeNet Name', key: 'danubenet_name', width: 28 },
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Horas', key: 'hours', width: 10 },
    ]
    orphanDetail
      .slice()
      .sort((a, b) => String(a.danubenet_name).localeCompare(b.danubenet_name) || String(a.date).localeCompare(b.date))
      .forEach((d) => wsDetail.addRow(d))
    const headDetail = wsDetail.getRow(1)
    headDetail.height = 22
    headDetail.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB71C1C' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
    for (let i = 2; i <= wsDetail.rowCount; i++) {
      wsDetail.getRow(i).eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDECEA' } }
        cell.alignment = { vertical: 'middle' }
      })
    }
    wsDetail.views = [{ state: 'frozen', ySplit: 1 }]
  }

  return (await wb.xlsx.writeBuffer()) as Buffer
}
