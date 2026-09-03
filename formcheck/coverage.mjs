// 帳票（プレビュー）の入力欄が、見積書作成フォーム（CRM）から値を受け取れるかを数える。
//   - 帳票側: data-field と radio/checkbox の name をすべて集める
//   - CRM 側: buildPrintData が出すキーを Estimate.jsx から拾う。
//     動的に組み立てるキー（家財・料金・資材・チップ類）は接頭辞で誤魔化さず、
//     CRM の実際の一覧（KAZAI_GROUPS／FEE_A〜D／MATERIAL_ROWS など）から展開して突き合わせる。
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(ROOT, 'src/tabs/Estimate.jsx'), 'utf8')
const emitted = new Set()

// ---- 1) buildPrintData が名指しで出すキー ----
{
  const i = src.indexOf('function buildPrintData')
  const body = src.slice(i, i + 12000)
  // 文字列を足して組み立てる put('road' + …) は接頭辞だけ拾ってしまうので、閉じ括弧まで見る
  for (const m of body.matchAll(/put\('([^']+)'\s*[,)]/g)) emitted.add(m[1])
  for (const m of body.matchAll(/d\['([^']+)'\]\s*=/g)) emitted.add(m[1])
  for (const m of body.matchAll(/\bd\.([A-Za-z_$][\w$]*)\s*=/g)) emitted.add(m[1])
}
// ---- 2) 動的に組み立てるキーを CRM の一覧から展開 ----
{
  const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)))
  const keys = (t) => [...t.matchAll(/key:\s*'([^']+)'/g)].map(m => m[1])
  const strs = (n) => [...cut('const ' + n, ']').matchAll(/'([^']+)'/g)].map(m => m[1])
  const pkm = Object.fromEntries([...cut('const PRINT_KEY_MAP', '}\n')
    .matchAll(/'?([\w]+)'?\s*:\s*'([^']+)'/g)].map(m => [m[1], m[2]]))
  for (const k of keys(cut('const KAZAI_GROUPS', 'const FEE_A'))) {
    const p = pkm[k] || k; emitted.add('kz_' + p); emitted.add('kz_' + p + '_x')
  }
  for (const [a, b, tag] of [['const FEE_A', 'const FEE_B', 'feeA_'],
                             ['const FEE_B', 'const FEE_C', 'feeB_'],
                             ['const FEE_D', 'const KZX_MAX', 'feeD_']])
    for (const k of keys(cut(a, b))) emitted.add(tag + k)
  for (const k of keys(cut('const FEE_C', 'const FEE_D')))
    for (const s of ['qty1', 'amt1', 'qty2', 'amt2']) emitted.add('feeC_' + k + '_' + s)
  for (const m of cut('const MATERIAL_ROWS', 'const PRINT_KEY_MAP').matchAll(/\['([\w]+)'/g))
    for (const s of ['d1', 'd2', 'day']) emitted.add('mat_' + m[1] + '_' + s)
  const kzxMax = +(/const KZX_MAX = (\d+)/.exec(src)?.[1] || 0)
  for (let i = 1; i <= kzxMax; i++) for (const s of ['name', 'pt', 'qty', 'x']) emitted.add(`kzx${i}_${s}`)
  for (const v of strs('MEDIA_ITEMS')) emitted.add('media_' + v)
  for (const v of strs('SECRET_ITEMS')) emitted.add('secret_' + v)
  for (const v of strs('GEAR_ITEMS')) emitted.add('gear_' + v.replace(/\s/g, ''))
  for (const v of ['step', 'elev', 'win', 'mach']) { emitted.add(v + 'Cur'); emitted.add(v + 'Dst') }
  for (const a of ['SepFrom', 'SepTo', 'WinFrom', 'WinTo']) for (const v of strs('SM_OPTS')) emitted.add(a + '_' + v)
  for (const v of ['脱', '着']) emitted.add('antenna_' + v)
  for (const v of ['ドラム', '全自動']) emitted.add('washer_' + v)
  for (const b of ['S', 'M', 'L']) for (const s of ['C', 'D']) emitted.add('road' + b + s)
  for (const k of ['billClose', 'billPay', 'billSend']) { emitted.add(k + 'M'); emitted.add(k + 'D') }
  // 作業内容の確認（ALL・Part など。帳票の値をそのまま名前に使う）
  for (const [t, vs] of [['small', ['ALL', 'Part']], ['furni', ['D', 'E']], ['open', ['ALL', 'Part']]])
    for (const v of vs) emitted.add(t + '_' + v)
  for (const v of strs('SEND_ITEMS')) emitted.add('send_' + v)
  // 電話は applyFormData が親キーを3枠に分ける
  for (const k of [...emitted]) if (/Tel/.test(k)) [1, 2, 3].forEach(i => emitted.add(`${k}_${i}`))
}

// 帳票の上で人が直接書き込む前提の欄
const HANDWRITE = new Set(['promiseText', 'optionWork', 'cardNote', 'receiptName', 'billSend'])

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await b.newPage({ viewport: { width: 1000, height: 1200 } })
await page.goto('http://localhost:5173/estimate-form/index.html?v=' + Date.now())
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(400)
const fields = await page.evaluate(() => {
  const sheet = document.querySelector('.a4-sheet')
  const out = new Map()
  for (const e of sheet.querySelectorAll('[data-field]')) out.set(e.dataset.field, 'text')
  for (const e of sheet.querySelectorAll('input[type=radio][name], input[type=checkbox][name]')) out.set(e.name, e.type)
  for (const e of sheet.querySelectorAll('[data-calc]')) out.set(e.dataset.calc, 'calc')
  return [...out].map(([k, t]) => ({ k, t }))
})
await b.close()

const rows = fields.map(({ k, t }) =>
  t === 'calc' ? { k, t, state: '自動計算' }
  : HANDWRITE.has(k) ? { k, t, state: '帳票で直接記入' }
  : emitted.has(k) ? { k, t, state: '接続済み' }
  : { k, t, state: '未接続' })
const by = (s) => rows.filter(r => r.state === s)
const linked = by('接続済み').length, calc = by('自動計算').length
const hand = by('帳票で直接記入').length, none = by('未接続')
const denom = rows.length - calc - hand
console.log(`帳票の入力欄 ${rows.length} 個`)
console.log(`  接続済み        ${linked}`)
console.log(`  自動計算        ${calc}`)
console.log(`  帳票で直接記入  ${hand}`)
console.log(`  未接続          ${none.length}`)
console.log(`→ 人が入力する ${denom} 個のうち ${linked} 個が CRM から届く（${(linked / denom * 100).toFixed(1)}%）`)
if (none.length) { console.log('\n未接続の欄:'); for (const r of none) console.log('  -', r.k, `(${r.t})`) }
// CRM が出すのに帳票に無いキー（渡しても捨てられる）
const paper = new Set(fields.map(f => f.k))
// 電話の親キーは applyFormData が3枠に分けるので、帳票に無くて当たり前
const orphan = [...emitted].filter(k => !paper.has(k) && !paper.has(k + '_1'))
if (orphan.length) { console.log(`\nCRM が出すが帳票に無いキー ${orphan.length} 個:`); for (const o of orphan) console.log('  -', o) }
