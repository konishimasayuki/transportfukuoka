// パスワード変更の検知：
//   「保存しているID/PWがサイトに拒否された」状態を、ただのログイン切れと区別して
//   CRM画面・拡張ポップアップに出せているかを、実コードを抜き出して検証する。
// 2026-09の事故（お客様がサイト側でパスワードを変更）で原因特定が遅れた対策。
import fs from 'fs'
let ng = 0, ok = 0
const t = (c, m, d = '') => { c ? (ok++, console.log('✅ ' + m + (d ? ' — ' + d : ''))) : (ng++, console.log('❌ ' + m + (d ? ' — ' + d : ''))) }

const content = fs.readFileSync(new URL('../extension/content.js', import.meta.url).pathname, 'utf8')
const bg = fs.readFileSync(new URL('../extension/background.js', import.meta.url).pathname, 'utf8')
const popup = fs.readFileSync(new URL('../extension/popup.js', import.meta.url).pathname, 'utf8')
const alert = fs.readFileSync(new URL('../src/components/SiteAlert.jsx', import.meta.url).pathname, 'utf8')

// ===== ① ズバット：tryRecoverAuth を実際に動かす =====
console.log('--- ① ズバット：ID/PW拒否をどう記録するか ---')
{
  const flag = content.match(/let credsBad = false[\s\S]*?function postAuthProblem\(\)[^\n]*/)[0]
  const recover = content.match(/async function tryRecoverAuth\(\)[\s\S]*?\n\}/)[0]
  const make = (maxFails = 99) => {
    const posted = []
    const saved = []
    const fn = new Function('relogin', 'safeStorageSet', 'postStatus', 'setAuthState', 'console', 'RELOGIN_MAX_FAILS', 'RELOGIN_MIN_GAP', 'SITE', 'res', `
      let lastReloginAt = 0, reloginFails = 0, morningResetDate = ''
      ${flag}
      ${recover}
      return { run: tryRecoverAuth, creds: () => credsBad, report: () => postAuthProblem(), fails: () => reloginFails }`)
    let next = true
    const api = fn(
      async () => next,
      o => saved.push(o),
      (o, r) => { posted.push(o ? 'ok' : r); return Promise.resolve() },
      () => {}, { log() {}, warn() {} },
      maxFails, 0, 'zba', null)
    return { ...api, posted, saved, set: v => { next = v } }
  }

  // ID/PWが拒否された
  const a = make()
  a.set('invalid-creds'); await a.run()
  t(a.creds() === true, '★ID/PWが通らなければ「パスワード違い」として記録する')
  a.posted.length = 0; a.report()
  t(a.posted[0] === 'creds', '★CRMへは auth ではなく creds で報告する', a.posted[0])
  t(a.saved.some(o => o.zbaCredsBad === true), 'chrome.storage にも残す（拡張を再起動しても忘れない）')

  // 一時的な失敗では立てない
  const b = make()
  b.set('verify-unknown'); await b.run()
  t(b.creds() === false, '確認できなかっただけなら「パスワード違い」にしない')
  b.posted.length = 0; b.report()
  t(b.posted[0] === 'auth', '一時的失敗は従来どおり auth で報告する', b.posted[0])
  const c = make()
  c.set('night'); await c.run()
  t(c.creds() === false, '夜間休止で「パスワード違い」にしない')

  // 4xx拒否でも立てる
  const d = make()
  d.set('http-403'); await d.run()
  t(d.creds() === true, '4xxで拒否された場合も「パスワード違い」とみなす')

  const g = make()
  g.set('busy-429'); await g.run()
  t(g.creds() === false, '★アクセス過多(429)で「パスワード違い」にしない（誤って赤帯を出さない）')

  // 立ったら消えない（毎朝のリセットでも消えない）— 成功で初めて消える
  const e = make()
  e.set('invalid-creds'); await e.run()
  e.set('verify-unknown'); await e.run()
  t(e.creds() === true, '★一度立ったら一時的失敗では消えない（表示が毎朝消えてしまうのを防ぐ）')
  e.set(true); await e.run()
  t(e.creds() === false, '★ログインに成功したら解除される')
  t(e.saved.some(o => o.zbaCredsBad === false), '解除も chrome.storage に書く')

  // 従来の安全装置を壊していないか
  const f = make(2)
  f.set('invalid-creds')
  for (let i = 0; i < 10; i++) await f.run()
  t(f.fails() === 2, '試行上限2回は維持（ロック防止）', `${f.fails()}回`)
}

