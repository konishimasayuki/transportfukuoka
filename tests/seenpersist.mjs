// 価格.com／引越し侍の「取込済み(seen)」を chrome.storage に保存する処理を、
// 実コードを抜き出して動かして検証する。
// 目的：タブを再読込しても当日ぶんを再送しない（＝取得元サイトへ詳細ページを取り直さない）。
import fs from 'fs'
let ng = 0, ok = 0
const t = (c, m, d = '') => { c ? (ok++, console.log('✅ ' + m + (d ? ' — ' + d : ''))) : (ng++, console.log('❌ ' + m + (d ? ' — ' + d : ''))) }

const bg = fs.readFileSync(new URL('../extension/background.js', import.meta.url).pathname, 'utf8')

// 対象サイトごとに「保存ブロック」を抜き出し、スタブを刺して実行できる形にする
function build(site, winSeen, winFailed) {
  const src = bg.match(new RegExp(`  const SEEN_KEY = '${site}SeenKeys'[\\s\\S]*?async function restoreSeen\\(\\)[\\s\\S]*?\\n  \\}`))[0]
  return (store, seenInit = [], failedInit = []) => {
    const seen = new Set(seenInit)
    const failed = new Map(failedInit)
    const win = {}
    // setTimeout をスタブして、5秒待たずに保存処理を走らせる
    const fns = new Function('seen', 'failed', 'chrome', 'window', 'setTimeout', `${src}
      return { persist, restoreSeen, gaveUp, dayKey }`)(
      seen, failed,
      { storage: { local: {
        get: async keys => { const o = {}; for (const k of keys) if (k in store) o[k] = store[k]; return o },
        set: p => { Object.assign(store, JSON.parse(JSON.stringify(p))) },
      } } },
      win,
      fn => { fn(); return 1 },
    )
    return { ...fns, seen, failed, win }
  }
}

const today = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') })()

for (const [label, site, winSeen, winFailed] of [
  ['価格.com', 'kakaku', '__tfKakakuSeen', '__tfKakakuFailed'],
  ['引越し侍', 'samurai', '__tfSamuraiSeen', '__tfSamuraiFailed'],
]) {
  console.log(`\n--- ${label} ---`)
  const mk = build(site, winSeen, winFailed)
  const SEEN_KEY = site + 'SeenKeys', FAILED_KEY = site + 'FailedKeys'

  // 保存：当日の日付つきで書かれる
  {
    const store = {}
    const a = mk(store, ['101', '102'], [['900', 3]])
    a.persist()
    t(store[SEEN_KEY] && store[SEEN_KEY].day === today, '保存に当日の日付が付く', JSON.stringify(store[SEEN_KEY]?.day))
    t(JSON.stringify(store[SEEN_KEY].ids) === '["101","102"]', '取込済みidが保存される', JSON.stringify(store[SEEN_KEY].ids))
    t(JSON.stringify(store[FAILED_KEY]) === '[["900",3]]', '再送待ちは [id,試行回数] で保存される', JSON.stringify(store[FAILED_KEY]))
    t(a.win[winSeen] !== undefined, 'window 側の従来の受け渡しも残っている（ページ内の挙動は不変）')
  }

  // 復元：同じ日なら引き継ぐ
  {
    const store = { [SEEN_KEY]: { day: today, ids: ['101', '102'] }, [FAILED_KEY]: [['900', 3]] }
    const b = mk(store)
    await b.restoreSeen()
    t(b.seen.has('101') && b.seen.has('102'), '同じ日の取込済みは引き継ぐ（再読込しても再送しない）', `${b.seen.size}件`)
    t(b.failed.get('900') === 3, '再送待ちと試行回数も引き継ぐ', String(b.failed.get('900')))
  }

  // 復元：日付が変わったら seen は捨てる（failed は残す）
  {
    const store = { [SEEN_KEY]: { day: '2000-01-01', ids: ['101'] }, [FAILED_KEY]: [['900', 3]] }
    const c = mk(store)
    await c.restoreSeen()
    t(c.seen.size === 0, '前日の取込済みは引き継がない（無限に溜まらない）', `${c.seen.size}件`)
    t(c.failed.get('900') === 3, '★再送待ちは日付をまたいでも残す（0時またぎの取りこぼし防止）', String(c.failed.get('900')))
  }

  // 諦めたidは保存しない（再読込で再送を試せる逃げ道を残す）
  {
    const store = {}
    const d = mk(store, ['101', '777'])
    d.gaveUp.add('777')
    d.persist()
    t(!store[SEEN_KEY].ids.includes('777'), '★再送上限で諦めたidは保存しない（再読込すればもう一度送れる）', JSON.stringify(store[SEEN_KEY].ids))
    t(store[SEEN_KEY].ids.includes('101'), '正常に送れたidは保存する')
  }

  // 壊れた保存データ・storage不調でも落ちない
  {
    const e = mk({ [SEEN_KEY]: 'こわれている', [FAILED_KEY]: 'こわれている' })
    let threw = false
    try { await e.restoreSeen() } catch { threw = true }
    t(!threw && e.seen.size === 0, '保存データが壊れていても落ちない')
    const f = build(site, winSeen, winFailed)({})
    f.restoreSeen = null
    const g = new Function('seen', 'failed', 'chrome', 'window', 'setTimeout',
      `${bg.match(new RegExp(`  const SEEN_KEY = '${site}SeenKeys'[\\s\\S]*?async function restoreSeen\\(\\)[\\s\\S]*?\\n  \\}`))[0]}
       return { persist, restoreSeen }`)(
      new Set(['1']), new Map(),
      { storage: { local: { get: async () => { throw new Error('boom') }, set: () => { throw new Error('boom') } } } },
      {}, fn => { fn(); return 1 })
    let threw2 = false
    try { g.persist(); await g.restoreSeen() } catch { threw2 = true }
    t(!threw2, 'storageが使えなくても巡回は止まらない')
  }
}

// 起動時に復元してから巡回を始めているか（構造チェック）
console.log('\n--- 起動順序 ---')
t((bg.match(/restoreSeen\(\)\.then\(tick, tick\)/g) || []).length === 2, '2サイトとも「復元してから tick」になっている')
t(!/\n  tick\(\)\n\}/.test(bg), '復元前に tick を呼ぶ箇所が残っていない')

// ズバットは従来から永続化済み（3サイト揃ったことの確認）
const zba = fs.readFileSync(new URL('../extension/content.js', import.meta.url).pathname, 'utf8')
t(/seenKeys/.test(zba), 'ズバットは従来どおり seenKeys で永続化（3サイト揃った）')

console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
