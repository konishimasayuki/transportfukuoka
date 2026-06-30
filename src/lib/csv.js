// 軽量CSVユーティリティ（エクスポート／インポート共通）
// - toCSV(rows, columns): columns=[{key,label}] でヘッダ付きCSV文字列を生成
// - parseCSV(text): ヘッダ行をキーにしたオブジェクト配列を返す（カンマ・改行・ダブルクォート対応）
// - downloadCSV(filename, text): ブラウザでダウンロード（UTF-8 BOM付きでExcel文字化け回避）

function escapeCell(v) {
  const s = v == null ? '' : String(v)
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function toCSV(rows, columns) {
  const header = columns.map(c => escapeCell(c.label)).join(',')
  const lines = (rows || []).map(row =>
    columns.map(c => escapeCell(row[c.key])).join(',')
  )
  return [header, ...lines].join('\r\n')
}

// CSV文字列 → 2次元配列（クォート内のカンマ/改行を正しく扱う）
function parseRows(text) {
  const rows = []
  let row = [], cell = '', inQuotes = false
  const src = String(text || '').replace(/^﻿/, '') // BOM除去
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ }
        else inQuotes = false
      } else cell += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { row.push(cell); cell = '' }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
      else cell += ch
    }
  }
  // 末尾
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''))
}

// ヘッダ行をキーにしたオブジェクト配列を返す。
// columns を渡すと「ラベル→key」のマッピングも試みる（日本語ヘッダ対応）。
export function parseCSV(text, columns) {
  const rows = parseRows(text)
  if (rows.length < 2) return []
  const headers = rows[0].map(h => String(h).trim())
  const labelToKey = {}
  if (columns) columns.forEach(c => { labelToKey[c.label] = c.key })
  const keys = headers.map(h => labelToKey[h] || h)
  return rows.slice(1).map(r => {
    const o = {}
    keys.forEach((k, idx) => { o[k] = r[idx] != null ? r[idx] : '' })
    return o
  })
}

export function downloadCSV(filename, text) {
  try {
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) { console.error('CSV download failed', e) }
}
