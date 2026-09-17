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
  ['invalid-creds', true, 'ログイン後もセッションが無効＝ID/PWが違う（本命の判定）'],
  ['busy-429', false, '★アクセス過多は「後でやり直せ」の意味。拒否ではない'],
  ['busy-408', false, '★タイムアウトも拒否ではない'],
  ['busy-425', false, '★早すぎる再送も拒否ではない'],
  ['verify-unknown', false, '確認できなかっただけなので再試行を継続'],
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
t(/postStatus\(false, authReason\)/.test(branch) && /return/.test(branch), '未ログインなら異常を報告して抜ける（正常と言わない）')
t(/zbaCredsBad === true \? 'creds' : 'auth'/.test(ka), 'その理由は auth か creds（パスワード違い）を出し分ける')
const codeOnly = branch.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
t(!/lastBeatAt/.test(codeOnly), '未ログインの分岐では lastBeatAt を更新しない（コメント除く）')

// 実際に動かす：/csrf の応答3種でどう判定されるか
console.log('\n--- #2 応答パターン別の動き ---')
const sim = async (status, body, credsBad = false) => {
  const calls = []
  const fn = new Function('fetch','chrome','setAuthBadge','postStatus','ZBA_CSRF','calls','zbaCredsBad', `
    return (async () => {
      const authReason = zbaCredsBad === true ? 'creds' : 'auth'
      const r = await fetch(ZBA_CSRF, {})
      if (r.status === 401 || r.status === 403) { setAuthBadge(false); await postStatus(false, authReason); return }
      if (!r.ok) { await postStatus(false, 'error'); return }
      const j = await r.json().catch(() => null)
      if (!(j && j.csrfToken)) { setAuthBadge(false); await postStatus(false, authReason); return }
      await chrome.storage.local.set({ lastBeatAt: Date.now() })
      setAuthBadge(true)
      await postStatus(true, '')
    })()`)
  await fn(
    async () => ({ status, ok: status >= 200 && status < 300, json: async () => body }),
    { storage: { local: { set: async o => calls.push('beat:' + Object.keys(o)[0]) } } },
    v => calls.push('badge:' + v),
    (o, r) => calls.push(`status:${o?'ok':'ng'}${r?'/'+r:''}`),
    'x', calls, credsBad)
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
const e = await sim(200, { status: 'SUCCESS', csrfToken: '' }, true) // パスワード違いが記録済み
t(e.includes('status:ng/creds'), '★パスワード違いが分かっている時は creds報告', e.join(' '))


// ===== #3: 完全ログアウト（CSRFトークンが空）でもログインを試すか =====
// ===== #4: ログイン成否を「実際にデータが取れるか」で判定しているか =====
console.log('\n--- #3 完全ログアウトからの復帰 / #4 ログイン成否の判定 ---')
{
  const body = content.match(/async function relogin\(\)[\s\S]*?\n\}/)[0]
  const RETRY_STATUS = JSON.parse(content.match(/const RETRY_STATUS = (\[[^\]]*\])/)[1])
  t(RETRY_STATUS.includes(429) && RETRY_STATUS.includes(408), '混雑扱いにするステータスが定義されている', JSON.stringify(RETRY_STATUS))
  t(!/if \(!token\).*return 'no-csrf'/.test(body), 'トークンが空でも no-csrf で諦めない')
  t(/if \(token\) headers\['csrf-token'\]/.test(body), '空のときは csrf-token ヘッダを送らない')
  t(/csrfProbe\(\)/.test(body.split('fetch(`${ZBA_API}/supplier-kanri/login`')[1] || ''),
    'ログイン後に /csrf で成否を確認している（HTTPステータス任せにしない）')

  // 実際に動かす：ログイン前トークン × ログインAPIのHTTPステータス × ログイン後の確認結果
  const run = async (token, status, probeState) => {
    const sent = []
    const cached = []
    const fn = new Function('csrfForLogin','csrfProbe','fetch','safeStorageSet','ZBA_API','creds','invalidateCsrf','csrfCache','RETRY_STATUS','sent', `
      return (async () => {
        ${body.split('\n').slice(4, -1).join('\n').replace(/await chrome\.storage\.local\.get\(\[[^\]]*\]\)/, '({...creds})')}
      })()`)
    let res
    try {
      res = await fn(
        async () => token || null,
        async () => ({ state: probeState, token: probeState === 'ok' ? 'newtok' : null }),
        async (url, opt) => { sent.push({ url, headers: opt.headers, body: JSON.parse(opt.body) }); return { ok: status>=200&&status<300, status } },
        o => cached.push(o), 'API', { zbaLoginId: 'id', zbaPassword: 'pw' }, () => {}, null, RETRY_STATUS, sent)
    } catch (e) { res = 'throw:' + e.message }
    return { res, sent, reason: (cached.find(o => o.zbaReloginReason) || {}).zbaReloginReason }
  }

  // #3 完全ログアウト（ログイン前トークンが空）
  const a = await run('', 404, 'no')
  t(a.sent.length === 1, 'トークン空でもログインAPIを叩く', `送信 ${a.sent.length}回`)
  t(a.sent[0] && !('csrf-token' in a.sent[0].headers), 'トークン空のとき csrf-token ヘッダが無い', JSON.stringify(Object.keys(a.sent[0]?.headers||{})))
  t(a.sent[0].body.loginId === 'id' && a.sent[0].body.password === 'pw', '本文の項目名は loginId / password のまま')
  const b = await run('tok123', 200, 'ok')
  t(b.sent[0] && b.sent[0].headers['csrf-token'] === 'tok123', 'トークンがあれば従来どおり送る')
  t(b.res === true, '通常経路：成功なら true', String(b.res))
  const c = await run('', 200, 'ok')
  t(c.res === true, 'トークン空でもログインできていれば成功（完全ログアウトから復帰できる）', String(c.res))

  // #4 HTTPステータスと実態が食い違うケース
  console.log('')
  for (const [tok, st, probe, want, why] of [
    ['', 200, 'no', 'invalid-creds', '★旧実装はここを「成功」と誤判定していた（200だが入れていない）'],
    ['tok', 200, 'no', 'invalid-creds', 'トークンありでも実態で判定する'],
    ['', 404, 'no', 'invalid-creds', '404でも理由は「拒否」ではなく実態で確定する'],
    ['', 404, 'ok', true, '★404でも実際に入れていれば成功（ステータスを信用しない）'],
    ['', 500, 'unknown', 'verify-unknown', 'サーバ障害で確認不能 → 上限にカウントせず再試行'],
    ['', 404, 'unknown', 'http-404', '確認不能だが4xx → 従来どおり拒否扱い（保険）'],
    ['', 429, 'unknown', 'busy-429', '★混雑で確認不能 → 止めずに再試行を続ける'],
    ['', 408, 'unknown', 'busy-408', '★タイムアウトも同じ'],
    ['', 429, 'no',      'invalid-creds', '429でも実際に入れていないと確認できたら拒否'],
    ['', 200, 'unknown', 'verify-unknown', '確認不能・200 → 再試行を継続'],
  ]) {
    const r = await run(tok, st, probe)
    t(r.res === want, `ログインAPI ${st} × 確認 ${probe} → ${String(want)}`, why + (r.res === want ? '' : ` 実際=${r.res}`))
  }
  const okrun = await run('', 404, 'ok')
  t(okrun.reason && okrun.reason.startsWith('ok'), '成功時の理由は ok（CSRFなしで成功）', String(okrun.reason))
  const ng = await run('', 200, 'no')
  t(/invalid-creds/.test(String(ng.reason)), '失敗理由にポップアップ用の説明が残る', String(ng.reason))

  // 誤ID/PWのとき何回で止まるか
  let fails = 0, tries = 0
  for (let i = 0; i < 20; i++) { tries++; if (hardFail('invalid-creds')) fails++; if (fails >= MAX) break }
  t(tries === MAX, `誤ID/PWなら ${MAX} 回で止まる（ステータスが何であっても）`, `${tries}回`)
  let vfails = 0
  for (let i = 0; i < 20; i++) if (hardFail('verify-unknown')) vfails++
  t(vfails === 0, '確認不能は何回起きても上限にカウントしない（障害復帰後に自動で戻る）')
}

