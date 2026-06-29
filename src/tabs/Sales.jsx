// 売上管理タブ
// - 月選択 → 成約管理(/api/contracts)から自動集計（担当者別・サイト別・客単価・反響売上）
// - 掲載費(/api/expenses)は **サムライ単身/サムライ家族/価格/ズバット を日別**、SUUMO/チラシ/その他は月別
// - 日別の自動合計列、月の総合計、コピペでの一括取り込み(タブ区切り)対応
import { useEffect, useMemo, useState } from 'react'

// 月選択（直近12ヶ月）
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

const SOURCE_TO_SHEET = {
  '引越し侍': 'サムライ', 'ズバット': 'ズバット', 'SUUMO': 'SUUMO', '価格.com': '価格.com',
  '自社HP': '直電', '紹介': '企業紹介', '比較ナビ福岡': '企業紹介', 'その他': 'その他',
}
const SHEET_SITES = ['サムライ', 'ズバット', '価格.com', 'SUUMO', '直電', 'チラシ', '企業紹介', 'その他']
const AD_SITES = ['サムライ', 'ズバット', '価格.com', 'SUUMO']

// 日別の項目（スプレッドシートと同じ並び）
const DAILY_FIELDS = [
  { key: 'samurai_single', label: 'サムライ単身' },
  { key: 'samurai_family', label: 'サムライ家族' },
  { key: 'kakaku',         label: '価格' },
  { key: 'zubatto',        label: 'ズバット' },
]
// 月別だけ（日次データが無いもの）
const MONTHLY_FIELDS = [
  { key: 'suumo',    label: 'SUUMO' },
  { key: 'chirashi', label: 'チラシ' },
  { key: 'other',    label: '企業紹介・その他' },
]

// 旧フォーマット（flat keys）と新フォーマット（daily/monthly）の両対応で月合計を出す
function totalOfExp(ex) {
  if (!ex) return 0
  let total = 0
  if (ex.daily || ex.monthly) {
    if (ex.daily) {
      Object.values(ex.daily).forEach(row => {
        DAILY_FIELDS.forEach(f => { total += num(row[f.key]) })
      })
    }
    if (ex.monthly) {
      MONTHLY_FIELDS.forEach(f => { total += num(ex.monthly[f.key]) })
    }
  } else {
    // 旧フォーマット互換（前バージョンの flat 値）
    ;['samurai_single', 'samurai_family', 'kakaku', 'zubatto', 'suumo', 'chirashi', 'other'].forEach(k => {
      if (ex[k] != null) total += num(ex[k])
    })
  }
  return total
}

