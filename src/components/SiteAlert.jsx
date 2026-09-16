// 巡回が止まったことを画面上部で知らせる帯。
//
// ねらい：ログイン切れや巡回停止に「ふとした時」まで気づけないと、その間の
// リードを丸ごと取り逃す（2026-09にズバットのパスワード変更で発生）。
// このCRMは日中ずっと誰かが開いているので、画面に出すのが一番早く気づける。
//
// 出す条件は2つ。どちらかに当てはまるサイトがあるときだけ表示する。
//   ① 拡張が「ログイン切れ／エラー」を報告している（ok:false）
//   ② 一定時間ハートビートが届いていない（＝巡回PCが落ちている・Chromeが閉じている等）
// ②があるので、拡張が何も報告できない状態でも気づける。
import { useEffect, useState } from 'react'

const POLL_MS = 60 * 1000       // 1分ごとに確認（巡回側は12〜50秒間隔なので十分）
const STALE_MS = 10 * 60 * 1000 // 10分以上ハートビートが無ければ「止まっている」
                                // ※深夜は巡回が120秒間隔まで落ちるので、それより十分長くとる
const LABEL = { zba: 'ズバット', samurai: '引越し侍', kakaku: '価格.com' }
const SITES = ['zba', 'samurai', 'kakaku']

// 1サイトの状態を「止まっているか」に畳む
function judge(key, s) {
  const name = LABEL[key] || key
  if (!s || !s.at) return { key, name, why: 'ハートビートが一度も届いていません' }
  const ms = Date.parse(s.at)
  const age = isNaN(ms) ? Infinity : Date.now() - ms
  if (age > STALE_MS) {
    const min = Math.floor(age / 60000)
    return { key, name, why: `${min >= 60 ? Math.floor(min / 60) + '時間' : min + '分'}前から巡回が止まっています`, at: ms }
  }
  if (s.ok === false) {
    // 'creds' は「保存しているID/PWがサイトに拒否された」＝パスワードが変更された可能性。
    // セッション切れ（待てば自動で戻る）と違い、人が保存し直すまで絶対に直らないので分けて出す。
    const why = s.reason === 'creds' ? 'IDまたはパスワードが違います（サイト側で変更された可能性）'
              : s.reason === 'auth' ? 'ログインが切れています（手動でログインし直してください）'
              : s.reason === 'error' ? '取得に失敗しています'
              : '異常を報告しています'
    return { key, name, why, at: ms, creds: s.reason === 'creds' }
  }
  return null
}

export default function SiteAlert({ isDemo }) {
  const [down, setDown] = useState([])

  useEffect(() => {
    if (isDemo) return
    let alive = true
    let timer = null
    const check = async () => {
      try {
        const d = await fetch('/api/status').then(r => r.json())
        if (!alive) return
        const st = d.statuses || {}
        setDown(SITES.map(k => judge(k, st[k])).filter(Boolean))
      } catch {
        // サーバに繋がらないときは何も出さない。
        // 一時的な通信断で「止まっています」と誤って出すほうが害が大きい。
      }
    }
    check()
    timer = setInterval(check, POLL_MS)
    return () => { alive = false; if (timer) clearInterval(timer) }
  }, [isDemo])

  if (!down.length) return null   // 正常なときは何も出さない

  const hhmm = (ms) => {
    if (!ms) return ''
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return (
    <div className="site-alert" role="alert">
      <span className="sa-icon">⚠</span>
      <div className="sa-body">
        <div className="sa-head">
          {down.some(d => d.creds) ? 'ログインできずリードの取り込みが止まっています' : 'リードの取り込みが止まっています'}
          （{down.map(d => d.name).join('・')}）
        </div>
        {down.map(d => (
          <div key={d.key} className="sa-line">
            <b>{d.name}</b>：{d.why}
            {d.at ? <span className="sa-at">（最終 {hhmm(d.at)}）</span> : null}
          </div>
        ))}
        <div className="sa-note">
          この間に届いたリードは取り込まれません。巡回PCのChromeと拡張機能を確認してください。
        </div>
        {down.some(d => d.creds) && (
          <div className="sa-note sa-creds">
            パスワードが変更されている可能性があります。巡回PCのChrome右上の拡張機能アイコンを開き、
            該当サイトに<b>新しいパスワードを保存し直して</b>ください。保存するだけで巡回は自動で再開します。
          </div>
        )}
      </div>
    </div>
  )
}
