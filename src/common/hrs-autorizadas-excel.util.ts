import { Workbook } from 'exceljs'

/**
 * Excel del toggle NOVA/VOUT (Horas Autorizadas).
 *
 * El frontend ya arma la matriz (Nova + Vout + TCW + AR con el match difuso de
 * nombres) — esa matriz sólo existe en el front después de cargar/subir TCW — y
 * envía aquí el view-model ya calculado (con los colores/valores que produce su
 * propia UI). Este util sólo lo MAQUETA y devuelve el .xlsx.
 *
 * Novedad vs. la versión vieja del front: cuando un día tiene varios shifts
 * (ej. WS Nova + Time Off), ese día se expande a N sub-columnas (una por shift,
 * cada una con su color) en lugar de juntarlas con "/".
 */

export interface HaPart {
  h: string // horas ya formateadas (lo que muestra la UI)
  bg: string // color de fondo (hex sin '#')
  color: string // color de texto (hex sin '#')
}
export interface HaCell {
  off?: boolean // true → celda gris "Off"
  parts: HaPart[] // un elemento por shift; vacío = sin datos
}
export interface HaDay {
  label: string // Lun / Mon ...
  num: number | string // día del mes
  weekend: boolean
}
export interface HaRow {
  name: string
  cells: HaCell[]
  auth: string
  nova: string
  vout: string
  extra: string
  timeOff: string
  total: string
  arNova: string
  arVout: string
  tcw: string
}
export interface HrsAutorizadasPayload {
  startDate: string
  endDate: string
  company?: string
  days: HaDay[]
  monthGroups: { label: string; count: number }[]
  rows: HaRow[]
}

