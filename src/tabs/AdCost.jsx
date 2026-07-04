// 広告費タブ
// - スプレッドシートのように「1日〜末日」を全行表示（月切替可）
// - 日別項目：サムライ単身 / サムライ家族 / 価格 / ズバッと（+ 日合計）
// - 月別項目：SUUMO / チラシ / 企業紹介・その他
// - 掲載費(/api/expenses) に保存（売上管理とデータ共有）。一括貼り付け対応。
import { useEffect, useMemo, useState } from 'react'
import { receivedAtMs } from '../lib/sortLeads'

// 広告費（反響課金）自動算出の単価。受付日の取得リード件数 × 単価。2026-07以降に適用。
//   引越し侍：単身¥715・家族¥1100（単身/家族はリードの人数で判定。データに単身/家族の
//             区分は無く、人数のみのため 1人=単身・2人以上=家族 とする。サムライ単身と
//             サムライ家族は合算せず別列で保持する）
//   価格.com：¥500 × 件数 ／ ズバット：¥660 × 件数（単身/家族の区別なし）
const SAMURAI_SINGLE_UNIT = 715
const SAMURAI_FAMILY_UNIT = 1100
const KAKAKU_UNIT = 500
const ZUBATTO_UNIT = 660
const AUTO_KEYS = ['samurai_single', 'samurai_family', 'kakaku', 'zubatto']
const AUTO_UNIT = { samurai_single: SAMURAI_SINGLE_UNIT, samurai_family: SAMURAI_FAMILY_UNIT, kakaku: KAKAKU_UNIT, zubatto: ZUBATTO_UNIT }
const AUTO_FROM = '2026-07'

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

