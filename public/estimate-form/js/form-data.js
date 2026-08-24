// 外部（稼働中CRM）からの流し込み口。
// applyFormData({ customerName: '…', currentAddress: '…', kz_youdansu_A: 2, feeA_space: 15000, … })
// キーは data-field 名（テキスト系）／ name 属性（radio・checkbox）どちらでも良い。

export const formData = {
  customerName: '', customerFurigana: '',
  currentPostal: '', currentAddress: '', destPostal: '', destAddress: '',
  curTelMobile: '', moveMonth: '', moveDay: '',
  estimateDate: '', requestDate: '', estimatorName: '',
}

export function applyFormData(data) {
  for (const [key, val] of Object.entries(data || {})) {
    if (val == null) continue
    const el = document.querySelector(`[data-field="${key}"]`)
    if (el) {
      el.value = String(val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
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
}

export function readFormData() {
  const out = {}
  for (const el of document.querySelectorAll('[data-field]')) {
    if (el.value) out[el.dataset.field] = el.dataset.value ?? el.value
  }
  for (const el of document.querySelectorAll('input[type=radio]:checked')) out[el.name] = el.value
  for (const el of document.querySelectorAll('input[type=checkbox]:checked')) out[el.name] = true
  return out
}
