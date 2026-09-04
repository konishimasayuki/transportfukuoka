// 帳票の動的部分（家財表・荷造資材・料金表・お支払欄）の生成と、
// 表示スケール・計算・デバッグオーバーレイ。
import { KAZAI_COLS, MATERIAL_ROWS, GEAR_ITEMS, FEE_A, FEE_B, FEE_C, FEE_D } from './fields.js'
import { applyFormData, readFormData, readTotals } from './form-data.js'

const $ = (s, r = document) => r.querySelector(s)
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
const inp = (field, cls = 'form-input qty', attrs = '') =>
  `<input class="${cls}" data-field="${field}" inputmode="numeric" ${attrs}>`
// 自動計算セル：値は自動で入るが、手入力すれば上書きできる（空にすると自動に戻る）
const calcIn = (name, extra = '') =>
  `<input class="form-input num calc" data-calc="${name}" inputmode="numeric" ${extra}>`

/* ---------- 家財表 ---------- */
// 原本の空き升（列4に1・列5に10）を自由記入行として使う。{ n: 通し番号, col: 列index }
export const freeSlots = []
function buildKazai() {
  const root = $('#kazai')
  const grid = el('div', 'kazai-cols')
  const rows = 23
  let freeIdx = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 5; c++) {
      const it = KAZAI_COLS[c][r]
      const last = r === rows - 1
      if (!it) {
        // 原本でも空欄になっている升。特殊家財を手書きするための自由記入行として使う
        // （品名・点数・数量。点数を入れればポイント合計にも入る）
        const n = ++freeIdx
        const nm = el('div', 'kz name', `<input class="form-input" data-field="kzx${n}_name" style="width:100%;font-size:2.1mm;padding-left:0.5mm">`)
        const ptc = el('div', 'kz pt', `<input class="form-input ctr" data-field="kzx${n}_pt" inputmode="numeric" style="width:100%">`)
        const q1 = el('div', 'kz', inp('kzx' + n + '_qty'))
        const q2 = el('div', `kz${c === 4 ? ' mats-edge' : ''}`, inp('kzx' + n + '_x'))
        grid.append(nm, ptc, q1, q2)
        freeSlots.push({ n, col: c })
        continue
      }
      const [key, name, size, pt] = it
      const isDitto = name.startsWith('〃')
      // サイズ記号は紙どおり右寄せ（A/B/C… が同じ右端に揃う）。名称が長い行は紙どおり直後に続ける
      const fits = name.replace(/\s/g, '').length <= 4
      // 原本の「（　）」は書き込み欄（TVブラ（ ）など）
      const nmHtml = name.includes('（ ）')
        ? name.replace('（ ）', `（<input class="form-input ctr" data-field="kz_${key}_note" style="width:4.6mm;font-size:1.8mm;padding:0">）`)
        : name
      const nm = el('div', 'kz name', `<span${isDitto ? ' style="margin-left:4.2mm"' : ''}>${nmHtml}</span>` +
        (size ? (fits ? `<span style="position:absolute;right:0.5mm;letter-spacing:0">${size}</span>`
                      : `<span style="letter-spacing:0">${size}</span>`) : ''))
      nm.style.position = 'relative'
      nm.dataset.fit = ''
      // 原本で才数が空の行（TVブラ・TV薄型）は、その場で才数を書き込めるようにする
      const ptc = el('div', 'kz pt', pt === null ? '<span>／</span>'
        : (pt === '' ? inp('kz_' + key + '_pt', 'form-input pt-in') : String(pt)))
      const q1 = el('div', 'kz', inp('kz_' + key))
      const q2 = el('div', `kz${c === 4 ? ' mats-edge' : ''}`, inp('kz_' + key + '_x'))
      grid.append(nm, ptc, q1, q2)
    }
  }
  // 小計行（各列 4 トラックを 2+2 で使う）
  for (let c = 0; c < 5; c++) {
    const lb = el('div', 'kz sub bot', '<span class="just">小　　計</span>')
    lb.style.gridColumn = 'span 2'
    // 左＝個数の合計、右＝点数の合計（列の左は個数、右はメモ、という運用に合わせる）
    const q = el('div', 'kz sub bot', calcIn('qtycol' + c, 'style="text-align:center;font-weight:600"'))
    const v = el('div', 'kz sub bot' + (c === 4 ? ' mats-edge' : ''), calcIn('ptcol' + c, 'style="text-align:right;font-weight:600"'))
    grid.append(lb, q, v)
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
  row(3.78, 3.68, `<div style="width:11.96mm;${B}"></div>` +
    // 原本実測：1列目 ／174.94・日179.38、2列目 ／185.85・日190.30mm
    [[10.76, 3.58, 7.75, 3.1, 6.08, 2.4], [11.21, 3.73, 7.91, 3.2, 6.23, 2.5]].map(([w, sl, ni, w1, dx, w2], k) =>
      `<div style="width:${w}mm;${B};position:relative">`
      + `<input class="form-input ctr mini" data-field="matDate${k + 1}M" style="position:absolute;left:0.5mm;top:0;height:100%;width:${w1}mm">`
      + `<span style="position:absolute;left:${sl}mm;top:50%;transform:translateY(-50%)">／</span>`
      + `<input class="form-input ctr mini" data-field="matDate${k + 1}D" style="position:absolute;left:${dx}mm;top:0;height:100%;width:${w2}mm">`
      + `<span style="position:absolute;left:${ni}mm;top:50%;transform:translateY(-50%)">日</span></div>`).join('') +
    `<div style="flex:1;display:flex;align-items:center;justify-content:center" class="xs">作業当日</div>`)
  let y = 7.46
  const rh = [3.81, 3.68, 3.57, 3.92, 3.86, 3.57, 3.75, 3.68]
  MATERIAL_ROWS.forEach(([key, label], i) => {
    const two = label.includes('|')
    row(y, rh[i], `<div style="width:11.96mm;${B};display:flex;align-items:center;padding:0 0.5mm;line-height:1.0;font-size:${two ? 1.58 : 1.95}mm;letter-spacing:0;white-space:nowrap" class="xs">${label.replace('|', '<br>')}</div><div style="width:10.76mm;${B}">${inp('mat_' + key + '_d1')}</div><div style="width:11.21mm;${B}">${inp('mat_' + key + '_d2')}</div><div style="flex:1">${inp('mat_' + key + '_day')}</div>`)
    y += rh[i]
  })
  // 作成日・配達日（右にロープ～養生資材の小列）
  const wrow = (top, h, html) => { const r = row(top, h, html); r.style.right = (44.45 - 33.93) + 'mm'; return r }
  wrow(37.30, 5.58, `<div style="width:11.96mm;${B};display:flex;align-items:center;padding:0 0.6mm"><span class="just small">作　成　日</span></div><div style="flex:1"><input class="form-input mini" data-field="createDate"></div>`)
  wrow(42.88, 5.53, `<div style="width:11.96mm;${B};display:flex;align-items:center;padding:0 0.6mm"><span class="just small">配　達　日</span></div><div style="flex:1"><input class="form-input mini" data-field="delivDate"></div>`)
  wrow(48.41, 7.40, `<div style="width:11.96mm;${B};display:flex;align-items:center;padding:0 0.6mm" class="small">ポイント<br>合　　計</div><div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:4mm;font-weight:700">${calcIn('pointTotal', 'style="text-align:center;font-size:4mm;font-weight:700"')}</div>`)
  // 原本実測：年 181.87／月 190.25／日 198.63／迄 201.17mm（欄左 171.4mm 基準）
  const AB = 'position:absolute;top:50%;transform:translateY(-50%)'
  row(55.81, 4.07, `<div style="width:11.96mm;${B};display:flex;align-items:center;padding:0 0.6mm"><span class="just small">保　　管</span></div><div style="flex:1;position:relative" class="small"><input class="form-input ctr mini" data-field="storageYear" style="position:absolute;left:3.6mm;top:0;height:100%;width:6.2mm"><span style="${AB};left:10.4mm">年</span><input class="form-input ctr mini" data-field="storageMonth" style="position:absolute;left:12.7mm;top:0;height:100%;width:5.6mm"><span style="${AB};left:18.8mm">月</span><input class="form-input ctr mini" data-field="storageDay" style="position:absolute;left:21.0mm;top:0;height:100%;width:6.0mm"><span style="${AB};left:27.2mm">日</span><span style="${AB};left:29.7mm">迄</span></div>`)
  const sec = row(59.88, 4.0, `<div style="width:11.96mm;${B};display:flex;align-items:center;padding:0 0.4mm" class="xs">シークレット</div><div style="flex:1;display:flex;align-items:center;justify-content:space-evenly" class="xs">${['車輌','資材','制服','引越先'].map(v => `<label class="opt"><input type="checkbox" name="secret_${v}">${v}<span class="ring"></span></label>`).join('・')}</div>`)
  sec.style.borderBottom = 'none'
  // 小列（ロープ〜養生資材）
  const gy = [37.30, 41.00, 44.71, 48.41, 52.11, 55.81]
  GEAR_ITEMS.forEach((g, i) => {
    const r = el('div', '', `<label class="opt" style="width:100%;justify-content:center;padding:0 0.5mm"><input type="checkbox" name="gear_${g.replace(/\s/g, '')}"><span class="xs just" style="padding:0 0.5mm;white-space:nowrap">${g}</span><span class="ring"></span></label>`)
    r.style.cssText = `position:absolute;left:33.93mm;right:0;top:${gy[i]}mm;height:${gy[i + 1] - gy[i]}mm;border-left:var(--line-w) solid var(--ink);border-bottom:var(--line-w) solid var(--ink);display:flex;align-items:center`
    m.append(r)
  })
  return m
}

