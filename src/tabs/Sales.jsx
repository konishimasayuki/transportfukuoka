// 売上管理タブ
// - 月選択 → 成約管理(/api/contracts)から自動集計（担当者別・サイト別・客単価・反響売上）
// - 広告費(掲載費)は「広告費」タブと同じ自動算出ロジック(src/lib/adcost)で最新合計を表示。
import { useEffect, useMemo, useState } from 'react'
import { autoAdCostForMonth } from '../lib/adcost'

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

// 流入元(srcLabel) → 集計サイト。新旧両方の表記を受け付ける（古いレコード互換）。
const SOURCE_TO_SHEET = {
  'サムライ': 'サムライ', '引越し侍': 'サムライ',
  'ズバッと': 'ズバッと', 'ズバット': 'ズバッと',
  '価格.com': '価格.com',
  'SUUMO': 'SUUMO',
  '直電': '直電', '自社HP': '直電',
  'チラシ': 'チラシ',
  '企業紹介': '企業紹介', '紹介': '企業紹介', '比較ナビ福岡': '企業紹介',
  'その他': 'その他',
}
const SHEET_SITES = ['サムライ', 'ズバッと', '価格.com', 'SUUMO', '直電', 'チラシ', '企業紹介', 'その他']
const AD_SITES = ['サムライ', 'ズバッと', '価格.com', 'SUUMO']

// 広告費の項目（広告費タブと同じ構造）
const DAILY_FIELDS = ['samurai_single', 'samurai_family', 'kakaku', 'zubatto']
const MONTHLY_FIELDS = ['suumo', 'chirashi', 'other']

// 旧フォーマット（flat keys）と新フォーマット（daily/monthly）の両対応で月合計を出す
function totalOfExp(ex) {
  if (!ex) return 0
  let total = 0
  if (ex.daily || ex.monthly) {
    if (ex.daily) {
      Object.values(ex.daily).forEach(row => { DAILY_FIELDS.forEach(k => { total += num(row[k]) }) })
    }
    if (ex.monthly) {
      MONTHLY_FIELDS.forEach(k => { total += num(ex.monthly[k]) })
    }
  } else {
    ;['samurai_single', 'samurai_family', 'kakaku', 'zubatto', 'suumo', 'chirashi', 'other'].forEach(k => {
      if (ex[k] != null) total += num(ex[k])
    })
  }
  return total
}

function isInMonth(c, monthKey) {
  const d = String(c.salesDate || c.date || '') // 売り上げ登録日を優先（無ければ引越し日）
  if (d.startsWith(monthKey)) return true
  const m = d.match(/^(\d{1,2})\/(\d{1,2})/)
  if (m) {
    const y = new Date().getFullYear()
    const k = `${y}-${String(parseInt(m[1], 10)).padStart(2, '0')}`
    return k === monthKey
  }
  return false
}

export default function Sales({ user, switchTab }) {
  const isDemo = user?.mode === 'demo'
  const months = useMemo(monthOptions, [])
  const [selMonth, setSelMonth] = useState(months[0].key)
  const [contracts, setContracts] = useState([])
  const [expenses, setExpenses] = useState({})
  const [leads, setLeads] = useState([]) // 広告費を最新のリード件数から自動算出するため
  const [loading, setLoading] = useState(!isDemo)

  useEffect(() => { if (!isDemo) fetchAll() }, [isDemo])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [cRes, eRes, lRes] = await Promise.all([
        fetch('/api/contracts').then(r => r.json()).catch(() => ({ items: [] })),
        fetch('/api/expenses').then(r => r.json()).catch(() => ({ data: {} })),
        fetch('/api/inbound').then(r => r.json()).catch(() => ({ items: [] })),
      ])
      setContracts(cRes.items || [])
      setExpenses(eRes.data || {})
      setLeads(lRes.items || [])
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

  // 当月の広告費合計：自動算出対象月(2026-07以降)は「リードから算出した最新の合計」を表示
  // （広告費タブでの保存を待たずに常に最新）。保存済みの月別手動分があれば加算。それ以外の月は保存済み合計。
  const adInfo = useMemo(() => {
    const auto = autoAdCostForMonth(leads, selMonth)
    if (!auto) return { total: totalOfExp(expenses[selMonth]), auto: false }
    const ex = expenses[selMonth]
    const monthlyExtra = (ex && ex.monthly) ? MONTHLY_FIELDS.reduce((s, k) => s + num(ex.monthly[k]), 0) : 0
    return { total: auto.total + monthlyExtra, auto: true }
  }, [leads, expenses, selMonth])
  const adTotal = adInfo.total
  const profit = totals.total - adTotal

  const monthLabel = months.find(m => m.key === selMonth)?.label || ''

  return (
    <div>
      <div className="page-hdr"><h1>売上管理</h1><p>成約管理から自動集計／広告費は「広告費」タブで入力</p></div>

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
              <div className="kpi-change">{totals.reverbCount}件（サムライ/ズバッと/価格/SUUMO）</div>
            </div>
            <div className="kpi-card c-orange">
              <div className="kpi-label">広告費（掲載費合計）</div>
              <div className="kpi-val">{yen(adTotal)}</div>
              <div className="kpi-change">{adInfo.auto ? '📣 リードから自動集計（最新）' : (adTotal > 0 && totals.reverbAmount > 0 ? `反響ROI ${(totals.reverbAmount / adTotal).toFixed(2)}倍` : '—')}</div>
            </div>
            <div className="kpi-card c-green">
              <div className="kpi-label">粗利（売上 − 広告費）</div>
              <div className="kpi-val">{yen(profit)}</div>
              <div className="kpi-change">キャンセル {totals.cancelCnt}件 / {yen(totals.cancelAmt)}</div>
            </div>
          </div>

          {!isDemo && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn btn-outline btn-sm" onClick={() => typeof switchTab === 'function' && switchTab('adcost')}>
                📣 広告費を入力する
              </button>
            </div>
          )}

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

          {/* 売上明細 */}
          <div className="card">
            <div className="card-head"><h3>売上明細</h3><span className="c-sub">{monthLabel} {monthly.length}件</span></div>
            <div className="card-body scroll-x" style={{ padding: '0 16px' }}>
              <table>
                <thead><tr><th>売上登録日</th><th>顧客名</th><th>区間</th><th>流入元</th><th>担当</th><th style={{ textAlign: 'right' }}>金額</th><th>状態</th></tr></thead>
                <tbody>
                  {monthly.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94A3B8', padding: 24 }}>{monthLabel} の成約データがありません</td></tr>
                  ) : monthly.slice().sort((a, b) => String(b.salesDate || b.date).localeCompare(String(a.salesDate || a.date))).map(c => (
                    <tr key={c.id}>
                      <td>{c.salesDate || c.date}</td><td>{c.name}</td><td>{c.route}</td>
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
    </div>
  )
}