const DAILY_FIELDS = [
  { key: 'samurai_single', label: 'サムライ単身' },
  { key: 'samurai_family', label: 'サムライ家族' },
  { key: 'kakaku',         label: '価格.com' },
  { key: 'zubatto',        label: 'ズバッと' },
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
  const [leads, setLeads]       = useState([]) // 引越し侍の広告費 自動算出用
  const [loading, setLoading]   = useState(!isDemo)
  const [saving, setSaving]     = useState(false)
  const [draftExp, setDraftExp] = useState({ daily: {}, monthly: {}, note: '' })
  const [bulkPaste, setBulkPaste] = useState('')
  const [showAllDays, setShowAllDays] = useState(false) // 日別テーブル：当日のみ↔全日
  const [toast, setToast] = useState('')
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2200) }

  useEffect(() => { if (!isDemo) fetchAll() }, [isDemo])

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

  // リードを「受付日(YYYY-MM → DD)」でサイト別に集計。
  // 引越し侍は単身(1人)/家族(2人以上)を別々に数える（合算しない）。価格.com・ズバットは総件数。
  const autoByMonthDay = useMemo(() => {
    const map = {}
    const bucket = (ym, day) => { map[ym] = map[ym] || {}; map[ym][day] = map[ym][day] || { single: 0, family: 0, kakaku: 0, zubatto: 0 }; return map[ym][day] }
    for (const l of leads) {
      if (!l || !l.site) continue
      const t = receivedAtMs(l); if (!t) continue
      const d = new Date(t)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const day = String(d.getDate()).padStart(2, '0')
      const site = String(l.site)
      if (site.includes('侍')) {
        const n = parseInt(String(l.count || '').replace(/[^\d]/g, ''), 10)
        if (!n) continue // 人数不明は対象外
        const b = bucket(ym, day); if (n === 1) b.single++; else b.family++
      } else if (site.includes('価格')) {
        bucket(ym, day).kakaku++
      } else if (site.includes('ズバ')) {
        bucket(ym, day).zubatto++
      }
    }
    return map
  }, [leads])

  // この月は自動算出するか（デモ以外・2026-07以降）
  const isAutoMonth = !isDemo && selMonth >= AUTO_FROM
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

  const setDaily = (day, key, value) => {
    setDraftExp(p => ({ ...p, daily: { ...p.daily, [day]: { ...(p.daily[day] || {}), [key]: value } } }))
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
  // 当月は既定で当日のみ表示（折りたたみ）。過去月は全日表示。
  const rowsToShow = (showAllDays || !isCurrentMonth) ? dailyRows : dailyRows.filter(d => d === todayDD)

  const inputCell = { width: 92, padding: '5px 6px', border: '1px solid #E2E8F0', borderRadius: 4, fontSize: 12, fontFamily: 'inherit', outline: 'none', textAlign: 'right' }
  const cellTd = { padding: '4px 6px', borderBottom: '1px solid #F1F5F9' }
  const thCell = { ...cellTd, textAlign: 'right', fontSize: 11, padding: '7px 8px', background: '#F1F5FB', color: '#475569' }

  return (
    <div>
      <div className="page-hdr"><h1>広告費</h1><p>掲載費を日別に入力（サムライ単身・家族・価格・ズバッと）。月ごとに切り替えできます。</p></div>

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
            {DAILY_FIELDS.slice(0, 3).map((f, i) => (
              <div key={f.key} className={`kpi-card ${['c-teal', 'c-orange', 'c-green'][i]}`}>
                <div className="kpi-label">{f.label}</div>
                <div className="kpi-val">{yen(sums.byKey[f.key])}</div>
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
                    <div style={{ minWidth: totals.length * 20, position: 'relative' }}>
                      {/* 棒＋横線エリア */}
                      <div style={{ position: 'relative', height: H }}>
                        {/* 1万円ごとの横線 */}
                        {levels.map(level => (
                          <div key={level} style={{ position: 'absolute', left: 0, right: 0, bottom: (level / roundedMax) * H, borderTop: '1px dashed #E2E8F0' }}>
                            <span style={{ position: 'absolute', left: 0, top: -9, fontSize: 8, color: '#94A3B8', background: '#fff', padding: '0 3px', fontWeight: 700 }}>{level / STEP}万</span>
                          </div>
                        ))}
                        {/* 棒（棒内に料金を縦書き表示） */}
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                          {totals.map(t => {
                            const barH = (t.v / roundedMax) * H
                            const isToday = t.day === todayDD
                            return (
                              <div key={t.day} style={{ flex: '1 0 18px', minWidth: 18, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} title={`${Number(t.day)}日：${yen(t.v)}`}>
                                <div style={{ width: '78%', height: barH, minHeight: t.v > 0 ? 4 : 0, background: isToday ? '#1E5FA8' : '#93C5FD', borderRadius: '3px 3px 0 0', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
                                  {t.v > 0 && (
                                    <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 8, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', letterSpacing: '-0.5px', textShadow: '0 1px 2px rgba(15,23,42,.6)', marginBottom: 3 }}>{yen(t.v)}</span>
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

          {/* 掲載費（日別）：当日のみ表示、当日以外は折りたたみ */}
          <div className="card">
            <div className="card-head">
              <h3>掲載費（日別）</h3>
              {isCurrentMonth
                ? <button className="btn btn-outline btn-sm" onClick={() => setShowAllDays(s => !s)}>{showAllDays ? '▴ 当日のみ表示' : `▾ 全${days}日を表示`}</button>
                : <span className="c-sub">{monthLabel} 全{days}日</span>}
            </div>
            <div className="card-body">
              {isAutoMonth && (
                <div style={{ fontSize: 11, color: '#475569', background: '#F1F5FB', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', marginBottom: 10, lineHeight: 1.7 }}>
                  🚚 <b>広告費は自動算出</b>（受付日の取得リード件数 × 単価・{AUTO_FROM.replace('-', '/')}以降）：<br />
                  ・引越し侍 … <b>サムライ単身 ¥{SAMURAI_SINGLE_UNIT}×件数</b> と <b>サムライ家族 ¥{SAMURAI_FAMILY_UNIT}×件数</b>（合算せず別々に算出。単身＝1人／家族＝2人以上）<br />
                  ・価格.com … <b>¥{KAKAKU_UNIT}×件数</b>　／　ズバット … <b>¥{ZUBATTO_UNIT}×件数</b>
                </div>
              )}
              <div className="scroll-x">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 580 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thCell, textAlign: 'left' }}>日付</th>
                      {DAILY_FIELDS.map(f => <th key={f.key} style={thCell}>{f.label}</th>)}
                      <th style={thCell}>日合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsToShow.map(day => {
                      const row = draftExp.daily[day] || {}
                      const v = dayVals(day)
                      const rowTotal = DAILY_FIELDS.reduce((s, f) => s + v[f.key], 0)
                      const isToday = day === todayDD
                      return (
                        <tr key={day} style={isToday ? { background: '#EFF6FF' } : undefined}>
                          <td style={{ ...cellTd, fontWeight: isToday ? 800 : 400, color: isToday ? '#1E5FA8' : '#1E293B', whiteSpace: 'nowrap' }}>
                            {Number(day)}日{isToday ? ' （今日）' : ''}
                          </td>
                          {DAILY_FIELDS.map(f => {
                            // 自動算出列は読み取り専用で件数も表示（各サイト・単価で別々に算出）
                            if (v.auto && AUTO_KEYS.includes(f.key)) {
                              const cnt = v.auto.counts[f.key] || 0
                              const unit = AUTO_UNIT[f.key]
                              return (
                                <td key={f.key} style={{ ...cellTd, textAlign: 'right' }} title={`${cnt}件 × ¥${unit}`}>
                                  <div style={{ color: v[f.key] > 0 ? '#334155' : '#CBD5E1', fontWeight: 600 }}>{v[f.key] > 0 ? yen(v[f.key]) : '—'}</div>
                                  {cnt > 0 && <div style={{ fontSize: 9, color: '#94A3B8' }}>{cnt}件</div>}
                                </td>
                              )
                            }
                            return (
                              <td key={f.key} style={{ ...cellTd, textAlign: 'right' }}>
                                <input type="number" min={0} inputMode="numeric"
                                  value={row[f.key] ?? ''} onChange={e => setDaily(day, f.key, e.target.value)}
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
                      {DAILY_FIELDS.map(f => (
                        <td key={f.key} style={{ ...cellTd, padding: '8px', textAlign: 'right' }}>{yen(sums.byKey[f.key])}</td>
                      ))}
                      <td style={{ ...cellTd, padding: '8px', textAlign: 'right' }}>{yen(sums.dailyGrand)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {isCurrentMonth && !showAllDays && (
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>※ 当日のみ表示中。他の{days - 1}日は「▾ 全{days}日を表示」で開けます（合計は全日を集計）。</div>
              )}

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
        </>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', background: '#0F2A4A', color: '#fff', padding: '10px 18px', borderRadius: 24, fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 2000 }}>{toast}</div>
      )}
    </div>
  )
}
