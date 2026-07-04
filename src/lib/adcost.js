// 広告費（反響課金）自動算出の共通ロジック。広告費タブと売上管理タブで共有する。
// 受付日の取得リード件数 × 単価で日別・月別の掲載費を算出する。2026-07以降に適用。
//   引越し侍：単身¥715・家族¥1100（単身/家族はリード人数で判定＝1人=単身・2人以上=家族。別々に集計）
//   価格.com：¥500 × 件数 ／ ズバット：¥660 × 件数
import { receivedAtMs } from './sortLeads'

export const SAMURAI_SINGLE_UNIT = 715
export const SAMURAI_FAMILY_UNIT = 1100
export const KAKAKU_UNIT = 500
export const ZUBATTO_UNIT = 660
export const AD_AUTO_FROM = '2026-07'
export const AD_KEYS = ['samurai_single', 'samurai_family', 'kakaku', 'zubatto']
export const AD_UNIT = { samurai_single: SAMURAI_SINGLE_UNIT, samurai_family: SAMURAI_FAMILY_UNIT, kakaku: KAKAKU_UNIT, zubatto: ZUBATTO_UNIT }

// リードを「受付日(YYYY-MM → DD)」でサイト別に集計。
// { 'YYYY-MM': { 'DD': { single, family, kakaku, zubatto } } }（件数）
export function adCountsByMonthDay(leads) {
  const map = {}
  const bucket = (ym, day) => { map[ym] = map[ym] || {}; map[ym][day] = map[ym][day] || { single: 0, family: 0, kakaku: 0, zubatto: 0 }; return map[ym][day] }
  for (const l of (leads || [])) {
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
}

// 件数 → 金額（各項目）
export function adAmountsOf(counts) {
  const c = counts || {}
  return {
    samurai_single: (c.single || 0) * SAMURAI_SINGLE_UNIT,
    samurai_family: (c.family || 0) * SAMURAI_FAMILY_UNIT,
    kakaku: (c.kakaku || 0) * KAKAKU_UNIT,
    zubatto: (c.zubatto || 0) * ZUBATTO_UNIT,
  }
}

// 指定月の自動広告費（合計・項目別）。auto対象月(>=AD_AUTO_FROM)以外は null。
export function autoAdCostForMonth(leads, monthKey) {
  if (!monthKey || monthKey < AD_AUTO_FROM) return null
  const days = adCountsByMonthDay(leads)[monthKey] || {}
  const byKey = { samurai_single: 0, samurai_family: 0, kakaku: 0, zubatto: 0 }
  for (const day of Object.keys(days)) {
    const a = adAmountsOf(days[day])
    AD_KEYS.forEach(k => { byKey[k] += a[k] })
  }
  const total = AD_KEYS.reduce((s, k) => s + byKey[k], 0)
  return { total, byKey, byDay: days }
}
