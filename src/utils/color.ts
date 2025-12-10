const RESET = '\x1b[0m'

const green = Bun.color('green', 'ansi') ?? ''
const red = Bun.color('red', 'ansi') ?? ''
const yellow = Bun.color('orange', 'ansi') ?? ''
const cyan = Bun.color('cyan', 'ansi') ?? ''
const dim = '\x1b[2m'

export const c = {
  green: (s: string) => `${green}${s}${RESET}`,
  red: (s: string) => `${red}${s}${RESET}`,
  yellow: (s: string) => `${yellow}${s}${RESET}`,
  cyan: (s: string) => `${cyan}${s}${RESET}`,
  dim: (s: string) => `${dim}${s}${RESET}`,

  // 语义化
  success: (s: string) => `${green}✓${RESET} ${s}`,
  error: (s: string) => `${red}✗${RESET} ${s}`,
  warn: (s: string) => `${yellow}⚠${RESET} ${s}`,
  info: (s: string) => `${cyan}▶${RESET} ${s}`,
}

// ANSI escape sequence regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g

/** 获取字符串的可见宽度（排除 ANSI 颜色码） */
function visibleWidth(str: string): number {
  return str.replace(ANSI_REGEX, '').length
}

/** 用空格填充字符串到指定可见宽度 */
function padEnd(str: string, width: number): string {
  const visible = visibleWidth(str)
  if (visible >= width) return str
  return str + ' '.repeat(width - visible)
}

export type TableColumn = {
  key: string
  label: string
  width?: number // 最大宽度，超过会截断
}

export type TableRow = Record<string, string>

/**
 * 打印支持 ANSI 颜色的表格
 */
export function printTable(columns: TableColumn[], rows: TableRow[]): void {
  // 计算每列宽度
  const colWidths = columns.map((col) => {
    const headerWidth = visibleWidth(col.label)
    const maxCellWidth = rows.reduce((max, row) => {
      const cellWidth = visibleWidth(row[col.key] ?? '')
      return Math.max(max, cellWidth)
    }, 0)
    const naturalWidth = Math.max(headerWidth, maxCellWidth)
    return col.width ? Math.min(naturalWidth, col.width) : naturalWidth
  })

  // 打印表头
  const header = columns
    .map((col, i) => c.dim(padEnd(col.label, colWidths[i]!)))
    .join('  ')
  console.log(header)

  // 打印分隔线
  const separator = colWidths.map((w) => '─'.repeat(w)).join('──')
  console.log(c.dim(separator))

  // 打印数据行
  for (const row of rows) {
    const line = columns
      .map((col, i) => {
        const cell = row[col.key] ?? ''
        return padEnd(cell, colWidths[i]!)
      })
      .join('  ')
    console.log(line)
  }
}
