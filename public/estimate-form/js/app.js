// 帳票の動的部分（家財表・荷造資材・料金表・お支払欄）の生成と、
// 表示スケール・計算・デバッグオーバーレイ。
import { KAZAI_COLS, MATERIAL_ROWS, GEAR_ITEMS, FEE_A, FEE_B, FEE_C, FEE_D } from './fields.js'
import { applyFormData, readFormData } from './form-data.js'

const $ = (s, r = document) => r.querySelector(s)
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
const inp = (field, cls = 'form-input qty', attrs = '') =>
  `<input class="${cls}" data-field="${field}" inputmode="numeric" ${attrs}>`

/* ---------- 家財表 ---------- */
function buildKazai() {
  const root = $('#kazai')
  const grid = el('div', 'kazai-cols')
  const rows = 23
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 5; c++) {
      const it = KAZAI_COLS[c][r]
      const last = r === rows - 1
      if (!it) {
        grid.append(el('div', 'kz name'), el('div', 'kz pt'), el('div', 'kz'), el('div', `kz${c === 4 ? ' mats-edge' : ''}`))
        if (c === 2) grid.append(el('div', 'kz'))
        continue
      }
      const [key, name, size, pt] = it
      const isDitto = name.startsWith('〃')
      const nm = el('div', 'kz name', `<span${isDitto ? ' style="margin-left:3.2mm"' : ''}>${name}</span>` +
        (size ? `<span style="position:absolute;left:11.2mm">${size}</span>` : ''))
      nm.style.position = 'relative'
      const ptc = el('div', 'kz pt', pt === null ? '<span style="transform:rotate(-20deg)">/</span>' : (pt === '' ? '' : String(pt)))
      const q1 = el('div', 'kz', inp('kz_' + key))
      const q2 = el('div', `kz${c === 4 ? ' mats-edge' : ''}`, inp('kz_' + key + '_x'))
      grid.append(nm, ptc, q1, q2)
      if (c === 2) grid.append(el('div', 'kz'))   // 原本にある列3右の細い空き列
    }
  }
  // 小計行（各列 4 トラックを 2+2 で使う）
  for (let c = 0; c < 5; c++) {
    const lb = el('div', 'kz sub', '<span class="just">小　　計</span>')
    lb.style.gridColumn = 'span 2'
    const v = el('div', 'kz sub'); v.style.gridColumn = 'span 2'
    v.innerHTML = `<span class="calc" data-calc="ptcol${c}"></span>`
    lb.classList.add('bot'); v.classList.add('bot')
    if (c === 4) v.classList.add('mats-edge')
    grid.append(lb, v)
    if (c === 2) { const sp = el('div', 'kz sub bot'); grid.append(sp) }
  }
  root.append(grid, buildMats())
}