// ラベル内の「（脱・着）」のような選択肢を〇付けできるようにする
const PICKS = {
  'アンテナ（脱・着）': ['antenna', ['脱', '着']],
  '洗濯機付(ドラム・全自動)': ['washer', ['ドラム', '全自動']],
}
function pickLabel(label) {
  const hit = PICKS[label]
  if (!hit) return label
  const [key, opts] = hit
  let out = label
  opts.forEach(o => {
    out = out.replace(o, `<label class="opt"><input type="checkbox" name="${key}_${o}" value="1">${o}<span class="ring"></span></label>`)
  })
  // 原本では「洗濯機付」の「付」に○が印字されている
  // 原本では「付」に○が印字されている。その○のまま選べるようにする（選ぶと赤い輪が付く）
  if (key === 'washer') out = out.replace('洗濯機付',
    '洗濯機<label class="opt tsuki"><input type="checkbox" name="washer_付" value="1"><span class="pcirc">付</span><span class="ring"></span></label>')
  return out
}

// ラベルが枠幅に収まる文字サイズ(mm)を返す。全角=1em、半角=0.5em で概算する。
function fitLabel(label, wmm, base = 2.1) {
  const em = [...String(label)].reduce((n, ch) => n + (/[\x20-\x7E]/.test(ch) ? 0.5 : 1), 0)
  if (em <= 0) return base
  return Math.min(base, +((wmm - 0.2) / em).toFixed(2))
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
  FEE_A.forEach(([key, label]) => a.append(feeRow(label, key ? { name: 'feeA_' + key, lw: 18.79 } : null)))
  const sa = feeRow('小 計 （A）', null); sa.querySelector('.fv').innerHTML = '<span class="yen">¥</span>' + calcIn('subA'); a.append(sa)

  const b = $('#fees-b'); b.append(el('div', 'fee-hd', '附　帯　料　金'))
  FEE_B.forEach(([key, label]) => b.append(feeRow(label, { name: 'feeB_' + key, lw: 19.39 })))
  const sb = feeRow('小 計 （B）', null); sb.querySelector('.fv').innerHTML = '<span class="yen">¥</span>' + calcIn('subB'); b.append(sb)

  const c = $('#fees-c'); c.append(el('div', 'fee-hd', '資　材　の　料　金'))
  FEE_C.forEach(([key, label, unit]) => {
    const r = el('div', 'fee-row',
      `<div class="fl" style="width:17.84mm;justify-content:space-between">${label.includes('|')
        ? `<span class="xs" style="line-height:1.02;font-size:1.62mm;letter-spacing:0;white-space:nowrap">${label.replace('|', '<br>')}</span>`
        : `<span class="small" data-fit style="display:inline-block;max-width:9.4mm;white-space:nowrap;${label.length <= 1 ? 'padding-left:5.6mm' : ''}">${label}</span>`}<span class="xs" style="white-space:nowrap">${inp('feeC_' + key + '_qty1', 'form-input qty mini', 'style="width:4.5mm"')}${unit}</span></div>` +
      `<div class="fv" style="flex:0 0 14.22mm;border-right:var(--line-w) solid var(--ink)"><span class="yen">¥</span>${inp('feeC_' + key + '_amt1', 'form-input num mini')}</div>` +
      `<div class="fl" style="width:9.08mm;justify-content:flex-end"><span class="xs">${inp('feeC_' + key + '_qty2', 'form-input qty mini', 'style="width:4.5mm"')}${unit}</span></div>` +
      `<div class="fv"><span class="yen">¥</span>${inp('feeC_' + key + '_amt2', 'form-input num mini')}</div>`)
    c.append(r)
  })
  c.append(el('div', 'fee-row', '<div class="fl" style="width:17.84mm"></div><div class="fv" style="flex:0 0 14.22mm;border-right:var(--line-w) solid var(--ink)"></div><div class="fl" style="width:9.08mm"></div><div class="fv"></div>'))
  const sc = el('div', 'fee-row', '<div class="fl" style="width:32.9mm"><span class="just small">小 計 （C）</span></div><div class="fv"><span class="yen">¥</span>' + calcIn('subC') + '</div>')
  c.append(sc)
}