// ===== ② ズバット：報告経路に auth の直書きが残っていないか =====
console.log('\n--- ② 報告経路 ---')
t(!/postStatus\(false, 'auth'\)/.test(content), 'content.js に auth の直書きが残っていない（すべて postAuthProblem 経由）')
t(/postStatus\(false, credsBad \? 'creds' : 'auth'\)/.test(content), 'postAuthProblem が creds と auth を出し分ける')
{
  const init = content.match(/async function init\(\)[\s\S]*?\n\}/)[0]
  t(/zbaCredsBad/.test(init), '起動時に chrome.storage から復元する')
  const listener = content.match(/chrome\.storage\.onChanged[\s\S]*?\n\}\)/)[0]
  t(/zbaCredsBad/.test(listener) && /reloginFails = 0/.test(listener), 'ポップアップで保存し直したら即座に解除して再試行できる')
}

// ===== ③ 価格.com／引越し侍 =====
console.log('\n--- ③ 価格.com／引越し侍 ---')
for (const [label, site] of [['価格.com', 'kakaku'], ['引越し侍', 'samurai']]) {
  const src = bg.slice(bg.indexOf(`'${site}Creds', '${site}ReloginBlocked'`))
  const body = src.slice(0, src.indexOf('\n  }\n'))
  t(new RegExp(`'${site}CredsBad'`).test(body), `${label}：保存済みの「パスワード違い」を読み込む`)
  t(new RegExp(`credsBad = true; set\\(\\{[^}]*${site}CredsBad: true`).test(body), `${label}：★ログインし直しても弾かれたら記録する`)
  t(new RegExp(`${site}CredsBad: true[\\s\\S]{0,120}?postStatus\\(false, 'creds'\\)`).test(body), `${label}：★CRMへ creds で報告する`)
  t(new RegExp(`ReloginResult: 'success'[^}]*${site}CredsBad: false`).test(body), `${label}：ログイン成功で解除する`)
  // 毎朝のリセットで消えないこと（消えると「パスワード違い」の表示が毎朝消える）
  const mi = body.indexOf('朝5時以降の初回')
  const morning = body.slice(mi, body.indexOf('\n    }', mi)) // 毎朝のリセット節だけを切り出す
  t(!/CredsBad/.test(morning), `${label}：★毎朝のリセットでは消さない`)
}
t((bg.match(/authNg\(\)/g) || []).length === 12, '2サイトとも auth 報告が出し分け関数を通る', `${(bg.match(/authNg\(\)/g) || []).length}箇所`)
{
  const ka = bg.match(/async function keepAlive\(\)[\s\S]*?\n\}/)[0]
  t(/zbaCredsBad === true \? 'creds' : 'auth'/.test(ka), 'ズバットの生存監視も creds を出し分ける')
  t(!/postStatus\(false, 'auth'\)/.test(ka), 'keepAlive に auth の直書きが残っていない')
}

// ===== ④ CRM画面（SiteAlert）=====
console.log('\n--- ④ CRM画面の表示 ---')
{
  const judgeSrc = alert.match(/function judge\(key, s\)[\s\S]*?\n\}/)[0]
  const offSrc0 = alert.match(/function inReloginOff\([^\n]*/)[0]
  const consts0 = alert.match(/const RELOGIN_OFF_FROM = \d+, RELOGIN_OFF_TO = \d+/)[0]
  const judge = new Function('LABEL', 'STALE_MS', `${consts0}\n${offSrc0}\n${judgeSrc}; return judge`)({ zba: 'ズバット' }, 10 * 60 * 1000)
  const now = new Date().toISOString()
  const r1 = judge('zba', { ok: false, reason: 'creds', at: now })
  t(/パスワード/.test(r1.why), '★「パスワードが違う」と分かる文言を出す', r1.why)
  t(r1.creds === true, 'creds フラグが立つ（追加案内の出し分けに使う）')
  const r2 = judge('zba', { ok: false, reason: 'auth', at: now })
  if (r2) t(!/パスワード/.test(r2.why) && r2.creds !== true, '通常のログイン切れとは文言を分ける', r2.why)
  else t(true, '通常のログイン切れ（今は夜間なので出さない判定）')
  const r3 = judge('zba', { ok: true, reason: '', at: now })
  t(r3 === null, '正常なら何も出さない')
}
t(/sa-creds/.test(alert) && /新しいパスワードを保存し直して/.test(alert), '画面に「新しいパスワードを保存し直す」手順を出す')
t(/s\.reason === 'auth' && inReloginOff\(\)/.test(alert), '★夜間（再ログイン休止中）のログイン切れは帯を出さない')
t(!/朝6時に自動で再開/.test(alert), '出番の無くなった夜間の注記は消してある')
t(/visibilityState/.test(alert), '表示中のタブだけ /api/status に問い合わせる（裏タブの無駄打ちを止める）')

