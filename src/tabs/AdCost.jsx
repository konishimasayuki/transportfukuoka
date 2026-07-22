// 広告費タブ
// - スプレッドシートのように「1日〜末日」を全行表示（月切替可）
// - 日別項目：サムライ単身 / サムライ家族 / 価格 / ズバッと（+ 日合計）
// - 月別項目：SUUMO / チラシ / 企業紹介・その他
// - 掲載費(/api/expenses) に保存（売上管理とデータ共有）。一括貼り付け対応。
import { useEffect, useMemo, useState } from 'react'
// 広告費（反響課金）自動算出の単価・集計ロジックは src/lib/adcost.js に集約（売上管理と共有）
import { SAMURAI_SINGLE_UNIT, SAMURAI_FAMILY_UNIT, KAKAKU_UNIT, ZUBATTO_UNIT, AD_AUTO_FROM, AD_KEYS, AD_UNIT, adCountsByMonthDay } from '../lib/adcost'
import { DEMO_LEADS } from '../lib/demoData'
const AUTO_KEYS = AD_KEYS
const AUTO_UNIT = AD_UNIT
const AUTO_FROM = AD_AUTO_FROM

function monthOptions() {
  const opts = []
  const d = new Date()
  for (let i = 0; i < 12; i++) {
    const y = d.getFullYear(), m = d.getMonth() + 1
    opts.push({ key: `${y}-${String(m).padStart(2, '0')}`, label: `${y}年${m}月` })
    d.setMonth(d.getMonth() - 1)
  }
  return opts
}
const yen = (n) => '¥' + Math.round(Number(n) || 0).toLocaleString('ja-JP')
const num = (v) => Number(v) || 0
function daysInMonthOf(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

// 保存・自動算出は単身/家族/価格/ズバッとの4キーのまま（単価が異なるため内部では分離）。
const DAILY_FIELDS = [
  { key: 'samurai_single', label: 'サムライ単身' },
  { key: 'samurai_family', label: 'サムライ家族' },
  { key: 'kakaku',         label: '価格.com' },
  { key: 'zubatto',        label: 'ズバッと' },
]
// 画面表示・入力の3列（引越し侍＝サムライ単身+家族を合算表示）。表示順：引越し侍→ズバッと→価格.com
const DISPLAY_FIELDS = [
  { key: 'samurai', label: '引越し侍', parts: ['samurai_single', 'samurai_family'], inputKey: 'samurai_single' },
  { key: 'zubatto', label: 'ズバッと', parts: ['zubatto'], inputKey: 'zubatto' },
  { key: 'kakaku',  label: '価格.com', parts: ['kakaku'],  inputKey: 'kakaku' },
]
const MONTHLY_FIELDS = [
  { key: 'suumo',    label: 'SUUMO' },
  { key: 'chirashi', label: 'チラシ' },
  { key: 'other',    label: '企業紹介・その他' },
]

// "6/1\t17875\t18700\t3500\t3300\t43375" のような行を解析して { '01': {…}, … } を返す
function parseBulkExpenses(text) {
  const out = {}
  text.split(/\r?\n/).forEach(line => {
    if (!line.trim()) return
    const cells = line.replace(/,(?=\d{3}(\D|$))/g, '').split(/\t|,|\s+/).filter(s => s !== '')
    if (cells.length < 5) return
    const dm = String(cells[0]).match(/(\d{1,2})$/)
    if (!dm) return
    const day = String(parseInt(dm[1], 10)).padStart(2, '0')
    out[day] = {
      samurai_single: num(cells[1]),
      samurai_family: num(cells[2]),
      kakaku:         num(cells[3]),
      zubatto:        num(cells[4]),
    }
  })
  return out
}

export default function AdCost({ user }) {
  const isDemo = user?.mode === 'demo'
  const months = useMemo(monthOptions, [])
  const [selMonth, setSelMonth] = useState(months[0].key)
  const [expenses, setExpenses] = useState({})
  const [leads, setLeads]       = useState(isDemo ? DEMO_LEADS : []) // 引越し侍の広告費 自動算出用
  const [loading, setLoading]   = useState(!isDemo)
  const [saving, setSaving]     = useState(false)
  const [draftExp, setDraftExp] = useState({ daily: {}, monthly: {}, note: '' })
  const [bulkPaste, setBulkPaste] = useState('')
  const [toast, setToast] = useState('')
  const [activeBar, setActiveBar] = useState(null) // グラフでタップ/クリックした棒の日（吹き出し表示）
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2200) }

  useEffect(() => { if (!isDemo) fetchAll() }, [isDemo])
  useEffect(() => { setActiveBar(null) }, [selMonth]) // 月を切り替えたら吹き出しを閉じる

  useEffect(() => {
    const ex = expenses[selMonth] || {}
    setDraftExp({
      daily: ex.daily ? JSON.parse(JSON.stringify(ex.daily)) : {},
      monthly: ex.monthly ? { ...ex.monthly } : {},
      note: ex.note || '',
    })
    setBulkPaste('')
  }, [selMonth, expenses])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [eRes, lRes] = await Promise.all([
        fetch('/api/expenses').then(r => r.json()).catch(() => ({ data: {} })),
        fetch('/api/inbound').then(r => r.json()).catch(() => ({ items: [] })),
      ])
      setExpenses(eRes.data || {})
      setLeads(lRes.items || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  // リードを「受付日(YYYY-MM → DD)」でサイト別に集計（共通ロジック）
  const autoByMonthDay = useMemo(() => adCountsByMonthDay(leads), [leads])

  // この月は自動算出するか（デモ以外・2026-07以降）
  // 対象月(2026-07以降)は自動算出。デモも表示は自動算出（保存はデモでは無効=saveExpensesでガード）。
  const isAutoMonth = selMonth >= AUTO_FROM
  // 指定日の自動算出額と件数。自動対象外なら null。単身/家族は別々に保持。
  const autoDaily = (day) => {
    if (!isAutoMonth) return null
    const c = (autoByMonthDay[selMonth] || {})[day] || { single: 0, family: 0, kakaku: 0, zubatto: 0 }
    return {
      counts: { samurai_single: c.single, samurai_family: c.family, kakaku: c.kakaku, zubatto: c.zubatto },
      samurai_single: c.single * SAMURAI_SINGLE_UNIT,
      samurai_family: c.family * SAMURAI_FAMILY_UNIT,
      kakaku: c.kakaku * KAKAKU_UNIT,
      zubatto: c.zubatto * ZUBATTO_UNIT,
    }
  }
  // 指定日の各項目の実値（自動月は全列自動、それ以外は手動入力）
  const dayVals = (day) => {
    const row = (draftExp.daily || {})[day] || {}
    const auto = autoDaily(day)
    return {
      samurai_single: auto ? auto.samurai_single : num(row.samurai_single),
      samurai_family: auto ? auto.samurai_family : num(row.samurai_family),
      kakaku: auto ? auto.kakaku : num(row.kakaku),
      zubatto: auto ? auto.zubatto : num(row.zubatto),
      auto,
    }
  }

  const sums = useMemo(() => {
    const days = daysInMonthOf(selMonth)
    const byKey = { samurai_single: 0, samurai_family: 0, kakaku: 0, zubatto: 0 }
    let dailyGrand = 0
    for (let i = 1; i <= days; i++) {
      const v = dayVals(String(i).padStart(2, '0'))
      DAILY_FIELDS.forEach(f => { byKey[f.key] += v[f.key]; dailyGrand += v[f.key] })
    }
    let monthlyTotal = 0
    MONTHLY_FIELDS.forEach(f => { monthlyTotal += num(draftExp.monthly?.[f.key]) })
    return { byKey, dailyGrand, monthlyTotal, grand: dailyGrand + monthlyTotal }
  }, [draftExp, selMonth, autoByMonthDay, isDemo])

  // 表示グループ（引越し侍=単身+家族）ごとの金額・件数。自動月は件数付き（count!=null）。
  const groupVal = (day) => {
    const v = dayVals(day)
    return {
      samurai: { amount: v.samurai_single + v.samurai_family, count: v.auto ? (v.auto.counts.samurai_single + v.auto.counts.samurai_family) : null },
      zubatto: { amount: v.zubatto, count: v.auto ? v.auto.counts.zubatto : null },
      kakaku:  { amount: v.kakaku,  count: v.auto ? v.auto.counts.kakaku : null },
      auto: v.auto,
    }
  }
  // 表示グループごとの月合計（KPI・フッター用）。内部4キーの合算。
  const groupSums = { samurai: sums.byKey.samurai_single + sums.byKey.samurai_family, zubatto: sums.byKey.zubatto, kakaku: sums.byKey.kakaku }

  const setDaily = (day, key, value) => {
    setDraftExp(p => ({ ...p, daily: { ...p.daily, [day]: { ...(p.daily[day] || {}), [key]: value } } }))
  }
  // 手動月の「引越し侍」入力：合算値を単身キーに保存し家族は0に（表示＝入力を一致させる）
  const setSamurai = (day, value) => {
    setDraftExp(p => ({ ...p, daily: { ...p.daily, [day]: { ...(p.daily[day] || {}), samurai_single: value, samurai_family: 0 } } }))
  }
  const setMonthly = (key, value) => {
    setDraftExp(p => ({ ...p, monthly: { ...p.monthly, [key]: value } }))
  }
  const applyBulk = () => {
    const parsed = parseBulkExpenses(bulkPaste)
    if (Object.keys(parsed).length === 0) { showToast('解析できませんでした'); return }
    setDraftExp(p => ({ ...p, daily: { ...p.daily, ...parsed } }))
    setBulkPaste('')
    showToast(`${Object.keys(parsed).length}日分を取り込みました（未保存）`)
  }
  const clearAllDaily = () => {
    if (!confirm(`${selMonth} の日別データをクリアしますか？（保存していなければ元に戻ります）`)) return
    setDraftExp(p => ({ ...p, daily: {} }))
  }

  const saveExpenses = async () => {
    if (isDemo) { showToast('デモモード：保存は無効です'); return }
    setSaving(true)
    try {
      const dailyClean = {}
      const dcount = daysInMonthOf(selMonth)
      for (let i = 1; i <= dcount; i++) {
        const day = String(i).padStart(2, '0')
        const v = dayVals(day) // 引越し侍は自動算出値を保存（他タブの広告費に反映）
        const has = DAILY_FIELDS.some(f => v[f.key] > 0)
        if (has) {
          const r = {}
          DAILY_FIELDS.forEach(f => { r[f.key] = v[f.key] })
          dailyClean[day] = r
        }
      }
      const monthlyClean = {}
      MONTHLY_FIELDS.forEach(f => { monthlyClean[f.key] = num(draftExp.monthly?.[f.key]) })
      await fetch('/api/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selMonth, values: { daily: dailyClean, monthly: monthlyClean, note: draftExp.note || '' } }),
      })
      await fetchAll()
      showToast('保存しました')
    } catch (e) { console.error(e); showToast('保存に失敗しました') }
    setSaving(false)
  }

  const monthLabel = months.find(m => m.key === selMonth)?.label || ''
  const days = daysInMonthOf(selMonth)
  const dailyRows = Array.from({ length: days }, (_, i) => String(i + 1).padStart(2, '0'))

  const todayDate = new Date()
  const isCurrentMonth = selMonth === `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}`
  const todayDD = isCurrentMonth ? String(todayDate.getDate()).padStart(2, '0') : null
  // 日別テーブルは常に全日（1日〜末日）を表示（折りたたみなし）。
  const rowsToShow = dailyRows

  const inputCell = { width: 92, padding: '5px 6px', border: '1px solid #E2E8F0', borderRadius: 4, fontSize: 12, fontFamily: 'inherit', outline: 'none', textAlign: 'right' }
  const cellTd = { padding: '4px 6px', borderBottom: '1px solid #F1F5F9' }
  const thCell = { ...cellTd, textAlign: 'right', fontSize: 11, padding: '7px 8px', background: '#F1F5FB', color: '#475569' }

  return (
    <div>
      <div className="page-hdr"><h1>広告費</h1></div>

      <div className="filter-row">
        <select value={selMonth} onChange={e => setSelMonth(e.target.value)}>
          {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        {!isDemo && <button className="btn btn-outline btn-sm" onClick={fetchAll} disabled={loading}>⟳ 再読込</button>}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>読み込み中...</div>
      ) : (
        <>
          {/* KPI（当月の掲載費サマリー） */}
          <div className="kpi-row kpi-4">
            <div className="kpi-card c-blue">
              <div className="kpi-label">{monthLabel} 掲載費合計</div>
              <div className="kpi-val">{yen(sums.grand)}</div>
              <div className="kpi-change">日別 {yen(sums.dailyGrand)} ＋ 月別 {yen(sums.monthlyTotal)}</div>
            </div>
            {DISPLAY_FIELDS.map((f, i) => (
              <div key={f.key} className={`kpi-card ${['c-teal', 'c-orange', 'c-green'][i]}`}>
                <div className="kpi-label">{f.label}</div>
                <div className="kpi-val">{yen(groupSums[f.key])}</div>
              </div>
            ))}
          </div>

          {/* 今月の掲載費グラフ（掲載費のある日が2日以上のときのみ表示） */}
          {(() => {
            const totals = dailyRows.map(day => { const v = dayVals(day); return { day, v: DAILY_FIELDS.reduce((s, f) => s + v[f.key], 0) } })
            const daysWithData = totals.filter(t => t.v > 0).length
            if (daysWithData < 2) return null // 2日以上データが揃うまでグラフは非表示
            const max = Math.max(1, ...totals.map(t => t.v))
            const H = 160 // グラフ高さ(px)
            const STEP = 10000 // 1万円ごとの横線
            const roundedMax = Math.max(STEP, Math.ceil(max / STEP) * STEP) // 上端は1万円単位に切り上げ
            const levels = Array.from({ length: roundedMax / STEP }, (_, i) => (i + 1) * STEP) // 1万,2万,…
            return (
              <div className="card">
                <div className="card-head"><h3>今月の掲載費（日別合計）</h3><span className="c-sub">{monthLabel} 合計 {yen(sums.dailyGrand)}</span></div>
                <div className="card-body">
                  <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
                    <div style={{ minWidth: totals.length * 24, position: 'relative' }}>
                      {/* 棒＋横線エリア */}
                      <div style={{ position: 'relative', height: H }}>
                        {/* 1万円ごとの横線 */}
                        {levels.map(level => (
                          <div key={level} style={{ position: 'absolute', left: 0, right: 0, bottom: (level / roundedMax) * H, borderTop: '1px dashed #E2E8F0' }}>
                            <span style={{ position: 'absolute', left: 0, top: -9, fontSize: 8, color: '#94A3B8', background: '#fff', padding: '0 3px', fontWeight: 700 }}>{level / STEP}万</span>
                          </div>
                        ))}
                        {/* 棒（タップ/クリックで金額を吹き出し表示） */}
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                          {totals.map(t => {
                            const barH = (t.v / roundedMax) * H
                            const isToday = t.day === todayDD
                            const active = activeBar === t.day
                            return (
                              <div key={t.day}
                                onClick={() => t.v > 0 && setActiveBar(active ? null : t.day)}
                                style={{ flex: '1 0 22px', minWidth: 22, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', cursor: t.v > 0 ? 'pointer' : 'default' }}
                                title={`${Number(t.day)}日：${yen(t.v)}`}>
                                <div style={{ width: '80%', height: barH, minHeight: t.v > 0 ? 4 : 0, background: active ? '#1E5FA8' : isToday ? '#1E5FA8' : '#93C5FD', borderRadius: '3px 3px 0 0', position: 'relative' }}>
                                  {/* 金額の吹き出し（タップ/クリックした棒のみ） */}
                                  {active && t.v > 0 && (
                                    <div style={{
                                      position: 'absolute', left: '50%', bottom: '100%', transform: 'translateX(-50%)', marginBottom: 7,
                                      background: '#0F2A4A', color: '#fff', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap',
                                      padding: '5px 9px', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,.28)', zIndex: 5, pointerEvents: 'none',
                                    }}>
                                      {Number(t.day)}日 {yen(t.v)}
                                      <span style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid #0F2A4A' }} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      {/* 日ラベル */}
                      <div style={{ display: 'flex', gap: 2, marginTop: 3 }}>
                        {totals.map(t => (
                          <div key={t.day} style={{ flex: '1 0 18px', minWidth: 18, textAlign: 'center', fontSize: 8, color: t.day === todayDD ? '#1E5FA8' : '#94A3B8', fontWeight: t.day === todayDD ? 800 : 400 }}>{Number(t.day)}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* 掲載費（日別）：1日〜末日を常に全日表示（折りたたみなし） */}
          <div className="card">
            <div className="card-head">
              <h3>掲載費（日別）</h3>
              <span className="c-sub">{monthLabel} 全{days}日</span>
            </div>
            <div className="card-body">
              <div className="scroll-x">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 580 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thCell, textAlign: 'left' }}>日付</th>
                      {DISPLAY_FIELDS.map(f => <th key={f.key} style={thCell}>{f.label}</th>)}
                      <th style={thCell}>日合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsToShow.map(day => {
                      const row = draftExp.daily[day] || {}
                      const v = dayVals(day)
                      const grp = groupVal(day)
                      const rowTotal = DAILY_FIELDS.reduce((s, f) => s + v[f.key], 0)
                      const isToday = day === todayDD
                      return (
                        <tr key={day} style={isToday ? { background: '#EFF6FF' } : undefined}>
                          <td style={{ ...cellTd, fontWeight: isToday ? 800 : 400, color: isToday ? '#1E5FA8' : '#1E293B', whiteSpace: 'nowrap' }}>
                            {Number(day)}日{isToday ? ' （今日）' : ''}
                          </td>
                          {DISPLAY_FIELDS.map(f => {
                            const g = grp[f.key]
                            // 自動算出：読み取り専用で件数も表示（引越し侍は単身+家族の合算）
                            if (grp.auto) {
                              return (
                                <td key={f.key} style={{ ...cellTd, textAlign: 'right' }} title={g.count != null ? `${g.count}件` : ''}>
                                  <div style={{ color: g.amount > 0 ? '#334155' : '#CBD5E1', fontWeight: 600 }}>{g.amount > 0 ? yen(g.amount) : '—'}</div>
                                  {g.count > 0 && <div style={{ fontSize: 9, color: '#94A3B8' }}>{g.count}件</div>}
                                </td>
                              )
                            }
                            // 手動入力：引越し侍は合算値を単身キーへ保存、他は各キーへ
                            const inputVal = f.key === 'samurai' ? ((num(row.samurai_single) + num(row.samurai_family)) || '') : (row[f.inputKey] ?? '')
                            return (
                              <td key={f.key} style={{ ...cellTd, textAlign: 'right' }}>
                                <input type="number" min={0} inputMode="numeric"
                                  value={inputVal}
                                  onChange={e => f.key === 'samurai' ? setSamurai(day, e.target.value) : setDaily(day, f.inputKey, e.target.value)}
                                  style={inputCell} />
                              </td>
                            )
                          })}
                          <td style={{ ...cellTd, textAlign: 'right', fontWeight: 700, color: rowTotal > 0 ? '#1E5FA8' : '#CBD5E1' }}>
                            {rowTotal > 0 ? yen(rowTotal) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#F1F5FB', color: '#1E5FA8', fontWeight: 800, borderTop: '2px solid #1E5FA8' }}>
                      <td style={{ ...cellTd, padding: '8px' }}>合計（月）</td>
                      {DISPLAY_FIELDS.map(f => (
                        <td key={f.key} style={{ ...cellTd, padding: '8px', textAlign: 'right' }}>{yen(groupSums[f.key])}</td>
                      ))}
                      <td style={{ ...cellTd, padding: '8px', textAlign: 'right' }}>{yen(sums.dailyGrand)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: '#64748B', marginRight: 6 }}>{monthLabel} 掲載費 合計（ドラフト）</span>
                  <b style={{ fontSize: 16 }}>{yen(sums.grand)}</b>
                  <span style={{ color: '#94A3B8', fontSize: 11, marginLeft: 6 }}>（日別 {yen(sums.dailyGrand)} + 月別 {yen(sums.monthlyTotal)}）</span>
                </div>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary btn-sm" onClick={saveExpenses} disabled={saving || isDemo}>
                  {saving ? '保存中…' : '広告費を保存'}
                </button>
              </div>
              {isDemo && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>※ デモモードでは保存できません（表示のみ）。</div>}
            </div>
          </div>

          {/* ===== 説明（このタブの使い方・自動算出の内訳）：まとめて最下部に配置 ===== */}
          <div className="card">
            <div className="card-head"><h3>ℹ️ 広告費タブについて</h3></div>
            <div className="card-body">
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.8 }}>
                掲載費を日別に入力（サムライ単身・家族・価格・ズバッと）します。上部のセレクトで月ごとに切り替えできます。日別リストは1日〜末日を常に全日表示します。
              </div>
              {isAutoMonth && (
                <div style={{ fontSize: 11, color: '#475569', background: '#F1F5FB', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', marginTop: 10, lineHeight: 1.7 }}>
                  🚚 <b>広告費は自動算出</b>（受付日の取得リード件数 × 単価・{AUTO_FROM.replace('-', '/')}以降）：<br />
                  ・引越し侍 … <b>サムライ単身 ¥{SAMURAI_SINGLE_UNIT}×件数</b> と <b>サムライ家族 ¥{SAMURAI_FAMILY_UNIT}×件数</b>（合算せず別々に算出。単身＝1人／家族＝2人以上）<br />
                  ・価格.com … <b>¥{KAKAKU_UNIT}×件数</b>　／　ズバット … <b>¥{ZUBATTO_UNIT}×件数</b>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', background: '#0F2A4A', color: '#fff', padding: '10px 18px', borderRadius: 24, fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 2000 }}>{toast}</div>
      )}
    </div>
  )
}
