// v0.47 検証：再送が新着リードを塞がないか／無限再送しないか。
// 実ファイルの該当行をそのまま抜き出して1巡回を再現する。
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8')
const L = src.split('\n')
const grab = (needle, pickIdx = 0) => {
  const hit = L.filter(l => l.includes(needle))
  if (!hit.length) throw new Error('not found: ' + needle)
  return { one: hit[pickIdx].trim(), count: hit.length }
}
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS ✅' : 'FAIL ❌'}  ${n}${d ? '  … ' + d : ''}`) }

const sweep = grab('&& !seen.has(r.id) && !failed.has(r.id))', 1) // 侍(receivedAt)側
const cand = grab('const cand = rows.filter', 0)
const fresh = grab('const fresh = [...cand.filter', 0)
const okL = grab('if (r && r.ok) { seen.add(base.id); failed.delete(base.id)', 0)
check('両ループとも新着優先の並べ替えが入っている', grab('const fresh = [...cand.filter').count === 2, `${grab('const fresh = [...cand.filter').count}箇所`)
check('両ループとも再送上限(MAX_RETRY)がある', (src.match(/const MAX_RETRY = 60/g) || []).length === 2)
check('両ループとも旧形式の failed 配列を読める', (src.match(/Array\.isArray\(e\) \? e : \[e, 1\]/g) || []).length === 2)

// 失敗時ブロック（複数行）を実ソースから切り出す
const startIdx = L.findIndex(l => l.includes('// 上限まで再送し、それでも駄目なら諦めて取込済みにする'))
const failBlock = L.slice(startIdx - 1, startIdx + 6).join('\n')

const MAX_RETRY = 60
const runTick = new Function('rows', 'seen', 'failed', 'isToday', 'send', 'PER', 'MAX_RETRY', 'console', `
  return (async () => {
    let changed = false, cnt = 0
    ${sweep.one}
    ${cand.one}
    ${fresh.one}
    const attempted = []
    for (const base of fresh.slice(0, PER)) {
      attempted.push(base.id)
      const r = await send(base)
      ${okL.one}
${failBlock}
    }
    return { cnt, attempted, seen: Array.from(seen), failed: Array.from(failed) }
  })()
`)
const quiet = { warn() {}, log() {}, error() {} }
const run = (rows, seen, failed, isToday, send) => runTick(rows, seen, failed, isToday, send, 8, MAX_RETRY, quiet)

console.log('\n【新着の飢餓】再送待ちが送信枠(PER=8)を埋めても、新着リードが送れるか')
{
  const seen = new Set(), failed = new Map()
  // 恒久的に失敗する古いリード10件を failed に積んでおく
  const stuck = Array.from({ length: 10 }, (_, i) => ({ id: 'stuck' + i, receivedAt: 'past' }))
  stuck.forEach(r => failed.set(r.id, 1))
  const rows = [...stuck, { id: 'NEW-1', receivedAt: 'today' }, { id: 'NEW-2', receivedAt: 'today' }]
  const sent = []
  const send = async (b) => { if (b.id.startsWith('stuck')) return { ok: false, status: 500 }; sent.push(b.id); return { ok: true } }
  const r = await run(rows, seen, failed, (d) => d === 'today', send)
  check('新着リードが送信された', sent.includes('NEW-1') && sent.includes('NEW-2'),
    sent.length ? `送信=${sent.join(',')}` : '★新着が1件も送られなかった（飢餓）')
  check('新着が試行順の先頭に来ている', r.attempted[0] === 'NEW-1' && r.attempted[1] === 'NEW-2',
    `試行順=${r.attempted.slice(0, 3).join(',')}...`)
}

console.log('\n【無限再送の防止】恒久失敗リードは上限で打ち切られるか')
{
  const seen = new Set(), failed = new Map()
  const rows = [{ id: 'BAD', receivedAt: 'today' }]
  const send = async () => ({ ok: false, status: 500 })
  let ticks = 0
  const isToday = () => true
  while (!seen.has('BAD') && ticks < 200) { await run(rows, seen, failed, isToday, send); ticks++ }
  check('上限に達したら打ち切られる（無限に再送しない）', seen.has('BAD'), `${ticks}回で打ち切り`)
  check('打ち切り回数が上限どおり', ticks === MAX_RETRY, `${ticks}回 / 上限${MAX_RETRY}`)
  check('打ち切り後 failed から除去される', !failed.has('BAD'))
}

console.log('\n【復旧シナリオの回帰】上限内に復旧すれば取り込まれる')
{
  const seen = new Set(), failed = new Map()
  const rows = [{ id: 'L1', receivedAt: '23:55' }]
  let down = true
  let today = true // ①まず当日中に到着して送信失敗する（実際の順序）
  const send = async () => (down ? { ok: false, status: 503 } : { ok: true })
  await run(rows, seen, failed, () => today, send)
  check('当日中の失敗は再送対象として保持される', !seen.has('L1') && failed.has('L1'))
  today = false // ②0時を回って「非当日」になる
  await run(rows, seen, failed, () => today, send)
  check('非当日になっても取込済みにされない', !seen.has('L1') && failed.has('L1'),
    seen.has('L1') ? '★取込済みにされた＝消失' : `試行=${failed.get('L1')}`)
  for (let i = 0; i < 29; i++) await run(rows, seen, failed, () => today, send) // 計31回失敗
  check('上限未満なら保持され続ける', !seen.has('L1') && failed.get('L1') === 31, `試行=${failed.get('L1')}`)
  down = false
  const r = await run(rows, seen, failed, () => today, send)
  check('復旧後に取り込まれる', seen.has('L1') && r.cnt === 1 && !failed.has('L1'))
}

console.log('\n【通常時の回帰】過去リードを大量再送しない')
{
  const seen = new Set(), failed = new Map()
  const rows = [...Array.from({ length: 50 }, (_, i) => ({ id: 'old' + i, receivedAt: 'past' })),
                { id: 'today1', receivedAt: 'today' }]
  const sent = []
  const send = async (b) => { sent.push(b.id); return { ok: true } }
  const r = await run(rows, seen, failed, (d) => d === 'today', send)
  check('過去リードは送信されない', sent.length === 1 && sent[0] === 'today1', `送信=${sent.join(',') || 'なし'}`)
  check('過去リードは取込済みとして記録', r.seen.length === 51, `seen=${r.seen.length}`)
}

console.log(`\n────────────  合計 ${pass} PASS / ${fail} FAIL  ────────────`)
process.exit(fail ? 1 : 0)
