// #1 #2 の修正を、拡張の実コードを抜き出して検証する
import fs from 'fs'
let ng=0, ok=0; const t=(c,m,d='')=>{c?(ok++,console.log('✅ '+m+(d?' — '+d:''))):(ng++,console.log('❌ '+m+(d?' — '+d:'')))}

// ===== #1: hardFail の判定 =====
const content = fs.readFileSync(new URL('../extension/', import.meta.url).pathname + 'content.js','utf8')
const m = content.match(/const hardFail = \((.*?)\)\n/)
const expr = m[1]
const hardFail = new Function('res', `return (${expr})`)
console.log('--- #1 hardFail の判定 ---')
for (const [res, want, why] of [
  ['http-404', true,  '今回ズバットが誤ID/PWに返した値'],
  ['http-401', true,  '従来から拒否扱い'],
  ['http-403', true,  '従来から拒否扱い'],
  ['http-400', true,  '4xxはまとめて拒否'],
  ['http-429', true,  '4xxはまとめて拒否'],
  ['no-creds', true,  'ID/PW未保存'],
  ['http-500', false, 'サーバ障害は一時的失敗'],
  ['http-503', false, 'サーバ障害は一時的失敗'],
  ['night',    false, '夜間休止は一時的失敗'],
  ['no-csrf',  false, 'CSRF取得不可は一時的失敗'],
  ['fetch-error', false, '通信エラーは一時的失敗'],
  ['storage-error', false, '拡張の不調は一時的失敗'],
]) t(hardFail(res) === want, `${res} → ${want ? '停止にカウント' : '再試行を継続'}`, why)
t(hardFail(true) === false, 'res===true（成功）はカウントしない')

// 何回で止まるか（1日あたりの試行回数）
const MAX = Number(content.match(/RELOGIN_MAX_FAILS = (\d+)/)[1])
const GAP = eval(content.match(/RELOGIN_MIN_GAP = ([\d\s*]+)/)[1])
const before = Math.floor(16*3600*1000 / GAP)   // 6〜22時に5分ごと
console.log(`\n  誤パスワード時の1日あたりログイン試行: 修正前 約${before}回 → 修正後 ${MAX}回`)
t(MAX === 2, '上限は2回のまま（安全装置は変えていない）', `${MAX}回`)

// ===== #2: 生存判定 =====
const bg = fs.readFileSync(new URL('../extension/', import.meta.url).pathname + 'background.js','utf8')
const ka = bg.match(/async function keepAlive\(\)[\s\S]*?\n\}/)[0]
console.log('\n--- #2 生存判定 ---')
t(/j && j\.csrfToken/.test(ka), '空トークンで未ログインを判定している')
// 空トークンのとき lastBeatAt を更新しないこと（タブ再読込の安全網を働かせるため）
const idxCheck = ka.indexOf('j.csrfToken')
const idxBeat  = ka.indexOf('lastBeatAt: Date.now()')
t(idxCheck !== -1 && idxBeat > idxCheck, '未ログイン判定が lastBeatAt 更新より前にある', `判定@${idxCheck} < 更新@${idxBeat}`)
const branch = ka.slice(idxCheck, idxBeat)
t(/postStatus\(false, 'auth'\)/.test(branch) && /return/.test(branch), '未ログインなら auth を報告して抜ける（正常と言わない）')
const codeOnly = branch.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
t(!/lastBeatAt/.test(codeOnly), '未ログインの分岐では lastBeatAt を更新しない（コメント除く）')

// 実際に動かす：/csrf の応答3種でどう判定されるか
console.log('\n--- #2 応答パターン別の動き ---')
const sim = async (status, body) => {
  const calls = []
  const fn = new Function('fetch','chrome','setAuthBadge','postStatus','ZBA_CSRF','calls', `
    return (async () => {
      const r = await fetch(ZBA_CSRF, {})
      if (r.status === 401 || r.status === 403) { setAuthBadge(false); await postStatus(false, 'auth'); return }
      if (!r.ok) { await postStatus(false, 'error'); return }
      const j = await r.json().catch(() => null)
      if (!(j && j.csrfToken)) { setAuthBadge(false); await postStatus(false, 'auth'); return }
      await chrome.storage.local.set({ lastBeatAt: Date.now() })
      setAuthBadge(true)
      await postStatus(true, '')
    })()`)
  await fn(
    async () => ({ status, ok: status >= 200 && status < 300, json: async () => body }),
    { storage: { local: { set: async o => calls.push('beat:' + Object.keys(o)[0]) } } },
    v => calls.push('badge:' + v),
    (o, r) => calls.push(`status:${o?'ok':'ng'}${r?'/'+r:''}`),
    'x', calls)
  return calls
}
const a = await sim(200, { status: 'SUCCESS', csrfToken: '' })      // 未ログイン（実測の形）
t(a.includes('status:ng/auth') && !a.some(x=>x.startsWith('beat')), '未ログイン(200・空トークン) → auth報告・beat更新なし', a.join(' '))
const b = await sim(200, { status: 'SUCCESS', csrfToken: 'abc123' }) // ログイン中
t(b.includes('status:ok') && b.includes('beat:lastBeatAt'), 'ログイン中(200・トークンあり) → 正常報告・beat更新', b.join(' '))
const c = await sim(500, null)                                       // サーバ障害
t(c.includes('status:ng/error'), 'サーバ障害(500) → error報告', c.join(' '))
const d = await sim(401, null)
t(d.includes('status:ng/auth'), '401 → auth報告（従来どおり）', d.join(' '))

console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
