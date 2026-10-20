// 受付日時の修復：直す内容（plan）を作るだけのスクリプト。サーバーへは何も送らない。
//
// 使い方：
//   curl -sS https://transportfukuoka.vercel.app/api/inbound -o leads.json   （全件・読むだけ）
//   TZ=Asia/Tokyo node scripts/repair-received-plan.mjs leads.json plan.json
//   → plan.json を api/inbound.js の PUT { repairReceived: plan, dryRun: true } に渡して確認してから実行する
//
// 対象：巡回の送り直しで受付日時が上書きされ、取り込んだ日時より1日以上あとになっているリード。
//   受付は必ず取り込みより前なので、1日以上あとなら書き換えと言える。
//   1日未満のずれは、サイト側の表記（価格.com は朝9時付近の時刻が入ることがある等）と区別できないため対象外。
// 戻す値：
//   ・受付日時：依頼日時（requestedAt）が取り込み日時と1日以内で一致していればその値。
//              無い・それも上書きされている場合は、取り込んだ日時（savedAt・日本時間）。
//   ・依頼日時：上書きされていれば受付日時と同じ値に戻す。
//   ・検知時刻：上書きされていれば取り込んだ日時に戻す。
// 表示は件数と日時だけ（名前・電話・住所は出さない）。
import fs from 'node:fs'
import { receivedAtMs } from '../src/lib/sortLeads.js'

const [src, out] = process.argv.slice(2)
if (!src || !out) { console.log('使い方: TZ=Asia/Tokyo node scripts/repair-received-plan.mjs <全件.json> <plan.json>'); process.exit(1) }
if (new Date(2026, 0, 1).getTimezoneOffset() !== -540) { console.log('TZ=Asia/Tokyo を付けて実行してください（画面と同じ日本時間で計算するため）'); process.exit(1) }

const HOUR = 3600000, DAY = 24 * HOUR
const THRESHOLD = DAY
const p2 = n => String(n).padStart(2, '0')
// 元の表記に合わせる（価格.com は YYYY/MM/DD HH:MM、引越し侍・ズバットは MM/DD HH:MM）
const fmtLike = (like, t) => {
  const d = new Date(t)
  const md = `${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
  return /^\d{4}/.test(String(like || '')) ? `${d.getFullYear()}/${md}` : md
}
const msOf = (s, lead) => receivedAtMs({ receivedAt: s, savedAt: lead.savedAt, updatedAt: lead.updatedAt, detectedAt: lead.detectedAt })

const items = JSON.parse(fs.readFileSync(src, 'utf8')).items
const plan = [], stats = { bySite: {}, fromRequested: 0, fromSaved: 0, requestedFixed: 0, detectedFixed: 0, over1day: 0 }
for (const l of items) {
  const saved = Date.parse(l.savedAt || '')
  const rec = receivedAtMs(l)
  if (!l.key || !l.receivedAt || isNaN(saved) || !rec || rec - saved <= THRESHOLD) continue
  const from = { receivedAt: l.receivedAt }, to = {}
  // 受付日時
  const reqT = l.requestedAt ? msOf(l.requestedAt, l) : 0
  // 依頼日時が取り込み日時と1日以内・今の受付日時と違う時だけ使う（依頼日時ごと上書きされていることがあるため）
  const reqVal = reqT && Math.abs(reqT - saved) <= DAY ? fmtLike(l.receivedAt, reqT) : ''
  if (reqVal && reqVal !== l.receivedAt && reqT <= saved + HOUR) { to.receivedAt = reqVal; stats.fromRequested++ }
  else { to.receivedAt = fmtLike(l.receivedAt, saved); stats.fromSaved++ }
  // 依頼日時（上書きされていたら戻す）
  if (l.requestedAt && reqT - saved > HOUR) { from.requestedAt = l.requestedAt; to.requestedAt = fmtLike(l.requestedAt, msOf(to.receivedAt, l)); stats.requestedFixed++ }
  // 検知時刻（上書きされていたら戻す）
  const det = Date.parse(l.detectedAt || '')
  if (!isNaN(det) && det - saved > HOUR) { from.detectedAt = l.detectedAt; to.detectedAt = l.savedAt; stats.detectedFixed++ }
  plan.push({ key: l.key, from, to })
  stats.bySite[l.site || '不明'] = (stats.bySite[l.site || '不明'] || 0) + 1
}
fs.writeFileSync(out, JSON.stringify(plan))
console.log(`対象 ${plan.length}件`, JSON.stringify(stats.bySite))
console.log(`受付日時：依頼日時から ${stats.fromRequested}件 ／ 取り込み日時から ${stats.fromSaved}件`)
console.log(`依頼日時も戻す ${stats.requestedFixed}件 ／ 検知時刻も戻す ${stats.detectedFixed}件`)
console.log(`送る量 ${(Buffer.byteLength(JSON.stringify({ repairReceived: plan })) / 1024).toFixed(1)}KB → ${out}`)