/* ---------- お支払方法・その他の料金 ---------- */
function buildPay() {
  const p = $('#pay'), p2 = $('#pay2')
  // 原本はお支払方法とその他の料金が別枠（側の罫線が 198〜200mm で切れている）
  const SPLIT = 19.39
  const mk = (host, off) => (top, h, html, cls = '') => {
    const r = el('div', 'p-row ' + cls, html)
    r.style.top = +(top - off).toFixed(2) + 'mm'; r.style.height = h + 'mm'
    host.append(r); return r
  }
  const rowA = mk(p, 0), rowB = mk(p2, SPLIT)
  const row = (top, h, html, cls = '') => (top < SPLIT ? rowA : rowB)(top, h, html, cls)
  row(0, 5.3, '<div style="flex:1;text-align:center;font-weight:400;letter-spacing:1.9mm">お支払方法</div>')
  row(5.3, 4.4, '<div style="flex:1;display:flex;justify-content:space-between;padding:0 1.2mm" class="small">' +
    ['現 金', '前 受 金', '会 社 請 求'].map(v => `<label class="opt"><input type="radio" name="payMethod" value="${v.replace(/\s/g, '')}">${v}<span class="ring"></span></label>`).join('<span class="sep">・</span>') + '</div>')
  // 原本の実測：カ 157.02／ド末 168.70／（ 173.39／） 202.22（mm）
  row(9.7, 4.5, `<div class="small" style="position:relative;width:100%;height:100%"><label class="opt" style="position:absolute;left:0.14mm;top:50%;transform:translateY(-50%);padding:0 0.3mm"><input type="radio" name="payMethod" value="カード"><span style="letter-spacing:3.11mm;margin-right:-3.11mm">カード</span><span class="ring"></span></label><span style="position:absolute;left:15.76mm;top:50%;transform:translateY(-50%)">（</span><input class="form-input mini" data-field="cardNote" style="position:absolute;left:18.1mm;top:0;height:100%;width:27mm"><span style="position:absolute;left:45.93mm;top:50%;transform:translateY(-50%)">)</span></div>`)
  row(14.22, 4.45, `<div class="small" style="display:flex;align-items:center;width:100%"><span class="small">領収書宛先名</span><input class="form-input mini" data-field="receiptName" style="flex:1"></div>`)
  row(19.4, 4.11, '<div style="flex:1;text-align:center;font-weight:400;letter-spacing:1.5mm">その他の料金</div>')
  const tops = [23.51, 27.64, 31.70, 35.77, 39.90, 44.02, 48.08, 52.16, 56.34, 60.40]
  FEE_D.forEach(([key, label, note], i) => {
    const lw = 24.63
    // 「外し」「付け」は原本でそれぞれ〇を付ける
    const noteHtml = note ? `<span class="xs" style="line-height:1.02;margin-left:0.3mm">${note.split('|')
      .map(t => key ? `<label class="opt" style="padding:0 0.2mm"><input type="checkbox" name="${key}_${t}" value="1">${t}<span class="ring"></span></label>` : t)
      .join('<br>')}</span>` : ''
    const wLab = note ? 17.5 : 22.5
    // 長いラベルは折り返さず、枠に収まるまで字を詰める（原本も1行）
    const fs = fitLabel(label, wLab - (PICKS[label] ? 1.2 : 0))
    row(tops[i], tops[i + 1] - tops[i],
      `<div style="width:${lw}mm;height:100%;display:flex;align-items:center;border-right:var(--line-w) solid var(--ink);padding-left:0.6mm"><span class="just small" style="width:${wLab}mm;white-space:nowrap;font-size:${fs}mm">${pickLabel(label)}</span>${noteHtml}</div>` +
      `<div style="flex:1;display:flex;align-items:center;padding:0 0.5mm"><span class="yen">¥</span>${key ? inp('feeD_' + key, 'form-input num mini') : ''}</div>`).style.padding = '0'
  })
  row(60.40, 4.13, '<div style="width:24.63mm;height:100%;display:flex;align-items:center;border-right:var(--line-w) solid var(--ink);padding-left:0.6mm"><span class="just small" style="width:17mm">小　計 (D)</span></div><div style="flex:1;display:flex;align-items:center;padding:0 0.5mm"><span class="yen">¥</span>' + calcIn('subD') + '</div>').style.padding = '0'
  // 合計（ラベルが2段の¥をまたぐ）
  const g = row(64.53, 9.90, '', ''); g.style.padding = '0'
  g.innerHTML = `<div style="width:20.56mm;height:100%;display:flex;flex-direction:column;justify-content:center;border-right:var(--line-w) solid var(--ink);padding-left:0.6mm"><span class="just small" style="width:15mm">合　　計</span><span class="xs">(A)+(B)+(C)+(D)</span></div>` +
    `<div style="flex:1;height:100%;display:flex;align-items:center;padding:0 0.5mm"><span class="yen">¥</span>${calcIn('total')}</div>`
  const t3 = [[74.43, 6.43, '総　合　計', 'grand'], [80.86, 6.45, '消 費 税', 'tax'], [87.31, 6.39, '再　　計', 'final']]
  t3.forEach(([top, h, label, calc], i) => {
    const r = row(top, h, `<div style="width:20.56mm;height:100%;display:flex;align-items:center;border-right:var(--line-w) solid var(--ink);padding-left:1.7mm"><span class="just" style="width:15mm;font-weight:${calc === 'final' ? 700 : 400}">${label}</span></div><div style="flex:1;display:flex;align-items:center;padding:0 0.5mm"><span class="yen">¥</span>${calcIn(calc)}</div>`)
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
    let colPt = 0, colQty = 0
    col.forEach(([key, , , p]) => {
      const q = val('kz_' + key); colQty += q
      // 才数が原本で空の行は、書き込まれた才数を使う
      colPt += (typeof p === 'number' ? p : val('kz_' + key + '_pt')) * q
    })
    // 自由記入行（点数×数量。どちらか空なら0）
    freeSlots.filter(f => f.col === ci).forEach(f => { const q = val('kzx' + f.n + '_qty'); colQty += q; colPt += val('kzx' + f.n + '_pt') * q })
    out['ptcol' + ci] = colPt; out['qtycol' + ci] = colQty; pt += colPt
  })
  out.pointTotal = pt
  for (const [k, v] of Object.entries(out)) {
    const e = document.querySelector(`[data-calc="${k}"]`)
    if (!e) continue
    if (e.dataset.manual === '1') continue      // 手入力で上書き中は自動計算を書き込まない
    if ('value' in e) e.value = v > 0 ? fmt(v) : ''
    else e.textContent = v > 0 ? fmt(v) : ''
  }
}