// "6/1\t17875\t18700\t3500\t3300\t43375" のような行を解析して { '01': {…}, … } を返す
function parseBulkExpenses(text) {
  const out = {}
  text.split(/\r?\n/).forEach(line => {
    if (!line.trim()) return
    // タブ・カンマ・複数スペースで分割。ただし数値中のカンマは除去しておく
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

function isInMonth(c, monthKey) {
  const d = String(c.date || '')
  if (d.startsWith(monthKey)) return true
  const m = d.match(/^(\d{1,2})\/(\d{1,2})/)
  if (m) {
    const y = new Date().getFullYear()
    const k = `${y}-${String(parseInt(m[1], 10)).padStart(2, '0')}`
    return k === monthKey
  }
  return false
}

export default function Sales({ user }) {
  const isDemo = user?.mode === 'demo'
  const months = useMemo(monthOptions, [])
  const [selMonth, setSelMonth] = useState(months[0].key)
  const [contracts, setContracts] = useState([])
  const [expenses, setExpenses] = useState({}) // 全月分
  const [loading, setLoading] = useState(!isDemo)
  const [saving, setSaving] = useState(false)
  const [draftExp, setDraftExp] = useState({ daily: {}, monthly: {}, note: '' })
  const [bulkPaste, setBulkPaste] = useState('')
  const [toast, setToast] = useState('')
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2000) }

  useEffect(() => { if (!isDemo) fetchAll() }, [isDemo])

  // 月切替時に編集用ドラフトを保存値で初期化
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
      const [cRes, eRes] = await Promise.all([
        fetch('/api/contracts').then(r => r.json()).catch(() => ({ items: [] })),
        fetch('/api/expenses').then(r => r.json()).catch(() => ({ data: {} })),
      ])
      setContracts(cRes.items || [])
      setExpenses(eRes.data || {})
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const monthly = useMemo(() => contracts.filter(c => isInMonth(c, selMonth)), [contracts, selMonth])

  const totals = useMemo(() => {
    let total = 0, count = 0, cancelAmt = 0, cancelCnt = 0
    const byStaff = {}
    const bySite  = {}
    SHEET_SITES.forEach(s => { bySite[s] = { count: 0, amount: 0 } })
    bySite['キャンセル'] = { count: 0, amount: 0 }

    for (const c of monthly) {
      const amt = num(c.amount)
      const isCancel = c.status === '失注' || c.status === 'キャンセル'
      total += amt; count += 1
      if (isCancel) { cancelAmt += amt; cancelCnt += 1 }
      const staffKey = isCancel ? 'キャンセル' : (c.staff && String(c.staff).trim() ? c.staff : '営業以外')
      byStaff[staffKey] = byStaff[staffKey] || { count: 0, amount: 0 }
      byStaff[staffKey].count += 1; byStaff[staffKey].amount += amt
      if (isCancel) {
        bySite['キャンセル'].count += 1; bySite['キャンセル'].amount += amt
      } else {
        const sheetSite = SOURCE_TO_SHEET[c.srcLabel] || 'その他'
        bySite[sheetSite] = bySite[sheetSite] || { count: 0, amount: 0 }
        bySite[sheetSite].count += 1; bySite[sheetSite].amount += amt
      }
    }
    const avg = count > 0 ? Math.round(total / count) : 0
    const reverbAmount = AD_SITES.reduce((s, k) => s + (bySite[k]?.amount || 0), 0)
    const reverbCount  = AD_SITES.reduce((s, k) => s + (bySite[k]?.count  || 0), 0)
    return { total, count, avg, cancelAmt, cancelCnt, byStaff, bySite, reverbAmount, reverbCount }
  }, [monthly])

  // ドラフトの集計（編集中の数値も即時反映）
  const draftSums = useMemo(() => {
    const byKey = { samurai_single: 0, samurai_family: 0, kakaku: 0, zubatto: 0 }
    let dailyGrand = 0
    Object.values(draftExp.daily || {}).forEach(row => {
      DAILY_FIELDS.forEach(f => { const v = num(row[f.key]); byKey[f.key] += v; dailyGrand += v })
    })
    let monthlyTotal = 0
    MONTHLY_FIELDS.forEach(f => { monthlyTotal += num(draftExp.monthly?.[f.key]) })
    return { byKey, dailyGrand, monthlyTotal, grand: dailyGrand + monthlyTotal }
  }, [draftExp])

  // KPIに使う「保存済みの」当月広告費合計
  const adTotal = totalOfExp(expenses[selMonth])
  const profit = totals.total - adTotal

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
      // 全部0の日は保存対象から除く（Redisサイズ節約）
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

  // 共通スタイル
  const inputCell = { width: 90, padding: '4px 6px', border: '1px solid #E2E8F0', borderRadius: 4, fontSize: 12, fontFamily: 'inherit', outline: 'none', textAlign: 'right' }
  const td = { padding: '4px 6px', borderBottom: '1px solid #F1F5F9' }

  return (
    <div>
      <div className="page-hdr"><h1>売上管理</h1><p>成約管理から自動集計／掲載費は日別入力（サムライ単身・家族・価格・ズバット）</p></div>

      <div className="filter-row">
        <select value={selMonth} onChange={e => setSelMonth(e.target.value)}>
          {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        {!isDemo && <button className="btn btn-outline btn-sm" onClick={fetchAll} disabled={loading}>⟳ 再集計</button>}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>読み込み中...</div>
      ) : (
        <>
          {/* KPI */}
          <div className="kpi-row kpi-4">
            <div className="kpi-card c-blue">
              <div className="kpi-label">{monthLabel} 総売上</div>
              <div className="kpi-val">{yen(totals.total)}</div>
              <div className="kpi-change">件数 {totals.count}件 ／ 客単価 {yen(totals.avg)}</div>
            </div>
            <div className="kpi-card c-teal">
              <div className="kpi-label">反響からの売上（広告経由）</div>
              <div className="kpi-val">{yen(totals.reverbAmount)}</div>
              <div className="kpi-change">{totals.reverbCount}件（サムライ/ズバット/価格/SUUMO）</div>
            </div>
            <div className="kpi-card c-orange">
              <div className="kpi-label">広告費（掲載費合計）</div>
              <div className="kpi-val">{yen(adTotal)}</div>
              <div className="kpi-change">{adTotal > 0 && totals.reverbAmount > 0 ? `反響ROI ${(totals.reverbAmount / adTotal).toFixed(2)}倍` : '—'}</div>
            </div>
            <div className="kpi-card c-green">
              <div className="kpi-label">粗利（売上 − 広告費）</div>
              <div className="kpi-val">{yen(profit)}</div>
              <div className="kpi-change">キャンセル {totals.cancelCnt}件 / {yen(totals.cancelAmt)}</div>
            </div>
          </div>

          <div className="two-col">
            {/* 担当者別 */}
            <div className="card">
              <div className="card-head"><h3>担当者別 契約件数・売上</h3><span className="c-sub">{monthLabel}</span></div>
              <div className="card-body scroll-x" style={{ padding: '0 16px' }}>
                <table>
                  <thead><tr><th>担当者</th><th style={{ textAlign: 'right' }}>契約件数</th><th style={{ textAlign: 'right' }}>売上</th></tr></thead>
                  <tbody>
                    {Object.keys(totals.byStaff).length === 0 ? (
                      <tr><td colSpan={3} style={{ textAlign: 'center', color: '#94A3B8', padding: 24 }}>{monthLabel} の成約データがありません</td></tr>
                    ) : Object.entries(totals.byStaff).sort((a, b) => b[1].amount - a[1].amount).map(([staff, v]) => (
                      <tr key={staff}><td>{staff}</td><td style={{ textAlign: 'right' }}>{v.count}件</td><td style={{ textAlign: 'right' }}><b>{yen(v.amount)}</b></td></tr>
                    ))}
                    {Object.keys(totals.byStaff).length > 0 && (
                      <tr style={{ fontWeight: 800, background: '#F8FAFC' }}>
                        <td>合計</td><td style={{ textAlign: 'right' }}>{totals.count}件</td><td style={{ textAlign: 'right' }}>{yen(totals.total)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* サイト別 */}
            <div className="card">
              <div className="card-head"><h3>サイト別 契約件数・売上</h3><span className="c-sub">{monthLabel}</span></div>
              <div className="card-body scroll-x" style={{ padding: '0 16px' }}>
                <table>
                  <thead><tr><th>サイト</th><th style={{ textAlign: 'right' }}>契約件数</th><th style={{ textAlign: 'right' }}>売上</th></tr></thead>
                  <tbody>
                    {[...SHEET_SITES, 'キャンセル'].map(s => {
                      const v = totals.bySite[s] || { count: 0, amount: 0 }
                      if (v.count === 0 && v.amount === 0) return null
                      return (
                        <tr key={s}><td>{s}</td><td style={{ textAlign: 'right' }}>{v.count}件</td><td style={{ textAlign: 'right' }}><b>{yen(v.amount)}</b></td></tr>
                      )
                    })}
                    {totals.count === 0 && (
                      <tr><td colSpan={3} style={{ textAlign: 'center', color: '#94A3B8', padding: 24 }}>{monthLabel} の成約データがありません</td></tr>
                    )}
                    {totals.count > 0 && (
                      <tr style={{ fontWeight: 800, background: '#F8FAFC' }}>
                        <td>合計</td><td style={{ textAlign: 'right' }}>{totals.count}件</td><td style={{ textAlign: 'right' }}>{yen(totals.total)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div style={{ fontSize: 10, color: '#94A3B8', padding: '6px 0 10px' }}>※「自社HP」→「直電」、「比較ナビ福岡/紹介」→「企業紹介」に集約</div>
              </div>
            </div>
          </div>

          {/* 掲載費（日別入力） — 当日行は常時表示、他の日は折り畳み */}
          <div className="card">
            <div className="card-head"><h3>掲載費（日別）</h3><span className="c-sub">{monthLabel} 入力</span></div>
            <div className="card-body">
          {(() => {
            const todayDate = new Date()
            const isCurrentMonth = selMonth === `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}`
            const todayDD = isCurrentMonth ? String(todayDate.getDate()).padStart(2, '0') : null
            // 1行レンダリング
            const renderRow = (day) => {
              const row = draftExp.daily[day] || {}
              const rowTotal = DAILY_FIELDS.reduce((s, f) => s + num(row[f.key]), 0)
              const isToday = day === todayDD
              return (
                <tr key={day} style={isToday ? { background: '#EFF6FF' } : undefined}>
                  <td style={{ ...td, fontWeight: isToday ? 800 : 400, color: isToday ? '#1E5FA8' : '#1E293B' }}>
                    {Number(day)}日{isToday ? ' （今日）' : ''}
                  </td>
                  {DAILY_FIELDS.map(f => (
                    <td key={f.key} style={{ ...td, textAlign: 'right' }}>
                      <input type="number" min={0} inputMode="numeric"
                        value={row[f.key] ?? ''} onChange={e => setDaily(day, f.key, e.target.value)}
                        style={inputCell} />
                    </td>
                  ))}
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: rowTotal > 0 ? '#1E5FA8' : '#CBD5E1' }}>
                    {rowTotal > 0 ? yen(rowTotal) : '—'}
                  </td>
                </tr>
              )
            }
            // ヘッダ行
            const Thead = (
              <thead>
                <tr style={{ background: '#F1F5FB' }}>
                  <th style={{ ...td, textAlign: 'left', fontSize: 11, padding: '6px 8px' }}>日付</th>
                  {DAILY_FIELDS.map(f => <th key={f.key} style={{ ...td, textAlign: 'right', fontSize: 11, padding: '6px 8px' }}>{f.label}</th>)}
                  <th style={{ ...td, textAlign: 'right', fontSize: 11, padding: '6px 8px' }}>日合計</th>
                </tr>
              </thead>
            )
            // 合計行
            const Tfoot = (
              <tfoot>
                <tr style={{ background: '#0F2A4A', color: '#fff', fontWeight: 800 }}>
                  <td style={{ ...td, padding: '8px' }}>合計（月）</td>
                  {DAILY_FIELDS.map(f => (
                    <td key={f.key} style={{ ...td, padding: '8px', textAlign: 'right' }}>{yen(draftSums.byKey[f.key])}</td>
                  ))}
                  <td style={{ ...td, padding: '8px', textAlign: 'right' }}>{yen(draftSums.dailyGrand)}</td>
                </tr>
              </tfoot>
            )
            const otherDays = dailyRows.filter(d => d !== todayDD)
            const enteredCount = otherDays.filter(d => DAILY_FIELDS.some(f => num(draftExp.daily[d]?.[f.key]) > 0)).length
            return (
              <>
                {todayDD ? (
                  <div className="scroll-x">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
                      {Thead}
                      <tbody>{renderRow(todayDD)}</tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#94A3B8', padding: '4px 0 10px' }}>当月以外を表示中。下を開いて編集してください。</div>
                )}
                <details style={{ marginTop: 10 }}>
                  <summary style={{ fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#1E5FA8' }}>
                    {todayDD ? `他の日（${otherDays.length}日／入力済 ${enteredCount}日）を表示・編集` : `${monthLabel} 全日（${dailyRows.length}日）を表示・編集`}
                  </summary>
                  <div className="scroll-x" style={{ marginTop: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
                      {Thead}
                      <tbody>{(todayDD ? otherDays : dailyRows).map(renderRow)}</tbody>
                      {Tfoot}
                    </table>
                  </div>
                </details>
                {/* 当日のみ表示の時も、月合計は常時見たいので簡易表示 */}
                {todayDD && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: '#F8FAFC', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#64748B', fontWeight: 700 }}>{monthLabel} 月合計（日別の自動集計）</span>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                      {DAILY_FIELDS.map(f => (
                        <span key={f.key}><span style={{ color: '#64748B', marginRight: 4 }}>{f.label}</span><b>{yen(draftSums.byKey[f.key])}</b></span>
                      ))}
                      <span style={{ borderLeft: '1px solid #E2E8F0', paddingLeft: 12 }}><b style={{ fontSize: 14 }}>{yen(draftSums.dailyGrand)}</b></span>
                    </div>
                  </div>
                )}
              </>
            )
          })()}

              {/* 一括貼り付け */}
              <details style={{ marginTop: 14 }}>
                <summary style={{ fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#1E5FA8' }}>📋 一括貼り付け（タブ区切り：日付 単身 家族 価格 ズバット 合計）</summary>
                <div style={{ marginTop: 8 }}>
                  <textarea value={bulkPaste} onChange={e => setBulkPaste(e.target.value)} rows={6}
                    placeholder={'6/1\t17875\t18700\t3500\t3300\t43375\n6/2\t17875\t17600\t5500\t3960\t40975\n…'}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', outline: 'none', resize: 'vertical', minHeight: 100 }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
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
                  <span style={{ color: '#64748B', marginRight: 6 }}>当月 掲載費 合計（ドラフト）</span>
                  <b style={{ fontSize: 16 }}>{yen(draftSums.grand)}</b>
                  <span style={{ color: '#94A3B8', fontSize: 11, marginLeft: 6 }}>（日別 {yen(draftSums.dailyGrand)} + 月別 {yen(draftSums.monthlyTotal)}）</span>
                </div>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary btn-sm" onClick={saveExpenses} disabled={saving || isDemo}>
                  {saving ? '保存中…' : '掲載費を保存'}
                </button>
              </div>
              {isDemo && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>※ デモモードでは保存できません（表示のみ）。</div>}
            </div>
          </div>

          {/* 売上明細 */}
          <div className="card">
            <div className="card-head"><h3>売上明細</h3><span className="c-sub">{monthLabel} {monthly.length}件</span></div>
            <div className="card-body scroll-x" style={{ padding: '0 16px' }}>
              <table>
                <thead><tr><th>日付</th><th>顧客名</th><th>区間</th><th>流入元</th><th>担当</th><th style={{ textAlign: 'right' }}>金額</th><th>状態</th></tr></thead>
                <tbody>
                  {monthly.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94A3B8', padding: 24 }}>{monthLabel} の成約データがありません</td></tr>
                  ) : monthly.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(c => (
                    <tr key={c.id}>
                      <td>{c.date}</td><td>{c.name}</td><td>{c.route}</td>
                      <td>{c.srcLabel}</td><td>{c.staff || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{yen(c.amount)}</td><td>{c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 70, left: '50%', transform: 'translateX(-50%)', background: '#0F2A4A', color: '#fff', padding: '10px 18px', borderRadius: 24, fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 2000 }}>{toast}</div>
      )}
    </div>
  )
}
