// 担当者リスト共有ヘルパ
// 設定タブで編集し、成約管理／成約登録モーダルのプルダウンで使う。
// API(/api/staff) が空・未設定・エラーのときは DEFAULT_STAFF を返す。
// ※すべて架空のサンプル担当者（実在の人物ではありません）。
export const DEFAULT_STAFF = ['担当A', '担当B', '担当C', '担当D', '担当E', 'アルバイト', '現場スタッフ']

export async function fetchStaffList() {
  try {
    const r = await fetch('/api/staff')
    const d = await r.json()
    const arr = Array.isArray(d.items) ? d.items.filter(Boolean) : []
    return arr.length ? arr : DEFAULT_STAFF
  } catch {
    return DEFAULT_STAFF
  }
}