// ===== #5: 巡回の指数バックオフ（優先中）=====
console.log('\n--- #5 連続失敗時だけ間隔を延ばす ---')
{
  const sched = content.match(/function scheduleNextWatch\(\)[\s\S]*?\n\}/)[0]
  const C = k => eval(content.match(new RegExp(k + '\\s*=\\s*([\\d\\s*]+)'))[1])
  const FAST = C('WATCH_FAST_MS'), SLOW = C('WATCH_SLOW_MS'), CAP = C('WATCH_BACKOFF_MAX_MS')
  const delayOf = (streak, busy) => {
    let ms = null
    new Function('watchTimer','clearTimeout','inBusyHours','WATCH_FAST_MS','WATCH_SLOW_MS','WATCH_BACKOFF_MAX_MS','watchFailStreak','setTimeout','watchTick', `
      ${sched.replace('function scheduleNextWatch()', 'return (function scheduleNextWatch()')}
      )()`)(null, () => {}, () => busy, FAST, SLOW, CAP, streak, (fn, d) => { ms = d }, () => {})
    return ms
  }
  t(delayOf(0, true) === FAST, `正常時は ${FAST/1000}秒のまま（速さを落とさない）`, `${delayOf(0,true)}ms`)
  t(delayOf(0, false) === SLOW, `夜間は ${SLOW/1000}秒のまま`, `${delayOf(0,false)}ms`)
  const want = [FAST*2, FAST*4, FAST*8, CAP, CAP]
  for (let f = 1; f <= 5; f++) {
    const g = delayOf(f, true)
    t(g === Math.min(want[f-1], CAP), `連続失敗${f}回 → ${Math.min(want[f-1],CAP)/1000}秒`, `${g}ms`)
  }
  t(delayOf(5, true) <= CAP, `上限 ${CAP/1000}秒を超えない（新着検知が止まりっぱなしにならない）`)

  // 失敗カウンタの増減
  const fns = content.match(/function noteWatchOk\(\)[\s\S]*?function noteWatchFail\(\)[^\n]*/)[0]
  const st = new Function(`let watchFailStreak = 0; ${fns}; return { ok: noteWatchOk, ng: noteWatchFail, get: () => watchFailStreak }`)()
  for (let i = 0; i < 10; i++) st.ng()
  t(st.get() === 5, '失敗カウンタは5で頭打ち', `${st.get()}`)
  st.ok()
  t(st.get() === 0, '1回成功すれば即座に通常速度へ戻る')

  // ★0件の日に減速しないこと（実際に fetchTodayCount を動かす）
  const ftc = content.match(/async function fetchTodayCount\(\)[\s\S]*?\n\}/)[0]
  const runCount = async (status, body) => {
    let streak = 0
    const fn = new Function('getCsrfToken','fetch','markBeat','noteWatchOk','noteWatchFail','invalidateCsrf','authError','tryRecoverAuth','setAuthState','postStatus','ZBA_API','SITE', `
      ${ftc.replace('async function fetchTodayCount()', 'return (async function fetchTodayCount()')}
      )()`)
    const res = await fn(
      async () => 'tok', async () => ({ status, ok: status >= 200 && status < 300, json: async () => body }),
      () => {}, () => { streak = 0 }, () => { streak++ }, () => {},
      () => { const e = new Error('AUTH'); e.auth = true; return e }, async () => false, () => {}, () => {}, 'API', 'zba')
    return { res, streak }
  }
  const zero = await runCount(200, { response: { count: 0 } })
  t(zero.streak === 0, '★件数0件でも失敗に数えない（朝の空の時間帯に減速しない）', `streak=${zero.streak}`)
  const five = await runCount(200, { response: { count: 5 } })
  t(five.streak === 0 && five.res === 5, '件数が取れたら成功・値もそのまま', `res=${five.res}`)
  const err = await runCount(503, null)
  t(err.streak === 1, 'サーバ障害(503)は失敗に数える', `streak=${err.streak}`)
}

console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
