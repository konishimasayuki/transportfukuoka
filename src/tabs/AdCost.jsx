// 広告費タブ
// - スプレッドシートのように「1日〜末日」を全行表示（月切替可）
// - 日別項目：サムライ単身 / サムライ家族 / 価格 / ズバッと（+ 日合計）
// - 月別項目：SUUMO / チラシ / 企業紹介・その他
// - 掲載費(/api/expenses) に保存（売上管理とデータ共有）。一括貼り付け対応。
import { useEffect, useMemo, useState } from 'react'

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
  { key: 'kakaku',         label: '価格' },
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
  const [loading, setLoading]   = useState(!isDemo)
  const [saving, setSaving]     = useState(false)
  const [draftExp, setDraftExp] = useState({ daily: {}, monthly: {}, note: '' })
  const [bulkPaste, setBulkPaste] = useState('')
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
      const eRes = await fetch('/api/expenses').then(r => r.json()).catch(() => ({ data: {} }))
      setExpenses(eRes.data || {})
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const sums = useMemo(() => {
    const byKey = { samurai_single: 0, samurai_family: 0, kakaku: 0, zubatto: 0 }
    let dailyGrand = 0
    Object.values(draftExp.daily || {}).forEach(row => {
      DAILY_FIELDS.forEach(f => { const v = num(row[f.key]); byKey[f.key] += v; dailyGrand += v })
    })
    let monthlyTotal = 0
    MONTHLY_FIELDS.forEach(f => { monthlyTotal += num(draftExp.monthly?.[f.key]) })
    return { byKey, dailyGrand, monthlyTotal, grand: dailyGrand + monthlyTotal }
  }, [draftExp])

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
      Object.entries(draftExp.daily || {}).forEach(([day, row]) => {
        const has = DAILY_FIELDS.some(f => num(row[f.key]) > 0)
        if (has) {
          const r = {}
          DAILY_FIELDS.forEach(f => { r[f.key] = num(row[f.key]) })
          dailyClean[day] = r
        }
      })
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

          {/* 掲載費（日別・全日表示） */}
          <div className="card">
            <div className="card-head"><h3>掲載費（日別）</h3><span className="c-sub">{monthLabel} 全{days}日</span></div>
            <div className="card-body">
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
                    {dailyRows.map(day => {
                      const row = draftExp.daily[day] || {}
                      const rowTotal = DAILY_FIELDS.reduce((s, f) => s + num(row[f.key]), 0)
                      const isToday = day === todayDD
                      return (
                        <tr key={day} style={isToday ? { background: '#EFF6FF' } : undefined}>
                          <td style={{ ...cellTd, fontWeight: isToday ? 800 : 400, color: isToday ? '#1E5FA8' : '#1E293B', whiteSpace: 'nowrap' }}>
                            {Number(day)}日{isToday ? ' （今日）' : ''}
                          </td>
                          {DAILY_FIELDS.map(f => (
                            <td key={f.key} style={{ ...cellTd, textAlign: 'right' }}>
                              <input type="number" min={0} inputMode="numeric"
                                value={row[f.key] ?? ''} onChange={e => setDaily(day, f.key, e.target.value)}
                                style={inputCell} />
                            </td>
                          ))}
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

              {/* 一括貼り付け */}
              <details style={{ marginTop: 14 }}>
                <summary style={{ fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#1E5FA8' }}>📋 一括貼り付け（タブ区切り：日付 単身 家族 価格 ズバッと 合計）</summary>
                <div style={{ marginTop: 8 }}>
                  <textarea value={bulkPaste} onChange={e => setBulkPaste(e.target.value)} rows={6}
                    placeholder={'6/1\t17875\t18700\t3500\t3300\t43375\n6/2\t17875\t17600\t5500\t3960\t40975\n…'}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', outline: 'none', resize: 'vertical', minHeight: 100 }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={applyBulk} disabled={!bulkPaste.trim()}>取り込み（未保存）</button>
                    <button className="btn btn-outline btn-sm" style={{ color: '#B91C1C', borderColor: '#FECACA' }} onClick={clearAllDaily}>日別をクリア</button>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>※ 合計列は無視。1〜31日を自動判定。タブ/カンマ/スペース対応。</span>
                  </div>
                </div>
              </details>

              {/* 月別 その他 */}
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>月別その他（日別なし）</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  {MONTHLY_FIELDS.map(f => (
                    <div key={f.key}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4 }}>{f.label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: '#94A3B8' }}>¥</span>
                        <input type="number" inputMode="numeric" min={0}
                          value={draftExp.monthly?.[f.key] ?? ''} onChange={e => setMonthly(f.key, e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', textAlign: 'right' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4 }}>メモ</div>
                <input value={draftExp.note || ''} onChange={e => setDraftExp(p => ({ ...p, note: e.target.value }))}
                  placeholder="例：段ボール小97円/大138円 など" style={{ width: '100%', padding: '7px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
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
        </>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', background: '#0F2A4A', color: '#fff', padding: '10px 18px', borderRadius: 24, fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 2000 }}>{toast}</div>
      )}
    </div>
  )
}