function buildMats() {
  const m = el('div', 'mats')
  const row = (top, h, html, cls = '') => {
    const r = el('div', 'm-row ' + cls, html)
    r.style.top = top + 'mm'; r.style.height = h + 'mm'
    m.append(r); return r
  }
  const B = 'border-right:var(--line-w) solid var(--ink)'
  row(0, 3.78, '<div style="flex:1;display:flex;align-items:center;justify-content:center;font-weight:400;letter-spacing:1.2mm">荷　造　資　材</div>')
  row(3.78, 3.68, `<div style="width:11.96mm;${B}"></div><div style="width:10.76mm;${B};display:flex;align-items:center;justify-content:center">／　日</div><div style="width:11.21mm;${B};display:flex;align-items:center;justify-content:center">／　日</div><div style="flex:1;display:flex;align-items:center;justify-content:center" class="xs">作業当日</div>`)
  let y = 7.46
  const rh = [3.81, 3.68, 3.57, 3.92, 3.86, 3.57, 3.75, 3.68]
  MATERIAL_ROWS.forEach(([key, label], i) => {
    row(y, rh[i], `<div style="width:11.96mm;${B};display:flex;align-items:center;padding:0 0.5mm;line-height:1.05" class="xs">${label}</div><div style="width:10.76mm;${B}">${inp('mat_' + key + '_d1')}</div><div style="width:11.21mm;${B}">${inp('mat_' + key + '_d2')}</div><div style="flex:1">${inp('mat_' + key + '_day')}</div>`)
    y += rh[i]
  })
  // 作成日・配達日（右にロープ～養生資材の小列）
  const wrow = (top, h, html) => { const r = row(top, h, html); r.style.right = (44.45 - 33.93) + 'mm'; return r }
  wrow(37.30, 5.58, `<div style="width:11.96mm;${B};display:flex;align-items:center;padding:0 0.6mm"><span class="just small">作　成　日</span></div><div style="flex:1"><input class="form-input mini" data-field="createDate"></div>`)
  wrow(42.88, 5.53, `<div style="width:11.96mm;${B};display:flex;align-items:center;padding:0 0.6mm"><span class="just small">配　達　日</span></div><div style="flex:1"><input class="form-input mini" data-field="delivDate"></div>`)
  wrow(48.41, 7.40, `<div style="width:11.96mm;${B};display:flex;align-items:center;padding:0 0.6mm" class="small">ポイント<br>合　　計</div><div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:4mm;font-weight:700"><span data-calc="pointTotal"></span></div>`)
  row(55.81, 4.07, `<div style="width:11.96mm;${B};display:flex;align-items:center;padding:0 0.6mm"><span class="just small">保　　管</span></div><div style="flex:1;display:flex;align-items:center;justify-content:center" class="small"><input class="form-input ctr mini" data-field="storageUntil" style="width:14mm">年　　月　　日迄</div>`)
  const sec = row(59.88, 4.0, `<div style="width:11.96mm;${B};display:flex;align-items:center;padding:0 0.4mm" class="xs">シークレット</div><div style="flex:1;display:flex;align-items:center;justify-content:space-evenly" class="xs">${['車輌','資材','制服','引越先'].map(v => `<label class="opt"><input type="checkbox" name="secret_${v}">${v}<span class="ring"></span></label>`).join('・')}</div>`)
  sec.style.borderBottom = 'none'
  // 小列（ロープ〜養生資材）
  const gy = [37.30, 41.00, 44.71, 48.41, 52.11, 55.81]
  GEAR_ITEMS.forEach((g, i) => {
    const r = el('div', '', `<label class="opt" style="width:100%;justify-content:center"><input type="checkbox" name="gear_${g.replace(/\s/g, '')}"><span class="xs just" style="padding:0 0.9mm">${g}</span><span class="ring"></span></label>`)
    r.style.cssText = `position:absolute;left:33.93mm;right:0;top:${gy[i]}mm;height:${gy[i + 1] - gy[i]}mm;border-left:var(--line-w) solid var(--ink);border-bottom:var(--line-w) solid var(--ink);display:flex;align-items:center`
    m.append(r)
  })
  return m
}

/* ---------- 料金表（A・B・C） ---------- */
const fmt = n => n.toLocaleString('ja-JP')
function feeRow(label, field, last) {
  const html = `<div class="fl" style="width:${field && field.lw || 19}mm"><span class="just small">${label}</span></div>` +
    `<div class="fv"><span class="yen">¥</span>${field && field.name ? inp(field.name, 'form-input num mini') : ''}</div>`
  const r = el('div', 'fee-row' + (last ? ' last' : ''), html)
  return r
}
function buildFees() {
  const a = $('#fees-a'); a.append(el('div', 'fee-hd', '基　本　料　金'))
  FEE_A.forEach(([key, label]) => a.append(feeRow(label, key ? { name: 'feeA_' + key, lw: 19 } : null)))
  const sa = feeRow('小 計 （A）', null); sa.querySelector('.fv').innerHTML = '<span class="yen">¥</span><span class="calc" data-calc="subA"></span>'; a.append(sa)

  const b = $('#fees-b'); b.append(el('div', 'fee-hd', '附　帯　料　金'))
  FEE_B.forEach(([key, label]) => b.append(feeRow(label, { name: 'feeB_' + key, lw: 19.45 })))
  const sb = feeRow('小 計 （B）', null); sb.querySelector('.fv').innerHTML = '<span class="yen">¥</span><span class="calc" data-calc="subB"></span>'; b.append(sb)

  const c = $('#fees-c'); c.append(el('div', 'fee-hd', '資　材　の　料　金'))
  FEE_C.forEach(([key, label, unit]) => {
    const r = el('div', 'fee-row',
      `<div class="fl" style="width:18.4mm;justify-content:space-between"><span class="${label.includes('|') ? 'xs' : 'small'}" style="line-height:1.05">${label.replace('|', '<br>')}</span><span class="xs">${inp('feeC_' + key + '_qty1', 'form-input qty mini', 'style="width:4.5mm"')}${unit}</span></div>` +
      `<div class="fv" style="flex:0 0 14.5mm;border-right:var(--line-w) solid var(--ink)"><span class="yen">¥</span>${inp('feeC_' + key + '_amt1', 'form-input num mini')}</div>` +
      `<div class="fl" style="width:9.2mm;justify-content:flex-end"><span class="xs">${inp('feeC_' + key + '_qty2', 'form-input qty mini', 'style="width:4.5mm"')}${unit}</span></div>` +
      `<div class="fv"><span class="yen">¥</span>${inp('feeC_' + key + '_amt2', 'form-input num mini')}</div>`)
    c.append(r)
  })
  c.append(el('div', 'fee-row', '<div class="fl" style="width:18.4mm"></div><div class="fv" style="flex:0 0 14.5mm;border-right:var(--line-w) solid var(--ink)"></div><div class="fl" style="width:8.9mm"></div><div class="fv"></div>'))
  const sc = el('div', 'fee-row', '<div class="fl" style="width:32.9mm"><span class="just small">小 計 （C）</span></div><div class="fv"><span class="yen">¥</span><span class="calc" data-calc="subC"></span></div>')
  c.append(sc)
}

