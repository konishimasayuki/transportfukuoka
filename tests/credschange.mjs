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
  const judge = new Function('LABEL', 'STALE_MS', `${judgeSrc}; return judge`)({ zba: 'ズバット' }, 10 * 60 * 1000)
  const now = new Date().toISOString()
  const r1 = judge('zba', { ok: false, reason: 'creds', at: now })
  t(/パスワード/.test(r1.why), '★「パスワードが違う」と分かる文言を出す', r1.why)
  t(r1.creds === true, 'creds フラグが立つ（追加案内の出し分けに使う）')
  const r2 = judge('zba', { ok: false, reason: 'auth', at: now })
  t(!/パスワード/.test(r2.why) && r2.creds !== true, '通常のログイン切れとは文言を分ける', r2.why)
  const r3 = judge('zba', { ok: true, reason: '', at: now })
  t(r3 === null, '正常なら何も出さない')
}
t(/sa-creds/.test(alert) && /新しいパスワードを保存し直して/.test(alert), '画面に「新しいパスワードを保存し直す」手順を出す')

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

console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
