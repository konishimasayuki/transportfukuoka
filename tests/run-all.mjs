// 全テストを順に実行して集計する。使い方： node tests/run-all.mjs
import { execFileSync } from 'node:child_process'
const SUITES = [
  ['dup',       '重複リード：メモ/ステータス保護・二重登録の防止'],
  ['audit',     '混入バグの総合監査'],
  ['fillonly',  '住所・要望・家財の保護（空欄のみ補完）'],
  ['bugcheck',  'Lua/移行/破損・成約の重複登録'],
  ['bugcheck2', 'データ破損・異常入力への堅牢性'],
  ['kvtest',    '同時書き込みでの取りこぼし防止'],
  ['exttest',   '拡張：送信失敗の判定（4経路）'],
  ['exttest3',  '拡張：再送の優先順位と上限'],
]
let total = 0, failed = 0, bad = []
for (const [name, desc] of SUITES) {
  let out = '', ok = true
  try { out = execFileSync(process.execPath, [new URL(`${name}.mjs`, import.meta.url).pathname], { encoding: 'utf8' }) }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); ok = false }
  const m = out.match(/(\d+) PASS \/ (\d+) FAIL/)
  const p = m ? +m[1] : (out.match(/PASS ✅/g) || []).length
  const f = m ? +m[2] : (out.match(/FAIL ❌/g) || []).length
  total += p; failed += f
  if (f || !ok) bad.push(name)
  console.log(`${(f || !ok) ? '❌' : '✅'} ${name.padEnd(10)} ${String(p).padStart(3)} PASS / ${f} FAIL   ${desc}`)
}
console.log('─'.repeat(70))
console.log(`総計 ${total} PASS / ${failed} FAIL`)
if (bad.length) { console.log(`失敗したスイート: ${bad.join(', ')}（詳細は node tests/<名前>.mjs で確認）`); process.exit(1) }