// 夜間／昼間で judge の出方が変わるか（getHours を固定して実際に動かす）
{
  const judgeSrc = alert.match(/function judge\(key, s\)[\s\S]*?\n\}/)[0]
  const offSrc = alert.match(/function inReloginOff\([^\n]*/)[0]
  const consts = alert.match(/const RELOGIN_OFF_FROM = \d+, RELOGIN_OFF_TO = \d+/)[0]
  const at = new Date().toISOString()
  const mk = hour => {
    const D = class extends Date { getHours() { return hour } }
    return new Function('LABEL', 'STALE_MS', 'Date', `${consts}\n${offSrc}\n${judgeSrc}; return judge`)({ zba: 'ズバット' }, 10 * 60 * 1000, D)
  }
  for (const h of [22, 23, 0, 3, 5]) t(mk(h)('zba', { ok: false, reason: 'auth', at }) === null, `${h}時：ログイン切れは出さない（朝6時に自動で直る）`)
  for (const h of [6, 12, 21]) t(mk(h)('zba', { ok: false, reason: 'auth', at }) !== null, `${h}時：ログイン切れは出す`)
  t(mk(23)('zba', { ok: false, reason: 'creds', at }) !== null, '★夜でもパスワード違いは出す（朝6時になっても直らない）')
  t(mk(23)('zba', { ok: false, reason: 'error', at }) !== null, '★夜でも取得エラーは出す（再ログイン休止とは無関係）')
  const old = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  t(mk(23)('zba', { ok: true, reason: '', at: old }) !== null, '★夜でもハートビート途絶は出す（巡回PCが止まっている）')
}

// ===== ⑤ 拡張ポップアップ（復旧の入口）=====
console.log('\n--- ⑤ ポップアップ ---')
t(/CREDS_BAD_MSG/.test(popup), 'ポップアップにも「パスワードが違う」案内がある')
t((popup.match(/CREDS_BAD_MSG\)/g) || []).length === 2, '3サイトぶん表示する（ズバット＋共通関数）', `${(popup.match(/CREDS_BAD_MSG\)/g) || []).length}箇所`)
t(/zbaCredsBad: false \}\)/.test(popup), 'ズバット：保存し直したら解除する')
t(/\[cfg\.credsBadKey\]: false/.test(popup), '価格.com／引越し侍：保存し直したら解除する')
{
  const test = popup.slice(popup.indexOf("getElementById('zbaTest')"))
  const body = test.slice(0, test.indexOf('\n})'))
  t(!/if \(r\.ok\)/.test(body), '★テストボタンが HTTPステータス頼みでなくなっている')
  t(/v\.state === 'ok'/.test(body), '★実際にログインできたかで判定する')
  t(/zbaCredsBad: true/.test(body), 'テストで弾かれたら「パスワード違い」を記録する')
  t(/zbaCredsBad: false/.test(body), 'テストで通れば解除する')
  t(!/CSRF取得失敗/.test(body), '完全ログアウト状態でもテストできる（CSRF空で諦めない）')
}