/* ---------- お支払方法・その他の料金 ---------- */
function buildPay() {
  const p = $('#pay')
  const row = (top, h, html, cls = '') => {
    const r = el('div', 'p-row ' + cls, html)
    r.style.top = top + 'mm'; r.style.height = h + 'mm'
    p.append(r); return r
  }
  row(0, 5.3, '<div style="flex:1;text-align:center;font-weight:400;letter-spacing:1.9mm">お支払方法</div>')
  row(5.3, 4.4, '<div style="flex:1;display:flex;justify-content:space-between;padding:0 1.2mm" class="small">' +
    ['現 金', '前 受 金', '会 社 請 求'].map(v => `<label class="opt"><input type="radio" name="payMethod" value="${v.replace(/\s/g, '')}">${v}<span class="ring"></span></label>`).join('<span class="sep">・</span>') + '</div>')
  row(9.7, 4.5, `<div class="small" style="display:flex;align-items:center;width:100%;letter-spacing:0.5mm"><label class="opt"><input type="radio" name="payMethod" value="カード">カ ー ド<span class="ring"></span></label>　（<input class="form-input mini" data-field="cardNote" style="width:16mm">）</div>`)
  row(14.2, 5.2, `<div class="small" style="display:flex;align-items:center;width:100%"><span class="small">領収書宛先名</span><input class="form-input mini" data-field="receiptName" style="flex:1"></div>`)
  row(19.4, 4.11, '<div style="flex:1;text-align:center;font-weight:400;letter-spacing:1.5mm">その他の料金</div>')
  const tops = [23.51, 27.64, 31.70, 35.77, 39.90, 44.02, 48.08, 52.16, 56.34, 60.40]
  FEE_D.forEach(([key, label, note], i) => {
    const lw = 24.63
    const noteHtml = note ? `<span class="xs" style="line-height:1.02;margin-left:0.3mm">${note.split('|').join('<br>')}</span>` : ''
    row(tops[i], tops[i + 1] - tops[i],
      `<div style="width:${lw}mm;height:100%;display:flex;align-items:center;border-right:var(--line-w) solid var(--ink);padding-left:0.6mm"><span class="just small" style="width:${note ? 17.5 : 22.5}mm">${label}</span>${noteHtml}</div>` +
      `<div style="flex:1;display:flex;align-items:center;padding:0 0.5mm"><span class="yen">¥</span>${key ? inp('feeD_' + key, 'form-input num mini') : ''}</div>`).style.padding = '0'
  })
  row(60.40, 4.13, '<div style="width:24.63mm;height:100%;display:flex;align-items:center;border-right:var(--line-w) solid var(--ink);padding-left:0.6mm"><span class="just small" style="width:17mm">小　計 (D)</span></div><div style="flex:1;display:flex;align-items:center;padding:0 0.5mm"><span class="yen">¥</span><span class="calc" data-calc="subD"></span></div>').style.padding = '0'
  // 合計（ラベルが2段の¥をまたぐ）
  const g = row(64.53, 8.77, '', ''); g.style.padding = '0'
  g.innerHTML = `<div style="width:20.56mm;height:100%;display:flex;flex-direction:column;justify-content:center;border-right:var(--line-w) solid var(--ink);padding-left:0.6mm"><span class="just small" style="width:15mm">合　　計</span><span class="xs">(A)+(B)+(C)+(D)</span></div>` +
    `<div style="flex:1;display:flex;flex-direction:column"><div style="height:4.30mm;display:flex;align-items:center;border-bottom:var(--line-w) solid var(--ink);padding:0 0.5mm"><span class="yen">¥</span><span class="calc" data-calc="total"></span></div><div style="flex:1;display:flex;align-items:center;padding:0 0.5mm"><span class="yen">¥</span></div></div>`
  const t3 = [[73.30, 7.56, '総　合　計', 'grand'], [80.86, 6.45, '消 費 税', 'tax'], [87.31, 6.39, '再　　計', 'final']]
  t3.forEach(([top, h, label, calc], i) => {
    const r = row(top, h, `<div style="width:20.56mm;height:100%;display:flex;align-items:center;border-right:var(--line-w) solid var(--ink);padding-left:0.6mm"><span class="just" style="width:15mm;font-weight:${calc === 'final' ? 700 : 400}">${label}</span></div><div style="flex:1;display:flex;align-items:center;padding:0 0.5mm"><span class="yen">¥</span><span class="calc" data-calc="${calc}"></span></div>`)
    r.style.padding = '0'
    if (i === 2) r.style.borderBottom = 'none'
  })
}

