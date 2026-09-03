// 外部（稼働中CRM）からの流し込み口。
// applyFormData({ customerName: '…', currentAddress: '…', kz_youdansu_A: 2, feeA_space: 15000, … })
// キーは data-field 名（テキスト系）／ name 属性（radio・checkbox）どちらでも良い。

export const formData = {
  customerName: '', customerFurigana: '',
  currentPostal: '', currentAddress: '', destPostal: '', destAddress: '',
  curTelMobile: '', moveMonth: '', moveDay: '',
  estimateDate: '', requestDate: '', estimatorName: '',
}

// 電話番号「092-123-4567」を3枠に分ける（ハイフン無しは桁数で推定）
export function splitTel(v) {
  const s = String(v || '').trim()
  if (!s) return ['', '', '']
  if (s.includes('-')) { const p = s.split('-'); return [p[0] || '', p[1] || '', p.slice(2).join('') || ''] }
  const d = s.replace(/\D/g, '')
  if (d.length === 11) return [d.slice(0, 3), d.slice(3, 7), d.slice(7)]
  if (d.length === 10) return /^0[36]/.test(d) ? [d.slice(0, 2), d.slice(2, 6), d.slice(6)] : [d.slice(0, 3), d.slice(3, 6), d.slice(6)]
  return [s, '', '']
}

export function applyFormData(data) {
  for (const [key, val] of Object.entries(data || {})) {
    if (val == null) continue
    // 自動計算欄を手で書き換えた分（_calc）は最後にまとめて戻す
    if (key === '_calc') continue
    const el = document.querySelector(`[data-field="${key}"]`)
    if (el) {
      el.value = String(val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      continue
    }
    // 3枠の電話番号（data-field="xxx_1/_2/_3"）
    const tel = [1, 2, 3].map(i => document.querySelector(`[data-field="${key}_${i}"]`))
    if (tel.every(Boolean)) {
      const p = splitTel(val)
      tel.forEach((e, i) => { e.value = p[i]; e.dispatchEvent(new Event('input', { bubbles: true })) })
      continue
    }
    // radio / checkbox（name= のグループ。値一致で ON）
    const group = document.querySelectorAll(`input[name="${key}"]`)
    for (const g of group) {
      if (g.type === 'radio') g.checked = (g.value === String(val))
      else if (g.type === 'checkbox') g.checked = !!val
    }
  }
  document.dispatchEvent(new Event('estimate:recalc'))
  // 自動計算より後に流し込まないと recalc に上書きされる
  for (const [k, v] of Object.entries((data || {})._calc || {})) {
    const el = document.querySelector(`[data-calc="${k}"]`)
    if (!el || v === '' || v == null) continue
    el.value = Number(v).toLocaleString('ja-JP'); el.dataset.manual = '1'
  }
}

export function readFormData() {
  const out = {}
  for (const el of document.querySelectorAll('[data-field]')) {
    if (el.value) out[el.dataset.field] = el.dataset.value ?? el.value
  }
  // 3枠の電話番号は「a-b-c」にまとめる
  for (const k of Object.keys(out)) {
    const m = /^(.*)_1$/.exec(k)
    if (!m || !document.querySelector(`[data-field="${m[1]}_2"]`)) continue
    out[m[1]] = [1, 2, 3].map(i => out[`${m[1]}_${i}`] || '').join('-').replace(/-+$/, '')
    ;[1, 2, 3].forEach(i => delete out[`${m[1]}_${i}`])
  }
  for (const el of document.querySelectorAll('input[type=radio]:checked')) out[el.name] = el.value
  for (const el of document.querySelectorAll('input[type=checkbox]:checked')) { if (el.name) out[el.name] = true }
  // 自動計算欄を手で書き換えている分だけ持ち出す（自動のままの欄は保存しない）
  const calc = {}
  for (const el of document.querySelectorAll('[data-calc]')) {
    if (el.dataset.manual === '1' && el.value) calc[el.dataset.calc] = String(el.value).replace(/[,\s]/g, '')
  }
  if (Object.keys(calc).length) out._calc = calc
  return out
}

// 一覧に出す金額・才数は、帳票が計算した値をそのまま使う
export function readTotals() {
  const v = (n) => { const e = document.querySelector(`[data-calc="${n}"]`); return e ? Number(String(e.value || '').replace(/[,\s]/g, '')) || 0 : 0 }
  return { total: v('final'), points: v('pointTotal') }
}