export async function buildHrsAutorizadasExcel(p: HrsAutorizadasPayload): Promise<Buffer> {
  const argb = (h: string) => 'FF' + String(h || '').replace('#', '').toUpperCase()
  const num = (s: string) => {
    const n = parseFloat(s)
    return isNaN(n) ? null : n
  }

  const days = p.days || []
  const rows = p.rows || []
  const nDays = days.length

  const wb = new Workbook()
  wb.creator = 'Nova One – Horas Autorizadas'
  wb.created = new Date()
  const ws = wb.addWorksheet('Horas Autorizadas')

  // ── Sub-columnas por día = máx. nº de shifts entre todas las filas (mín 1) ──
  const sub: number[] = []
  for (let d = 0; d < nDays; d++) {
    let m = 1
    for (const r of rows) {
      const k = r.cells?.[d]?.parts?.length || 0
      if (k > m) m = k
    }
    sub[d] = m
  }
  // Columna de inicio (1-based) de cada día. Col 1 = NOMBRE.
  const startCol: number[] = []
  let col = 2
  for (let d = 0; d < nDays; d++) {
    startCol[d] = col
    col += sub[d]
  }
  const totalDayCols = col - 2
  const sumStart = 2 + totalDayCols // primera columna de resumen

  // ── Helpers de estilo ──
  const thin = () => ({
    top: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
    left: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
    right: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
  })
  const fill = (cell: any, a: string) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: a } }
  }
  const font = (cell: any, o: { color?: string; bold?: boolean; size?: number } = {}) => {
    cell.font = { name: 'Calibri', size: o.size || 10, color: { argb: o.color || 'FF1A1F36' }, bold: !!o.bold }
  }
  const align = (cell: any, h = 'center', v = 'middle') => {
    cell.alignment = { horizontal: h, vertical: v, wrapText: true }
  }
  // Pinta+bordea todo un rango (necesario para que los bordes salgan en celdas combinadas)
  const styleRange = (r1: number, c1: number, r2: number, c2: number, a: string) => {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cc = ws.getCell(r, c)
        fill(cc, a)
        cc.border = thin()
      }
    }
  }

  // ── Anchos ──
  ws.getColumn(1).width = 28
  for (let i = 0; i < totalDayCols; i++) ws.getColumn(2 + i).width = 4.5
  const sumLabels = ['Hrs Aut', 'WS Nova', 'WS Vout', 'Extra', 'Time Off', 'Total', 'AR Nova', 'AR Vout', 'TCW']
  sumLabels.forEach((_, i) => {
    ws.getColumn(sumStart + i).width = 8
  })

  // ── Fila 1: meses (merge) + spacers de resumen ──
  ws.getRow(1).height = 12
  const sp1 = ws.getCell(1, 1)
  fill(sp1, 'FFE8E7FC')
  sp1.border = thin()

  let dayIdx = 0
  for (const mg of p.monthGroups || []) {
    if (mg.count <= 0) continue
    const c1 = startCol[dayIdx]
    const lastDay = dayIdx + mg.count - 1
    const c2 = startCol[lastDay] + sub[lastDay] - 1
    if (c2 > c1) ws.mergeCells(1, c1, 1, c2)
    styleRange(1, c1, 1, c2, 'FF8989EB')
    const mc = ws.getCell(1, c1)
    mc.value = mg.label
    font(mc, { color: 'FFFFFFFF', bold: true })
    align(mc)
    dayIdx += mg.count
  }
  const sumSpacerColors = ['FFE8F5E9', 'FFFFF2CC', 'FFD0B4F5', 'FFA8D8EA', 'FFEA9999', 'FFE8E7FC', 'FFEBF4FF', 'FFDDEEFF', 'FFE8E7FC']
  sumSpacerColors.forEach((a, i) => {
    const c = ws.getCell(1, sumStart + i)
    fill(c, a)
    c.border = thin()
  })

  // ── Fila 2: NOMBRE + headers de día (merge por día) + headers de resumen ──
  ws.getRow(2).height = 22
  const r2name = ws.getCell(2, 1)
  r2name.value = 'NOMBRE'
  fill(r2name, 'FFE8E7FC')
  font(r2name, { bold: true })
  align(r2name)
  r2name.border = thin()

  for (let d = 0; d < nDays; d++) {
    const c1 = startCol[d]
    const c2 = c1 + sub[d] - 1
    if (c2 > c1) ws.mergeCells(2, c1, 2, c2)
    const bg = days[d].weekend ? 'FF999999' : 'FFE8E7FC'
    styleRange(2, c1, 2, c2, bg)
    const hc = ws.getCell(2, c1)
    hc.value = `${days[d].label}\n${days[d].num}`
    font(hc, { bold: true, color: days[d].weekend ? 'FFFFFFFF' : 'FF3C2F8C', size: 9 })
    align(hc)
  }

  const sumHeaders = [
    { label: 'Hrs Aut', fill: 'FFE8F5E9', color: 'FF2E7D32' },
    { label: 'WS Nova', fill: 'FFFFF2CC', color: 'FF7D5A00' },
    { label: 'WS Vout', fill: 'FFD0B4F5', color: 'FF4A1F8C' },
    { label: 'Extra', fill: 'FFA8D8EA', color: 'FF1A5276' },
    { label: 'Time Off', fill: 'FFEA9999', color: 'FF7F1F1F' },
    { label: 'Total', fill: 'FFE8E7FC', color: 'FF3C2F8C' },
    { label: 'AR Nova', fill: 'FFEBF4FF', color: 'FF1565C0' },
    { label: 'AR Vout', fill: 'FFDDEEFF', color: 'FF0D47A1' },
    { label: 'TCW', fill: 'FFF0E6FF', color: 'FF6A1B9A' },
  ]
  sumHeaders.forEach((h, i) => {
    const c = ws.getCell(2, sumStart + i)
    c.value = h.label
    fill(c, h.fill)
    font(c, { bold: true, color: h.color })
    align(c)
    c.border = thin()
  })

  // ── Filas de datos ──
  rows.forEach((row, idx) => {
    const exRow = idx + 3
    ws.getRow(exRow).height = 16
    const rowArgb = idx % 2 === 1 ? 'FFE8E7FC' : 'FFFFFFFF'

    const nameCell = ws.getCell(exRow, 1)
    nameCell.value = row.name || ''
    fill(nameCell, rowArgb)
    font(nameCell, { bold: true })
    align(nameCell, 'left')
    nameCell.border = thin()

    for (let d = 0; d < nDays; d++) {
      const c1 = startCol[d]
      const width = sub[d]
      const c2 = c1 + width - 1
      const cell = row.cells?.[d] || { parts: [] }
      const parts = cell.parts || []

      if (parts.length === 0) {
        // Sin shifts → "Off" (gris) o vacío (fondo de fila). Merge a lo ancho del día.
        if (c2 > c1) ws.mergeCells(exRow, c1, exRow, c2)
        const a = cell.off ? 'FF999999' : rowArgb
        styleRange(exRow, c1, exRow, c2, a)
        const mc = ws.getCell(exRow, c1)
        if (cell.off) {
          mc.value = 'Off'
          font(mc, { bold: true, color: 'FFFFFFFF' })
        } else {
          mc.value = null
          font(mc, {})
        }
        align(mc)
      } else if (parts.length === width) {
        // Un shift por sub-columna (cada uno su color)
        parts.forEach((pt, k) => {
          const cc = ws.getCell(exRow, c1 + k)
          cc.value = pt.h || null
          fill(cc, argb(pt.bg))
          font(cc, { bold: true, color: argb(pt.color) })
          align(cc)
          cc.border = thin()
        })
      } else if (parts.length === 1 && width > 1) {
        // Un solo shift en un día ensanchado → merge a todo el ancho
        ws.mergeCells(exRow, c1, exRow, c2)
        styleRange(exRow, c1, exRow, c2, argb(parts[0].bg))
        const mc = ws.getCell(exRow, c1)
        mc.value = parts[0].h || null
        font(mc, { bold: true, color: argb(parts[0].color) })
        align(mc)
      } else {
        // 1 < parts < width → cada shift en su columna, el resto vacío
        for (let k = 0; k < width; k++) {
          const cc = ws.getCell(exRow, c1 + k)
          if (k < parts.length) {
            cc.value = parts[k].h || null
            fill(cc, argb(parts[k].bg))
            font(cc, { bold: true, color: argb(parts[k].color) })
          } else {
            cc.value = null
            fill(cc, rowArgb)
          }
          align(cc)
          cc.border = thin()
        }
      }
    }

    // ── Columnas de resumen ──
    const sumCell = (i: number, val: string, bg: string, color: string) => {
      const c = ws.getCell(exRow, sumStart + i)
      c.value = num(val)
      fill(c, bg)
      font(c, { bold: true, color })
      align(c)
      c.border = thin()
    }
    sumCell(0, row.auth, 'FFE8F5E9', 'FF2E7D32')
    sumCell(1, row.nova, 'FFFFF2CC', 'FF7D5A00')
    sumCell(2, row.vout, 'FFD0B4F5', 'FF4A1F8C')
    sumCell(3, row.extra, 'FFA8D8EA', 'FF1A5276')
    sumCell(4, row.timeOff, 'FFEA9999', 'FF7F1F1F')

    // Total → cian si > 0
    const totalNum = num(row.total)
    const totalC = ws.getCell(exRow, sumStart + 5)
    totalC.value = totalNum
    fill(totalC, totalNum != null && totalNum > 0 ? 'FF00FFFF' : rowArgb)
    font(totalC, { bold: true })
    align(totalC)
    totalC.border = thin()

    sumCell(6, row.arNova, 'FFEBF4FF', 'FF1565C0')
    sumCell(7, row.arVout, 'FFDDEEFF', 'FF0D47A1')

    // TCW → rojo si TCW>Total, naranja si <, verde si =
    const tcwNum = num(row.tcw)
    const tcwC = ws.getCell(exRow, sumStart + 8)
    tcwC.value = tcwNum
    let tcwBg = rowArgb
    if (tcwNum != null && totalNum != null) {
      if (tcwNum > totalNum) tcwBg = 'FFF4CCCC'
      else if (tcwNum < totalNum) tcwBg = 'FFFCE5CD'
      else tcwBg = 'FFB6D7A8'
    }
    fill(tcwC, tcwBg)
    font(tcwC, { bold: true })
    align(tcwC)
    tcwC.border = thin()
  })

  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }]

  return (await wb.xlsx.writeBuffer()) as Buffer
}
