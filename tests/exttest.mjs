// 拡張機能の送信判定を、実ファイルから関数を抜き出して実行して検証する。
// （コピーした写しではなく、実際に配布されるコードを対象にする）
import { readFileSync } from 'node:fs'

const bg = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8')
const ct = readFileSync(new URL('../extension/content.js', import.meta.url), 'utf8')

// ソースから関数本体を切り出すヘルパー（対応する波括弧まで）
function extract(src, header) {
  const start = src.indexOf(header)
  if (start === -1) throw new Error('not found: ' + header)
  let i = src.indexOf('{', start), depth = 0
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1) }
  }
  throw new Error('unbalanced: ' + header)
}

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS ✅' : 'FAIL ❌'}  ${n}${d ? '  … ' + d : ''}`) }

// ── 実コードを取り込んで実行可能にする ──────────────
const bgSrc = extract(bg, 'function isRetryableStatus') + '\n' + extract(bg, 'async function handleLead')
const ctSrc = extract(ct, 'function directSend')

let lastFetch = null
const makeEnv = (responder) => ({
  API_URL: 'http://mock/api/inbound',
  SITE: 'ズバット',
  console: { warn() {}, error() {}, log() {} },
  fetch: async (url, opts) => { lastFetch = JSON.parse(opts.body); return responder() },
  bumpCount: async () => {},
  notifyNewLead: () => {},
})
const build = (src, exportName, responder) => {
  const env = makeEnv(responder)
  const keys = Object.keys(env)
  // eslint-disable-next-line no-new-func
  return new Function(...keys, `${src}; return ${exportName}`)(...keys.map(k => env[k]))
}
const resp = (status, body = {}) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body,
})

console.log('\n【拡張】サーバー500時：リードを「取り込み済み」にせず再送対象として残すか')
for (const [label, src, name] of [
  ['background.js handleLead', bgSrc, 'handleLead'],
  ['content.js  directSend',  ctSrc, 'directSend'],
]) {
  const send500 = build(src, name, () => resp(500, { error: 'boom' }))
  const r500 = await send500({ key: 'K1', phone: '090', name: 'テスト' })
  check(`${label}：500は失敗として返す(ok:false)`, r500.ok === false, `ok=${r500.ok} status=${r500.status}`)

  const send503 = build(src, name, () => resp(503))
  check(`${label}：503も失敗`, (await send503({ key: 'K' })).ok === false)

  const send429 = build(src, name, () => resp(429))
  check(`${label}：429(混雑)も再送対象`, (await send429({ key: 'K' })).ok === false)

  const sendNet = build(src, name, () => { throw new Error('network down') })
  check(`${label}：通信断も失敗`, (await sendNet({ key: 'K' })).ok === false)

  const send400 = build(src, name, () => resp(400, { error: 'lead data required' }))
  const r400 = await send400({ key: 'K' })
  check(`${label}：400は打ち切り(無限再送しない)`, r400.ok === true && r400.rejected === true, `ok=${r400.ok} rejected=${r400.rejected}`)

  const send200 = build(src, name, () => resp(200, { ok: true, duplicate: false }))
  const r200 = await send200({ key: 'K' })
  check(`${label}：200は成功・新規判定`, r200.ok === true && r200.duplicate === false)

  const sendDup = build(src, name, () => resp(200, { ok: true, duplicate: true }))
  check(`${label}：重複応答を正しく伝える`, (await sendDup({ key: 'K' })).duplicate === true)
}

console.log('\n【拡張】巡回ループの再送シナリオ（500が続いた後に復旧して取り込まれるか）')
{
  let calls = 0
  // 最初の2回は500、3回目で成功するサーバー
  const send = build(bgSrc, 'handleLead', () => (++calls <= 2 ? resp(500) : resp(200, { duplicate: false })))
  const seen = new Set()
  const lead = { id: 'L1', key: 'K-L1', phone: '090' }
  // 実際の巡回ループと同じ判定：if (r && r.ok) { seen.add(...) }
  for (let tick = 1; tick <= 3; tick++) {
    if (seen.has(lead.id)) continue
    const r = await send(lead)
    if (r && r.ok) seen.add(lead.id)
  }
  check('500が続く間はseenに入らず再送される', calls === 3, `送信試行=${calls}回`)
  check('復旧後に取り込まれる', seen.has('L1'))
}
{
  // 修正前の挙動を再現（常にok:true）→ 1回で打ち切られリードが失われることの対比
  let calls = 0
  const sendOld = async () => { calls++; return { ok: true } } // 旧: res.okを見ない
  const seen = new Set()
  for (let tick = 1; tick <= 3; tick++) { if (seen.has('L1')) continue; const r = await sendOld(); if (r && r.ok) seen.add('L1') }
  check('（対比）修正前は500でも1回で打ち切られていた', calls === 1, `送信試行=${calls}回 → リード消失`)
}

console.log(`\n────────────  合計 ${pass} PASS / ${fail} FAIL  ────────────`)
process.exit(fail ? 1 : 0)