/* ---------- 媒体 ---------- */
function buildMedia() {
  const m = $('#media-row')
  const items = ['電波', 'net', 'HP', '不動産', '電話帳', '法人名', 'DM', '再利用']
  m.style.justifyContent = 'space-between'
  m.innerHTML = items.map(v => `<label class="opt"><input type="checkbox" name="media_${v}">${v}<span class="ring"></span></label>`).join('・') +
    `・<span style="display:inline-flex;align-items:center"><input class="form-input qty mini" data-field="mediaReuseCount" style="width:3.5mm">回</span>・` +
    ['チラシ', '紹介'].map(v => `<label class="opt"><input type="checkbox" name="media_${v}">${v}<span class="ring"></span></label>`).join('・')
}

/* ---------- 計算（Excel の式と同じ） ---------- */
const num = v => { const n = parseFloat(String(v ?? '').replace(/[,¥\s]/g, '')); return isFinite(n) ? n : 0 }
function recalc() {
  const val = f => { const e = document.querySelector(`[data-field="${f}"]`); return e ? num(e.dataset.value ?? e.value) : 0 }
  const sum = (prefix, keys) => keys.reduce((s, k) => s + (k ? val(prefix + k) : 0), 0)
  const A = sum('feeA_', FEE_A.map(x => x[0]))
  const B = sum('feeB_', FEE_B.map(x => x[0]))
  const C = FEE_C.reduce((s, [k]) => s + val(`feeC_${k}_amt1`) + val(`feeC_${k}_amt2`), 0)
  const D = sum('feeD_', FEE_D.map(x => x[0]))
  const total = A + B + C + D
  const tax = Math.round(total * 0.1)
  const out = { subA: A, subB: B, subC: C, subD: D, total, grand: total, tax, final: total + tax }
  // 家財ポイント
  let pt = 0
  KAZAI_COLS.forEach((col, ci) => {
    let colPt = 0
    col.forEach(([key, , , p]) => { if (typeof p === 'number') colPt += p * val('kz_' + key) })
    out['ptcol' + ci] = colPt; pt += colPt
  })
  out.pointTotal = pt
  for (const [k, v] of Object.entries(out)) {
    const e = document.querySelector(`[data-calc="${k}"]`)
    if (e) e.textContent = v > 0 ? fmt(v) : ''
  }
}

/* ---------- 表示スケール（スマホはA4を丸ごと縮小） ---------- */
function fitScale() {
  const base = 210 * 96 / 25.4
  const w = document.documentElement.clientWidth
  const s = Math.min(1, w / base)
  const sc = $('.sheet-scale')
  sc.style.transform = s < 1 ? `scale(${s})` : ''
  $('.sheet-viewport').style.height = (297 * 96 / 25.4) * s + 'px'
}

/* ---------- 起動 ---------- */
buildKazai(); buildFees(); buildPay(); buildMedia()
document.addEventListener('input', e => {
  const t = e.target
  if (t.matches && t.matches('.num, .qty, [data-field^="fee"], [data-field^="kz_"]')) recalc()
})
document.addEventListener('estimate:recalc', recalc)
recalc()
fitScale(); addEventListener('resize', fitScale)
if (new URLSearchParams(location.search).get('debug') === 'overlay') {
  document.body.classList.add('debug-overlay')
  $('.reference-overlay').src = '../IMG_9280.jpeg'
}
window.estimateForm = { applyFormData, readFormData, recalc }