/* ---------- はみ出し防止：欄に収まるまで文字を自動縮小 ---------- */
// 家財表の右列（メモ欄）：1文字は大きく、2文字目からは小さくして枠に収める
const PX = 96 / 25.4
function memoBase(el) {
  const n = [...(el.value || '')].length
  el.style.fontWeight = n <= 1 ? '700' : '500'
  return (n <= 1 ? 2.6 : n === 2 ? 2.0 : 1.6) * PX + 'px'
}
function autoFit(el) {
  if (el.dataset.field && /_x$/.test(el.dataset.field)) el.dataset.baseFs = memoBase(el)
  else if (!el.dataset.baseFs) el.dataset.baseFs = getComputedStyle(el).fontSize
  el.style.fontSize = el.dataset.baseFs
  let fs = parseFloat(el.dataset.baseFs)
  const min = fs * 0.45
  if (el.tagName === 'TEXTAREA') {
    while (el.scrollHeight > el.clientHeight + 0.5 && fs > min) { fs -= 0.3; el.style.fontSize = fs + 'px' }
  } else {
    while (el.scrollWidth > el.clientWidth + 0.5 && fs > min) { fs -= 0.3; el.style.fontSize = fs + 'px' }
  }
}
// 静的な文字（品名など）を枠に収める。原本は長い品名を長体（横に詰めた字）で入れているので、
// はみ出す分だけ横方向に縮める。data-fit を付けた要素が対象。
function fitStatic(el) {
  let w = el.querySelector(':scope > .fitwrap')
  if (!w) { w = document.createElement('span'); w.className = 'fitwrap'; while (el.firstChild) w.append(el.firstChild); el.append(w) }
  w.style.transform = ''
  const cs = getComputedStyle(el)
  w.style.transformOrigin = cs.justifyContent === 'center' ? 'center center' : 'left center'
  const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  const need = w.offsetWidth
  if (need > avail + 0.2) w.style.transform = `scaleX(${(avail / need).toFixed(4)})`
}
function fitStaticAll() { document.querySelectorAll('[data-fit]').forEach(fitStatic) }

