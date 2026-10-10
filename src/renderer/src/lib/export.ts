import { format } from 'date-fns'
import type { ActionResult } from '@shared/types'

export interface ExportColumn<T> {
  header: string
  value: (row: T) => string | number
}

function escapeCsv(value: string | number): string {
  const text = String(value)
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function timestampedName(base: string, extension: string): string {
  return `${base}-${format(new Date(), 'yyyyMMdd-HHmm')}.${extension}`
}

export async function exportCsv<T>(
  filename: string,
  columns: ExportColumn<T>[],
  rows: T[]
): Promise<ActionResult<{ path: string }>> {
  const lines = [columns.map((column) => escapeCsv(column.header)).join(',')]
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsv(column.value(row))).join(','))
  }
  return window.api.exports.save({ filename, content: `\uFEFF${lines.join('\r\n')}` })
}

export async function exportExcel<T>(
  filename: string,
  sheetName: string,
  columns: ExportColumn<T>[],
  rows: T[]
): Promise<ActionResult<{ path: string }>> {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  workbook.creator = 'Gym Manager'
  const sheet = workbook.addWorksheet(sheetName)
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.header,
    width: Math.max(14, column.header.length + 4)
  }))
  for (const row of rows) {
    sheet.addRow(columns.map((column) => column.value(row)))
  }
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  const buffer = await workbook.xlsx.writeBuffer()
  return window.api.exports.save({ filename, content: new Uint8Array(buffer as ArrayBuffer) })
}

export async function exportPdf<T>(
  filename: string,
  title: string,
  subtitle: string,
  columns: ExportColumn<T>[],
  rows: T[]
): Promise<ActionResult<{ path: string }>> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  doc.setFontSize(16)
  doc.text(title, 40, 42)
  doc.setFontSize(10)
  doc.setTextColor(130)
  doc.text(subtitle, 40, 60)
  autoTableModule.default(doc, {
    startY: 78,
    head: [columns.map((column) => column.header)],
    body: rows.map((row) => columns.map((column) => String(column.value(row)))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [5, 150, 105], textColor: 255 },
    alternateRowStyles: { fillColor: [244, 244, 245] }
  })
  const buffer = doc.output('arraybuffer')
  return window.api.exports.save({ filename, content: new Uint8Array(buffer) })
}