// ===== ⑥ 価格.com／引越し侍の「今すぐログインを試す」 =====
console.log('\n--- ⑥ 価格.com／引越し侍のログイン確認ボタン ---')
const html = fs.readFileSync(new URL('../extension/popup.html', import.meta.url).pathname, 'utf8')
{
  // 入口が「それぞれのループの中」にあること（片方に2つ入っていると引越し侍が動かない）
  const iKakakuLoop = bg.indexOf('function kakakuLoop(')
  const iSamuraiLoop = bg.indexOf('function samuraiLoop(')
  const iKakakuTest = bg.indexOf('window.__tfKakakuLoginTest')
  const iSamuraiTest = bg.indexOf('window.__tfSamuraiLoginTest')
  t(iKakakuTest > iKakakuLoop && iKakakuTest < iSamuraiLoop, '価格.comの入口は価格.comのループ内にある')
  t(iSamuraiTest > iSamuraiLoop, '引越し侍の入口は引越し侍のループ内にある')

  for (const [label, site, cap] of [['価格.com', 'kakaku', 'Kakaku'], ['引越し侍', 'samurai', 'Samurai']]) {
    // relogin 全体（夜間ゲートは関数の先頭にあるので、そこから切り出す）
    const loopAt = bg.indexOf(`function ${site}Loop(`)
    const rlAt = bg.indexOf('async function relogin(loginDoc, manual)', loopAt)
    const body = bg.slice(rlAt, bg.indexOf(`${site}ReloginReason: 'fetch-error'`, rlAt))
    // 人の操作のときだけゲートを外す
    for (const [gate, why] of [
      ['\\[22, 23, 0, 1, 2, 3, 4, 5\\]', '夜間休止'],
      [`st\\.${site}ReloginBlocked`, '停止中'],
      [`st\\.${site}ReloginLastAt`, '5分間隔'],
      [`\\(st\\.${site}ReloginTries \\|\\| 0\\) >= MAX_TRIES`, '試行上限'],
    ]) t(new RegExp(`!manual && ${gate}`).test(body), `${label}：${why}は手動テストでは通さない`)
    t(/async function relogin\(loginDoc, manual\)/.test(body) || /relogin\(loginDoc, manual\)/.test(bg), `${label}：relogin が手動フラグを受け取る`)

    // 入口が巡回と同じ relogin を呼んでいる（テスト用の別実装を作っていない）
    const entry = bg.slice(bg.indexOf(`window.__tf${cap}LoginTest`))
    const eb = entry.slice(0, entry.indexOf('\n  }\n'))
    t(/await relogin\(doc, true\)/.test(eb), `${label}：★巡回と同じ relogin をそのまま使う（二重実装しない）`)
    t(/input\[type="password"\]/.test(eb) && /'already'/.test(eb), `${label}：ログイン中は already を返す（嘘の合格を出さない）`)
  }
  t(/ENSURE_LOOPS/.test(bg), 'ポップアップから即座にループを注入できる（1分待たない）')
}

// 実際に動かす：3つの状態が正しく返るか
{
  const entry = bg.slice(bg.indexOf('window.__tfKakakuLoginTest'))
  const src = entry.slice(0, entry.indexOf('\n  }\n') + 4)
  const run = async (hasPwField, reloginResult) => {
    const win = {}
    new Function('window', 'fetchDoc', 'LIST', 'relogin', src)(
      win,
      async () => ({ querySelector: () => (hasPwField ? {} : null) }),
      '/list',
      async () => { if (reloginResult === 'throw') throw new Error('boom'); return reloginResult })
    return await win.__tfKakakuLoginTest()
  }
  t((await run(true, true)).state === 'ok', 'ログアウト中＋ログイン成功 → ok')
  t((await run(true, false)).state === 'ng', '★ログアウト中＋ログイン失敗 → ng（ID/PWを疑える）')
  t((await run(false, true)).state === 'already', 'ログイン中 → already（保存中のID/PWは試していない、と正直に返す）')
  t((await run(true, 'throw')).state === 'error', '通信エラー → error（失敗と混同しない）')
}

// ポップアップ側
{
  t(/id="samuraiTest"/.test(html) && /id="kakakuTest"/.test(html), '3サイトともボタンがある')
  t(/testBtn: 'samuraiTest'/.test(popup) && /testBtn: 'kakakuTest'/.test(popup), '2サイトぶん配線されている')
  t(/winKey: '__tfSamuraiLoginTest'/.test(popup) && /winKey: '__tfKakakuLoginTest'/.test(popup), '呼ぶ入口の名前が一致している')
  t(/TEST_COOLDOWN_MS/.test(popup), '★連打防止がある（連打すると試行回数が増えてロックの危険）')
  t((popup.match(/TEST_COOLDOWN_MS\)/g) || []).length === 2, '3サイトのボタンすべてに効く（ズバット＋共通関数）', `${(popup.match(/TEST_COOLDOWN_MS\)/g) || []).length}箇所`)
  const blk = popup.slice(popup.indexOf('const testEl'))
  t(/state === 'already'/.test(blk) && /state === 'ng'/.test(blk) && /state === 'error'/.test(blk) && /巡回が動いていません/.test(blk), '4状態すべてに表示がある（成功・失敗・ログイン中・確認不能＋ループ未起動）')
}

console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