function autoFitAll() {
  document.querySelectorAll('.form-input, .form-area').forEach(el => { if (el.value) autoFit(el) })
}

/* ---------- 表示スケール（スマホはA4を丸ごと縮小） ---------- */
// CRM の見積書モーダルに iframe で埋め込まれているか
const EMBED = new URLSearchParams(location.search).get('embed') === '1'
function fitScale() {
  const base = 210 * 96 / 25.4
  const w = document.documentElement.clientWidth
  const s = Math.min(1, w / base)
  const sc = $('.sheet-scale')
  sc.style.transform = s < 1 ? `scale(${s})` : ''
  const h = (297 * 96 / 25.4) * s
  $('.sheet-viewport').style.height = h + 'px'
  // 親（モーダル）が iframe の高さを合わせられるように知らせる
  if (EMBED && parent !== window) parent.postMessage({ type: 'estimate:height', height: Math.ceil(h) }, '*')
}

/* ---------- 起動 ---------- */
buildKazai(); buildFees(); buildPay(); buildMedia()
document.addEventListener('input', e => {
  const t = e.target
  if (t.matches && t.matches('[data-calc]')) {
    if (t.value.trim() === '') { delete t.dataset.manual } else { t.dataset.manual = '1' }
  }
  if (t.matches && t.matches('.num, .qty, [data-field^="fee"], [data-field^="kz_"], [data-field^="kzx"], [data-calc]')) recalc()
  if (t.matches && t.matches('.form-input, .form-area')) autoFit(t)
  // 電話番号の3枠：数字以外は捨て、枠が埋まる（か－を打つ）と次の枠へ
  if (t.dataset && t.dataset.tel) {
    const raw = t.value, digits = raw.replace(/\D/g, '').slice(0, +t.maxLength || 4)
    if (raw !== digits) t.value = digits
    if (digits.length >= (+t.maxLength || 4) || /[-ー－\s]$/.test(raw)) {
      const nxt = t.parentElement.querySelector(`[data-tel="${+t.dataset.tel + 1}"]`)
      if (nxt) nxt.focus()
    }
  }
})
document.addEventListener('estimate:recalc', recalc)
recalc()
fitScale(); addEventListener('resize', fitScale)
if (new URLSearchParams(location.search).get('debug') === 'overlay') {
  document.body.classList.add('debug-overlay')
  $('.reference-overlay').src = '../IMG_9280.jpeg'
}
// CRM（見積管理タブ）の「印刷プレビュー」からの流し込み。
// 見積書モーダル（?embed=1）では親が明示的に流し込むので、ここでは読まない。
if (!EMBED) try {
  const stored = localStorage.getItem('transportfukuoka:estimatePrint')
  if (stored) applyFormData(JSON.parse(stored))
} catch { /* 壊れたデータは無視して白紙で開く */ }
// 金額欄はカンマ区切りで表示（内部値は data-value に保持）
function formatMoneyInputs() {
  document.querySelectorAll('.form-input.num').forEach(el => {
    // 常に「今の表示値」を基準にする（保存済み data-value を優先すると手入力が巻き戻る）
    const raw = String(el.value).replace(/[,\s]/g, '')
    if (raw && isFinite(Number(raw))) { el.dataset.value = raw; el.value = Number(raw).toLocaleString('ja-JP') }
    else if (!raw) { delete el.dataset.value }
  })
}
document.addEventListener('focusout', e => {
  if (e.target.matches && e.target.matches('.form-input.num')) { formatMoneyInputs(); recalc() }
})
// フォント読込後に、流し込んだ値のはみ出しを一括補正
formatMoneyInputs()
// 〇（ラジオ）は一度選んだあと、もう一度押すと外せる。AM/PM なども同じ。
document.addEventListener('mousedown', e => {
  const lb = e.target.closest && e.target.closest('label.opt')
  const r = lb && lb.querySelector('input[type=radio]')
  if (r) r.dataset.wasChecked = r.checked ? '1' : ''
}, true)
document.addEventListener('click', e => {
  const lb = e.target.closest && e.target.closest('label.opt')
  const r = lb && lb.querySelector('input[type=radio]')
  if (!r) return
  if (r.dataset.wasChecked === '1') {
    // ラベルの既定動作（＝選び直し）を止めてから外す
    e.preventDefault(); e.stopPropagation()
    r.checked = false
    r.dispatchEvent(new Event('change', { bubbles: true }))
  }
  r.dataset.wasChecked = ''
}, true)

if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitStaticAll(); autoFitAll() })
else { fitStaticAll(); autoFitAll() }
document.addEventListener('estimate:recalc', () => { fitStaticAll(); autoFitAll() })
// 親（CRM の見積書モーダル）から呼ぶ入口。iframe は同一オリジンなので直接触れる。
window.estimateForm = {
  applyFormData, readFormData, readTotals, recalc, autoFitAll, fitStaticAll,
  // 流し込み→金額の桁区切り→再計算→はみ出し補正までを1回で
  fill(data) { applyFormData(data || {}); formatMoneyInputs(); recalc(); fitStaticAll(); autoFitAll() },
  read() { return { data: readFormData(), totals: readTotals() } },
}
if (EMBED && parent !== window) parent.postMessage({ type: 'estimate:ready' }, '*')
