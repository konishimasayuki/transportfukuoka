import { useState, useEffect, useMemo } from 'react'

/* =========================================================================
 * 御見積書（株式会社トランスポーター）— 見積書タブ Phase A
 * - 顧客・作業条件の入力
 * - 家財チェックリスト（数量入力）→ ポイント（才数）自動合計
 * - 料金 A〜D 手入力 → 小計 / 合計 / 消費税10% / 再計 を自動計算
 * - 見積番号 自動採番（EST-YYYYxxxx）
 * - Redis保存（/api/estimate）/ デモはローカルのみ
 * - 印刷プレビュー（紙の御見積書に寄せたレイアウト）
 * ======================================================================= */

// 会社情報（見積書ヘッダで使用）
const COMPANY = {
  name: '株式会社トランスポーター',
  zip: '〒815-0083',
  address: '福岡市南区高宮5-9-1-510',
  tel: '0120-078-786',
  fax: '092-521-8379',
  regNo: 'T2920001095787',
}

/* -------------------------------------------------------------------------
 * 家財 → ポイント（才数）対応表【2026-06 実帳票・写真照合済 / 全104行】
 * pt: null = サイズ別・別途見積（合計に加算しない）
 * ⚠ 暫定確定。紙の帳票と最終照合後に値を差し替える場合はこの配列のみ編集。
 * ----------------------------------------------------------------------- */
const KAZAI_GROUPS = [
  {
    title: 'タンス・棚類',
    items: [
      { key: 'youdansu_A',  name: '洋ダンス',       size: 'A', pt: 59 },
      { key: 'youdansu_B',  name: '洋ダンス',       size: 'B', pt: 45 },
      { key: 'youdansu_C',  name: '洋ダンス',       size: 'C', pt: 35 },
      { key: 'youdansu_U',  name: '洋ダンス',       size: 'U', pt: 80 },
      { key: 'wadansu_A',   name: '和ダンス',       size: 'A', pt: 41 },
      { key: 'wadansu_B',   name: '和ダンス',       size: 'B', pt: 34 },
      { key: 'wadansu_U',   name: '和ダンス',       size: 'U', pt: 50 },
      { key: 'seiri_A',     name: '整理ダンス',     size: 'A', pt: 35 },
      { key: 'seiri_B',     name: '整理ダンス',     size: 'B', pt: 26 },
      { key: 'seiri_U',     name: '整理ダンス',     size: 'U', pt: 50 },
      { key: 'baby_A',      name: 'ベビーダンス',   size: 'A', pt: 34 },
      { key: 'baby_B',      name: 'ベビーダンス',   size: 'B', pt: 18 },
      { key: 'blazer',      name: 'ブレザーダンス', size: '',  pt: 39 },
      { key: 'locker',      name: 'ロッカーダンス', size: '',  pt: 18 },
      { key: 'shokki_A',    name: '食器棚',         size: 'A', pt: 53 },
      { key: 'shokki_B',    name: '食器棚',         size: 'B', pt: 39 },
      { key: 'shokki_C',    name: '食器棚',         size: 'C', pt: 27 },
      { key: 'hondana_A',   name: '本棚',           size: 'A', pt: 34 },
      { key: 'hondana_B',   name: '本棚',           size: 'B', pt: 27 },
      { key: 'hondana_U',   name: '本棚',           size: 'U', pt: 65 },
      { key: 'metalrack',   name: 'メタルラック',   size: '',  pt: 20 },
      { key: 'livingboard', name: 'リビングボード', size: '',  pt: 50 },
      { key: 'sideboard',   name: 'サイドボード',   size: '',  pt: 22 },
    ],
  },
  {
    title: '家具・寝具類',
    items: [
      { key: 'tvboard',     name: 'テレビボード',       size: '',     pt: 62 },
      { key: 'ousetsu',     name: '応接セット',         size: '',     pt: 85 },
      { key: 'writedesk',   name: 'ライティングデスク', size: '',     pt: 25 },
      { key: 'tsukue_U',    name: '机',                 size: 'U',    pt: 22 },
      { key: 'tsukue_B',    name: '机',                 size: 'B',    pt: 18 },
      { key: 'oshiire',     name: '押入ダンス',         size: '',     pt: 12 },
      { key: 'bed_S',       name: 'ベッド',             size: 'S',    pt: 40 },
      { key: 'bed_SW',      name: 'ベッド',             size: 'SW',   pt: 46 },
      { key: 'bed_W',       name: 'ベッド',             size: 'W',    pt: 54 },
      { key: 'babybed',     name: 'ベビーベッド',       size: '',     pt: 9 },
      { key: 'bunkbed',     name: '2段ベッド',          size: '',     pt: 41 },
      { key: 'sofa_3',      name: 'ソファー',           size: '3人用', pt: 46 },
      { key: 'sofa_2',      name: 'ソファー',           size: '2人用', pt: 31 },
      { key: 'sofa_1',      name: 'ソファー',           size: '1人用', pt: 20 },
      { key: 'dresser',     name: 'ドレッサー',         size: '',     pt: 14 },
      { key: 'sugatami',    name: '姿見',               size: '',     pt: 4 },
      { key: 'getabako',    name: '下駄箱',             size: '',     pt: 18 },
      { key: 'getabako_y',  name: '下駄箱',             size: '横',   pt: 13 },
      { key: 'denwadai',    name: '電話台',             size: '',     pt: 6 },
      { key: 'tvdai',       name: 'テレビ台',           size: '',     pt: 14 },
      { key: 'sukima',      name: 'すき間家具',         size: '',     pt: 6 },
      { key: 'lowboard',    name: 'ローボード',         size: '',     pt: 14 },
      { key: 'chest',       name: 'チェスト',           size: '',     pt: 16 },
    ],
  },
  {
    title: '家電・キッチン類',
    items: [
      { key: 'table',        name: '和・洋テーブル', size: '',      pt: 9 },
      { key: 'fridge_6A',    name: '冷蔵庫',         size: '6ドアA', pt: 31 },
      { key: 'fridge_4B',    name: '冷蔵庫',         size: '4ドアB', pt: 27 },
      { key: 'fridge_3C',    name: '冷蔵庫',         size: '3ドアC', pt: 24 },
      { key: 'fridge_2D',    name: '冷蔵庫',         size: '2ドアD', pt: 18 },
      { key: 'fridge_miniE', name: '冷蔵庫',         size: 'ミニE',  pt: 6 },
      { key: 'minicompo',    name: 'ミニコンポ',     size: '',      pt: 2 },
      { key: 'aircon_S',     name: 'エアコン',       size: 'S',     pt: 6 },
      { key: 'aircon_W',     name: 'エアコン',       size: 'W',     pt: 2 },
      { key: 'washer_drum',  name: '洗濯機',         size: 'ドラム', pt: 15 },
      { key: 'washer_full',  name: '洗濯機',         size: '全自動', pt: 13 },
      { key: 'dryer',        name: '乾燥機',         size: '',      pt: 8 },
      { key: 'tv_brown',     name: 'TVブラ',         size: '( )',   pt: null },
      { key: 'tv_thin',      name: 'TV薄型',         size: '( )',   pt: null },
      { key: 'video',        name: 'ビデオ',         size: '',      pt: 0.5 },
      { key: 'pc',           name: 'パソコン',       size: '',      pt: 10 },
      { key: 'range',        name: 'レンジ',         size: '',      pt: 2 },
      { key: 'rangedai',     name: 'レンジ台',       size: '',      pt: 12 },
      { key: 'gascon',       name: 'ガスコンロ',     size: '',      pt: 1.5 },
      { key: 'kitchencnt',   name: 'キッチンカウンター', size: '',  pt: 16 },
      { key: 'dining_A',     name: '食卓セット',     size: 'A',     pt: 57 },
      { key: 'dining_B',     name: '食卓セット',     size: 'B',     pt: 38 },
      { key: 'wagon',        name: 'ワゴン',         size: '',      pt: 6 },
    ],
  },
  {
    title: '生活用品・その他',
    items: [
      { key: 'onpuuki',    name: '温風機',           size: '',        pt: 2 },
      { key: 'souji',      name: '掃除機',           size: '',        pt: 1.5 },
      { key: 'senpuuki',   name: '扇風機',           size: '',        pt: 1 },
      { key: 'mishin',     name: 'ミシン',           size: '',        pt: 1 },
      { key: 'kotatsu',    name: 'こたつ',           size: '',        pt: 9 },
      { key: 'futonbukuro',name: 'ふとん袋',         size: '',        pt: 12 },
      { key: 'zabuton',    name: '座ぶとんケース',   size: '',        pt: 5 },
      { key: 'ishou',      name: '衣装ケース',       size: '',        pt: 5 },
      { key: 'juutan',     name: 'ジュータン',       size: '',        pt: 8 },
      { key: 'ningyou',    name: '人形ケース',       size: '',        pt: 5 },
      { key: 'gogatsu',    name: '五月人形',         size: '',        pt: 10 },
      { key: 'minibike',   name: 'ミニバイク',       size: '',        pt: 38 },
      { key: 'jitensha',   name: '自転車',           size: '',        pt: 28 },
      { key: 'sanrinsha',  name: '三輪車',           size: '',        pt: 3 },
      { key: 'piano_U',    name: 'ピアノ',           size: 'U',       pt: null },
      { key: 'piano_G',    name: 'ピアノ',           size: 'G',       pt: null },
      { key: 'electone_A', name: 'エレクトーン',     size: 'A',       pt: null },
      { key: 'electone_B', name: 'エレクトーン',     size: 'B',       pt: 24 },
      { key: 'kinko',      name: '金庫',             size: '高さ40cm', pt: 3 },
      { key: 'shoumei',    name: '照明器具',         size: '',        pt: 1.5 },
      { key: 'gaku',       name: '額',               size: '',        pt: 1 },
      { key: 'colorbox',   name: 'カラーボックス',   size: '',        pt: 5 },
    ],
  },
  {
    title: '仏壇・梱包資材類',
    items: [
      { key: 'butsudan_A', name: '御仏壇',         size: 'A', pt: 35 },
      { key: 'butsudan_B', name: '御仏壇',         size: 'B', pt: 23 },
      { key: 'butsudan_C', name: '御仏壇',         size: 'C', pt: 10 },
      { key: 'kanyou',     name: '観葉植物',       size: '',  pt: 7 },
      { key: 'monooki_A',  name: '物置',           size: 'A', pt: 28 },
      { key: 'monooki_B',  name: '物置',           size: 'B', pt: 16 },
      { key: 'monohoshi',  name: '物干台',         size: '',  pt: 10 },
      { key: 'pipehanger', name: 'パイプハンガー', size: '',  pt: 8 },
      { key: 'fancycase',  name: 'ファンシーケース', size: '', pt: 2.5 },
      { key: 'hangerbox',  name: 'ハンガーボックス', size: '', pt: 7 },
      { key: 'dan_small',  name: 'ダンボール',     size: '小', pt: 1.5 },
      { key: 'dan_mid',    name: 'ダンボール',     size: '中', pt: 2.5 },
      { key: 'dan_wa',     name: 'ダンボール',     size: '和', pt: 2.5 },
    ],
  },
]

const ALL_ITEMS = KAZAI_GROUPS.flatMap(g => g.items)

// 料金欄の定義（帳票の項目名どおり）
const FEE_A = [
  { key: 'space',    label: 'スペース料' },
  { key: 'work',     label: '作業料' },
  { key: 'distance', label: '車輌距離料' },
  { key: 'road',     label: 'ロードアクセス料' },
  { key: 'floor',    label: '階数割増' },
  { key: 'yokomochi',label: '横持割増' },
  { key: 'hojo',     label: '補助車輌料' },
  { key: 'piston',   label: 'ピストン料' },
]
const FEE_B = [
  { key: 'packSmall', label: '小物梱包料' },
  { key: 'packFurni', label: '家具梱包料' },
  { key: 'open',      label: '開梱料' },
  { key: 'storage',   label: '保管料' },
  { key: 'deliver',   label: '配達料' },
  { key: 'disposal',  label: '不用品引取料' },
  { key: 'mixed',     label: '混載料' },
  { key: 'lift',      label: '吊り上下料' },
  { key: 'twoPlace',  label: '二ヶ所積料' },
]
const FEE_C = [
  { key: 'mtSmall',  label: '小（枚）' },
  { key: 'mtMid',    label: '中（枚）' },
  { key: 'mtWa',     label: '和（枚）' },
  { key: 'tape',     label: 'ガムテープ' },
  { key: 'futon',    label: 'ふとん袋' },
  { key: 'hbox',     label: 'ハンガーボックス' },
  { key: 'lightron', label: 'ライトロン・クレープ紙・エアキャップ' },
]
const FEE_D = [
  { key: 'aircon',     label: 'エアコン基本工事（取付）' },
  { key: 'antenna',    label: 'アンテナ（脱・着）' },
  { key: 'tvWire',     label: 'テレビ配線' },
  { key: 'videoWire',  label: 'ビデオ・DVD配線' },
  { key: 'pianoFee',   label: 'ピアノ・エレクトーン料' },
  { key: 'carCarrier', label: 'カーキャリー' },
  { key: 'cleaning',   label: 'ハウスクリーニング' },
  { key: 'washer',     label: '洗濯機（ドラム・全自動）' },
]

const SEND_TYPES = ['', '直送一式', '直送長距離', '限定混載便', '積切']
const PAY_METHODS = ['', '現金', '前受金', '会社請求', 'カード']
const PERSON_CHOICES = ['お客様', '当社']
const ROAD_CHOICES = ['', 'S', 'M', 'L']
const YN = ['', '有', '無']
const REQ_CHOICES = ['', '要', '不要']

const TAX_RATE = 0.1

// 空フォーム
function emptyForm() {
  return {
    estimateNo: '',
    // 基本情報
    estimateDate: '', estimator: '',
    moveDate: '', moveAP: 'AM',
    deliverDate: '', deliverAP: 'AM',
    packDate: '', openDate: '',
    sendType: '', distanceKm: '',
    // 顧客
    name: '', kana: '',
    fromZip: '', fromAddress: '', fromTelHome: '', fromTelWork: '', fromTelMobile: '',
    toZip: '', toAddress: '', toTelHome: '', toTelWork: '', toTelMobile: '',
    // 作業内容の確認
    packSmallBy: 'お客様', packFurniBy: '当社', packOpenBy: 'お客様',
    pianoWork: '', airconSep: '', airconWindow: '', optionWork: '',
    // 作業状況
    twoPlace: '', roadWidth: '', elevator: '', windowLift: '', machine: '',
    // 家財数量
    items: {},
    // 料金（すべて手入力）
    feeA: {}, feeB: {}, feeC: {}, feeD: {},
    // その他
    memo: '', requestTo: '', payment: '',
    status: '作成中',
    // 成約管理由来の場合に元レコードを参照（重複表示防止に使う）
    contractId: '',
  }
}

// 数値ユーティリティ
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const yen = (n) => '¥' + Math.round(num(n)).toLocaleString('ja-JP')
const sumFee = (obj, list) => list.reduce((s, f) => s + num(obj?.[f.key]), 0)

// ===== 共通インラインスタイル（既存タブと統一） =====
const inputStyle = {
  width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0',
  borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
  outline: 'none', color: '#1E293B', background: '#fff',
}
const labelStyle = { fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4, display: 'block' }
const feeInput = { ...inputStyle, textAlign: 'right', padding: '6px 8px' }

export default function Estimate({ user }) {
  const isDemo = user?.mode === 'demo'
  const [items, setItems]         = useState([])
  const [contracts, setContracts] = useState([]) // 成約管理由来の行をマージ表示するため
  const [loading, setLoading]     = useState(!isDemo)
  const [view, setView]       = useState('list')      // 'list' | 'edit'
  const [form, setForm]       = useState(emptyForm())
  const [editId, setEditId]   = useState(null)
  const [saving, setSaving]   = useState(false)
  const [preview, setPreview] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [toast, setToast]     = useState('')

  useEffect(() => { if (!isDemo) fetchItems() }, [])

  // リード詳細から「見積書を作成」で渡されたプリフィルを取り込み、編集ビューを開く
  useEffect(() => {
    let raw = null
    try { raw = sessionStorage.getItem('tf_estimate_prefill') } catch {}
    if (!raw) return
    let p = null
    try { p = JSON.parse(raw) } catch { return }
    try { sessionStorage.removeItem('tf_estimate_prefill') } catch {}
    if (!p || typeof p !== 'object') return
    const f = emptyForm()
    f.estimateNo = nextNo()
    f.estimateDate = new Date().toISOString().slice(0, 10)
    if (p.name) f.name = p.name
    if (p.kana) f.kana = p.kana
    if (p.fromZip) f.fromZip = p.fromZip
    if (p.fromAddress) f.fromAddress = p.fromAddress
    if (p.toZip) f.toZip = p.toZip
    if (p.toAddress) f.toAddress = p.toAddress
    if (p.fromTelMobile) f.fromTelMobile = p.fromTelMobile
    if (p.memo) f.memo = p.memo
    // 家財をリードから自動マッピング（品名一致のみ）
    if (Array.isArray(p.kazai)) {
      const nameToKey = {}
      ALL_ITEMS.forEach(it => { nameToKey[it.name + (it.size ? `（${it.size}）` : '')] = it.key; nameToKey[it.name] = nameToKey[it.name] || it.key })
      p.kazai.forEach(k => {
        const key = nameToKey[k.name]
        if (key) f.items[key] = (Number(f.items[key]) || 0) + (Number(k.qty) || 0)
      })
    }
    if (p.boxCount) {
      // ダンボール（小）に割り当て
      const boxKey = ALL_ITEMS.find(it => it.name === 'ダンボール' && it.size === '小')?.key
      if (boxKey) f.items[boxKey] = Number(p.boxCount) || 0
    }
    setForm(f); setEditId(null); setView('edit'); setPreview(false)
  }, [])

  const fetchItems = async () => {
    setLoading(true)
    try {
      const [eRes, cRes] = await Promise.all([
        fetch('/api/estimate').then(r => r.json()).catch(() => ({ items: [] })),
        fetch('/api/contracts').then(r => r.json()).catch(() => ({ items: [] })),
      ])
      setItems(eRes.items || [])
      setContracts(cRes.items || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  // 採番：EST-YYYY####（同年の既存件数+1）
  const nextNo = () => {
    const y = new Date().getFullYear()
    const prefix = `EST-${y}`
    const used = items
      .map(i => i.estimateNo)
      .filter(no => typeof no === 'string' && no.startsWith(prefix))
      .map(no => parseInt(no.slice(prefix.length), 10))
      .filter(n => Number.isFinite(n))
    const seq = (used.length ? Math.max(...used) : 0) + 1
    return `${prefix}${String(seq).padStart(4, '0')}`
  }

  const openNew = () => {
    const f = emptyForm()
    f.estimateNo = nextNo()
    f.estimateDate = new Date().toISOString().slice(0, 10)
    setForm(f); setEditId(null); setView('edit'); setPreview(false)
  }
  const openEdit = (item) => {
    setForm({ ...emptyForm(), ...item, items: { ...(item.items || {}) },
      feeA: { ...(item.feeA || {}) }, feeB: { ...(item.feeB || {}) },
      feeC: { ...(item.feeC || {}) }, feeD: { ...(item.feeD || {}) } })
    setEditId(item.id); setView('edit'); setPreview(false)
  }
  const backToList = () => { setView('list'); setPreview(false); setForm(emptyForm()); setEditId(null) }

  // フォーム更新ヘルパー
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setItemQty = (key, v) => setForm(p => ({ ...p, items: { ...p.items, [key]: v } }))
  const setFee = (block, key, v) => setForm(p => ({ ...p, [block]: { ...p[block], [key]: v } }))

  // 集計
  const totals = useMemo(() => {
    const points = ALL_ITEMS.reduce((s, it) => {
      const q = num(form.items[it.key])
      return s + (it.pt ? q * it.pt : 0)
    }, 0)
    const qtyTotal = ALL_ITEMS.reduce((s, it) => s + num(form.items[it.key]), 0)
    const a = sumFee(form.feeA, FEE_A)
    const b = sumFee(form.feeB, FEE_B)
    const c = sumFee(form.feeC, FEE_C)
    const d = sumFee(form.feeD, FEE_D)
    const goukei = a + b + c + d
    const tax = Math.round(goukei * TAX_RATE)
    const saikei = goukei + tax
    return { points, qtyTotal, a, b, c, d, goukei, tax, saikei }
  }, [form])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2200) }

  const handleSave = async () => {
    if (!form.name) { showToast('顧客名を入力してください'); return }
    setSaving(true)
    const payload = {
      ...form,
      id: editId || Date.now().toString(),
      total: totals.saikei,
      points: totals.points,
    }
    if (isDemo) {
      if (editId) setItems(p => p.map(i => i.id === editId ? payload : i))
      else setItems(p => [payload, ...p])
      setSaving(false); showToast('保存しました（デモ：ローカルのみ）'); backToList(); return
    }
    try {
      const method = editId ? 'PUT' : 'POST'
      await fetch('/api/estimate', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      await fetchItems()
      showToast('保存しました'); backToList()
    } catch (e) { console.error(e); showToast('保存に失敗しました') }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (isDemo) { setItems(p => p.filter(i => i.id !== id)); setDeleteConfirm(null); return }
    try {
      await fetch('/api/estimate', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      await fetchItems()
    } catch (e) { console.error(e) }
    setDeleteConfirm(null)
  }

  /* ===================== 一覧ビュー ===================== */
  if (view === 'list') {
    // 見積書 + 成約管理 をマージ表示。成約由来は見積書化されていないものだけ（contractId で重複排除）
    const issuedContractIds = new Set(items.map(i => i.contractId).filter(Boolean))
    const fromEst = items.map(i => ({ ...i, _kind: 'estimate', _sortDate: i.estimateDate || i.moveDate || '' }))
    const fromCon = contracts
      .filter(c => !issuedContractIds.has(c.id))
      .map(c => ({
        _kind: 'contract',
        _contract: c,
        id: 'c_' + c.id,
        estimateNo: '（成約由来）',
        name: c.name || '',
        moveDate: c.date || '',
        total: num(c.amount),
        points: 0,
        status: c.status || '成約',
        _sortDate: c.date || '',
      }))
    const rows = [...fromEst, ...fromCon].sort((a, b) => String(b._sortDate).localeCompare(String(a._sortDate)))
    const estCount = items.length
    const conCount = fromCon.length
    const sumEst = items.reduce((s, i) => s + num(i.total), 0)

    // 成約レコードを「見積書として作成」する：成約データをプリフィルしてEdit Viewへ
    const issueFromContract = (c) => {
      const f = emptyForm()
      f.estimateNo = nextNo()
      f.estimateDate = new Date().toISOString().slice(0, 10)
      f.name = c.name || ''
      f.kana = c.kana || ''
      f.fromTelMobile = c.phone || ''
      f.fromAddress = c.fromAddress || ''
      f.toAddress = c.toAddress || ''
      f.moveDate = (c.date && /^\d{4}-\d{2}-\d{2}/.test(c.date)) ? c.date : ''
      f.memo = c.memo || ''
      f.contractId = c.id
      f.contractAmount = num(c.amount) // 参考表示用
      setForm(f); setEditId(null); setView('edit'); setPreview(false)
    }

    return (
      <div>
        <div className="page-hdr"><h1>見積書</h1><p>御見積書の作成・管理（成約管理のレコードも自動表示）</p></div>

        <div className="kpi-row kpi-3">
          <div className="kpi-card c-blue"><div className="kpi-label">見積件数 ／ 成約由来</div><div className="kpi-val">{estCount}<span>件</span> <span style={{ fontSize: 12, color: '#64748B' }}>+ {conCount}件</span></div></div>
          <div className="kpi-card c-teal"><div className="kpi-label">合計見積金額（発行済み）</div><div className="kpi-val" style={{ fontSize: 18 }}>{yen(sumEst)}</div></div>
          <div className="kpi-card c-orange"><div className="kpi-label">今年度採番</div><div className="kpi-val" style={{ fontSize: 14 }}>{nextNo()}</div></div>
        </div>

        <div className="filter-row">
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={openNew}>＋ 新規見積</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>読み込み中...</div>
        ) : (
          <div className="card">
            <div className="card-body scroll-x" style={{ padding: '0 16px' }}>
              <table>
                <thead>
                  <tr><th>種別</th><th>見積番号</th><th>顧客名</th><th>引越日</th><th>ポイント</th><th style={{ textAlign: 'right' }}>金額（税込）</th><th>状態</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94A3B8', padding: 32 }}>見積書・成約レコードがありません</td></tr>
                  ) : rows.map(item => {
                    const isContract = item._kind === 'contract'
                    return (
                      <tr key={item.id} style={isContract ? { background: '#F8FAFC' } : undefined}>
                        <td>
                          <span className={`badge ${isContract ? 'bg' : 'bb'}`}>{isContract ? '成約' : '見積書'}</span>
                        </td>
                        <td><b>{item.estimateNo}</b></td>
                        <td>{item.name} 様</td>
                        <td>{item.moveDate || '—'}</td>
                        <td>{isContract ? '—' : `${num(item.points).toLocaleString('ja-JP')} 才`}</td>
                        <td style={{ textAlign: 'right' }}><b>{yen(item.total)}</b></td>
                        <td><span className={`badge ${isContract ? 'bg' : 'bb'}`}>{item.status || '作成中'}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {isContract ? (
                              <button className="btn btn-primary btn-sm" onClick={() => issueFromContract(item._contract)}>📝 見積書として作成</button>
                            ) : (
                              <>
                                <button className="btn btn-outline btn-sm" onClick={() => openEdit(item)}>編集</button>
                                <button className="btn btn-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }} onClick={() => setDeleteConfirm(item.id)}>削除</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div style={modalOverlay} onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
            <div style={{ ...modalBox, maxWidth: 360 }}>
              <div style={{ padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>見積書を削除しますか？</div>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 20 }}>この操作は元に戻せません</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>キャンセル</button>
                  <button className="btn" style={{ background: '#DC2626', color: '#fff' }} onClick={() => handleDelete(deleteConfirm)}>削除する</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {toast && <Toast msg={toast} />}
      </div>
    )
  }

  /* ===================== 編集ビュー ===================== */
  return (
    <div>
      <PrintStyle />

      {/* ヘッダー操作 */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-outline btn-sm" onClick={backToList}>← 一覧へ</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>御見積書 {editId ? '編集' : '作成'}</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>見積番号 {form.estimateNo}</div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => setPreview(true)}>🖨 印刷プレビュー</button>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ opacity: saving ? .6 : 1 }}>
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>

      {/* 基本情報 */}
      <Section title="基本情報">
        <div className="three-col">
          <Field label="見積番号"><input style={inputStyle} value={form.estimateNo} onChange={e => set('estimateNo', e.target.value)} /></Field>
          <Field label="見積日"><input type="date" style={inputStyle} value={form.estimateDate} onChange={e => set('estimateDate', e.target.value)} /></Field>
          <Field label="見積者"><input style={inputStyle} value={form.estimator} onChange={e => set('estimator', e.target.value)} placeholder="担当者名" /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="引越日">
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" style={inputStyle} value={form.moveDate} onChange={e => set('moveDate', e.target.value)} />
              <select style={{ ...inputStyle, width: 70 }} value={form.moveAP} onChange={e => set('moveAP', e.target.value)}><option>AM</option><option>PM</option></select>
            </div>
          </Field>
          <Field label="お届日">
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" style={inputStyle} value={form.deliverDate} onChange={e => set('deliverDate', e.target.value)} />
              <select style={{ ...inputStyle, width: 70 }} value={form.deliverAP} onChange={e => set('deliverAP', e.target.value)}><option>AM</option><option>PM</option></select>
            </div>
          </Field>
          <Field label="距離（km）"><input type="number" style={inputStyle} value={form.distanceKm} onChange={e => set('distanceKm', e.target.value)} placeholder="例：12" /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="梱包日"><input type="date" style={inputStyle} value={form.packDate} onChange={e => set('packDate', e.target.value)} /></Field>
          <Field label="開梱日"><input type="date" style={inputStyle} value={form.openDate} onChange={e => set('openDate', e.target.value)} /></Field>
          <Field label="発送内容">
            <select style={inputStyle} value={form.sendType} onChange={e => set('sendType', e.target.value)}>
              {SEND_TYPES.map(s => <option key={s} value={s}>{s || '—'}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      {/* 顧客情報 */}
      <Section title="顧客情報">
        <div className="two-col">
          <Field label="お名前 *"><input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="例：松本 満" /></Field>
          <Field label="フリガナ"><input style={inputStyle} value={form.kana} onChange={e => set('kana', e.target.value)} placeholder="例：マツモト ミツル" /></Field>
        </div>

        <div style={{ marginTop: 12, fontWeight: 700, fontSize: 12, color: '#1E5FA8' }}>［A］現住所</div>
        <div className="two-col" style={{ marginTop: 6 }}>
          <Field label="〒"><input style={inputStyle} value={form.fromZip} onChange={e => set('fromZip', e.target.value)} placeholder="815-0000" /></Field>
          <Field label="住所"><input style={inputStyle} value={form.fromAddress} onChange={e => set('fromAddress', e.target.value)} placeholder="福岡市南区…" /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 6 }}>
          <Field label="電話（自宅）"><input style={inputStyle} value={form.fromTelHome} onChange={e => set('fromTelHome', e.target.value)} /></Field>
          <Field label="電話（勤務先）"><input style={inputStyle} value={form.fromTelWork} onChange={e => set('fromTelWork', e.target.value)} /></Field>
          <Field label="携帯電話"><input style={inputStyle} value={form.fromTelMobile} onChange={e => set('fromTelMobile', e.target.value)} placeholder="090-…" /></Field>
        </div>

        <div style={{ marginTop: 14, fontWeight: 700, fontSize: 12, color: '#0E8A7A' }}>［B］転居先</div>
        <div className="two-col" style={{ marginTop: 6 }}>
          <Field label="〒"><input style={inputStyle} value={form.toZip} onChange={e => set('toZip', e.target.value)} /></Field>
          <Field label="住所"><input style={inputStyle} value={form.toAddress} onChange={e => set('toAddress', e.target.value)} placeholder="福岡市南区…" /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 6 }}>
          <Field label="電話（自宅）"><input style={inputStyle} value={form.toTelHome} onChange={e => set('toTelHome', e.target.value)} /></Field>
          <Field label="電話（勤務先）"><input style={inputStyle} value={form.toTelWork} onChange={e => set('toTelWork', e.target.value)} /></Field>
          <Field label="携帯電話"><input style={inputStyle} value={form.toTelMobile} onChange={e => set('toTelMobile', e.target.value)} /></Field>
        </div>
      </Section>

      {/* 作業条件 */}
      <Section title="作業内容・作業状況">
        <div className="three-col">
          <Field label="小物梱包"><Seg choices={PERSON_CHOICES} value={form.packSmallBy} onChange={v => set('packSmallBy', v)} /></Field>
          <Field label="家具梱包"><Seg choices={PERSON_CHOICES} value={form.packFurniBy} onChange={v => set('packFurniBy', v)} /></Field>
          <Field label="開梱作業"><Seg choices={PERSON_CHOICES} value={form.packOpenBy} onChange={v => set('packOpenBy', v)} /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="エアコン セパレート（台）"><input type="number" style={inputStyle} value={form.airconSep} onChange={e => set('airconSep', e.target.value)} /></Field>
          <Field label="エアコン ウィンド（台）"><input type="number" style={inputStyle} value={form.airconWindow} onChange={e => set('airconWindow', e.target.value)} /></Field>
          <Field label="ピアノ・エレクトーン作業"><input style={inputStyle} value={form.pianoWork} onChange={e => set('pianoWork', e.target.value)} placeholder="有無・備考" /></Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="オプション工事"><input style={inputStyle} value={form.optionWork} onChange={e => set('optionWork', e.target.value)} placeholder="内容を記入" /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="二ヶ所積み・降し"><input style={inputStyle} value={form.twoPlace} onChange={e => set('twoPlace', e.target.value)} placeholder="現地・行先 等" /></Field>
          <Field label="道幅"><select style={inputStyle} value={form.roadWidth} onChange={e => set('roadWidth', e.target.value)}>{ROAD_CHOICES.map(s => <option key={s} value={s}>{s || '—'}</option>)}</select></Field>
          <Field label="エレベーター作業"><select style={inputStyle} value={form.elevator} onChange={e => set('elevator', e.target.value)}>{YN.map(s => <option key={s} value={s}>{s || '—'}</option>)}</select></Field>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="窓吊り上下作業"><select style={inputStyle} value={form.windowLift} onChange={e => set('windowLift', e.target.value)}>{YN.map(s => <option key={s} value={s}>{s || '—'}</option>)}</select></Field>
          <Field label="機械作業"><select style={inputStyle} value={form.machine} onChange={e => set('machine', e.target.value)}>{REQ_CHOICES.map(s => <option key={s} value={s}>{s || '—'}</option>)}</select></Field>
          <div />
        </div>
      </Section>

      {/* 家財リスト */}
      <Section
        title="家財リスト（数量を入力）"
        right={<span style={{ fontSize: 12, fontWeight: 800, color: '#1E5FA8' }}>ポイント合計 {totals.points.toLocaleString('ja-JP')} 才</span>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {KAZAI_GROUPS.map(group => (
            <div key={group.title} style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ background: '#F1F5FB', padding: '7px 10px', fontSize: 11, fontWeight: 800, color: '#334155' }}>{group.title}</div>
              <div>
                {group.items.map(it => {
                  const q = num(form.items[it.key])
                  return (
                    <div key={it.key} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
                      borderTop: '1px solid #F1F5F9', background: q > 0 ? '#EFF6FF' : '#fff',
                    }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                        {it.name}{it.size && <span style={{ color: '#94A3B8' }}> {it.size}</span>}
                        <span style={{ color: '#CBD5E1', fontSize: 10 }}> {it.pt == null ? '(別途)' : `${it.pt}才`}</span>
                      </div>
                      {q > 0 && it.pt != null && (
                        <span style={{ fontSize: 10, color: '#1E5FA8', fontWeight: 700, whiteSpace: 'nowrap' }}>{(q * it.pt).toLocaleString('ja-JP')}才</span>
                      )}
                      <input
                        type="number" min={0} inputMode="numeric"
                        value={form.items[it.key] ?? ''}
                        onChange={e => setItemQty(it.key, e.target.value)}
                        style={{ width: 52, padding: '5px 6px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, textAlign: 'center', fontFamily: 'inherit', outline: 'none' }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#94A3B8' }}>
          ※ ポイント（才数）は数量×単価の自動合計です。「(別途)」項目（ピアノ・TV等）はサイズ別のため合計に含めません。車種判定は現在未実装です。
        </div>
      </Section>

      {/* 料金 */}
      <Section title="料金（手入力）">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <FeeBlock title="基本料金 (A)" list={FEE_A} obj={form.feeA} onChange={(k, v) => setFee('feeA', k, v)} subtotal={totals.a} />
          <FeeBlock title="附帯料金 (B)" list={FEE_B} obj={form.feeB} onChange={(k, v) => setFee('feeB', k, v)} subtotal={totals.b} />
          <FeeBlock title="資材の料金 (C)" list={FEE_C} obj={form.feeC} onChange={(k, v) => setFee('feeC', k, v)} subtotal={totals.c} />
          <FeeBlock title="その他の料金 (D)" list={FEE_D} obj={form.feeD} onChange={(k, v) => setFee('feeD', k, v)} subtotal={totals.d} />
        </div>

        {/* 合計 */}
        <div style={{ marginTop: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'flex-end', alignItems: 'flex-end' }}>
            <TotalLine label="小計(A)" value={yen(totals.a)} />
            <TotalLine label="小計(B)" value={yen(totals.b)} />
            <TotalLine label="小計(C)" value={yen(totals.c)} />
            <TotalLine label="小計(D)" value={yen(totals.d)} />
            <TotalLine label="合計 (A+B+C+D)" value={yen(totals.goukei)} />
            <TotalLine label="消費税 (10%)" value={yen(totals.tax)} />
            <TotalLine label="再計（総額）" value={yen(totals.saikei)} big />
          </div>
        </div>
      </Section>

      {/* お約束事項・支払 */}
      <Section title="お約束事項・お支払い">
        <div className="two-col">
          <Field label="新居・お約束事項"><input style={inputStyle} value={form.requestTo} onChange={e => set('requestTo', e.target.value)} placeholder="例：新居（米曹屋郡笹栗町…）倍屋" /></Field>
          <Field label="お支払方法"><select style={inputStyle} value={form.payment} onChange={e => set('payment', e.target.value)}>{PAY_METHODS.map(s => <option key={s} value={s}>{s || '—'}</option>)}</select></Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="備考"><textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} value={form.memo} onChange={e => set('memo', e.target.value)} /></Field>
        </div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>お支払いは、積込終了時にお願い致します。</div>
      </Section>

      {/* 下部操作 */}
      <div className="no-print" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 24 }}>
        <button className="btn btn-outline" onClick={backToList}>← 一覧へ</button>
        <button className="btn btn-outline" onClick={() => setPreview(true)}>🖨 印刷プレビュー</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ opacity: saving ? .6 : 1 }}>{saving ? '保存中...' : '保存する'}</button>
      </div>

      {preview && <PreviewModal form={form} totals={totals} onClose={() => setPreview(false)} />}
      {toast && <Toast msg={toast} />}
    </div>
  )
}

/* ===================== 小コンポーネント ===================== */
function Section({ title, right, children }) {
  return (
    <div className="card no-print">
      <div className="card-head"><h3>{title}</h3>{right}</div>
      <div className="card-body">{children}</div>
    </div>
  )
}
function Field({ label, children }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>
}
function Seg({ choices, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {choices.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)}
          className="btn btn-sm"
          style={value === c
            ? { background: '#1E5FA8', color: '#fff', flex: 1 }
            : { background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', flex: 1 }}>
          {c}
        </button>
      ))}
    </div>
  )
}
function FeeBlock({ title, list, obj, onChange, subtotal }) {
  return (
    <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: '#F1F5FB', padding: '7px 10px', fontSize: 11, fontWeight: 800, color: '#334155' }}>{title}</div>
      <div style={{ padding: '6px 10px' }}>
        {list.map(f => (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
            <div style={{ flex: 1, fontSize: 11, color: '#475569' }}>{f.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>¥</span>
              <input type="number" min={0} inputMode="numeric" value={obj?.[f.key] ?? ''}
                onChange={e => onChange(f.key, e.target.value)}
                style={{ width: 90, ...feeInput }} />
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', marginTop: 6, paddingTop: 6, fontSize: 12, fontWeight: 800 }}>
          <span style={{ color: '#64748B' }}>小計</span><span>{yen(subtotal)}</span>
        </div>
      </div>
    </div>
  )
}
function TotalLine({ label, value, big }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10, color: '#64748B' }}>{label}</div>
      <div style={{ fontSize: big ? 26 : 14, fontWeight: 900, color: big ? '#1E5FA8' : '#1E293B', lineHeight: 1.2 }}>{value}</div>
    </div>
  )
}
function Toast({ msg }) {
  return (
    <div style={{
      position: 'fixed', bottom: 70, left: '50%', transform: 'translateX(-50%)',
      background: '#0F2A4A', color: '#fff', padding: '10px 18px', borderRadius: 24,
      fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 2000,
    }}>{msg}</div>
  )
}

/* ===================== 印刷プレビュー ===================== */
const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: 16,
}
const modalBox = {
  background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520,
  maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)',
}

function PrintStyle() {
  return (
    <style>{`
      @media print {
        html, body, #root { overflow: visible !important; height: auto !important; }
        body * { visibility: hidden !important; }
        .print-area, .print-area * { visibility: visible !important; }
        .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
        .no-print { display: none !important; }
      }
    `}</style>
  )
}

function PreviewModal({ form, totals, onClose }) {
  const checkedItems = ALL_ITEMS
    .map(it => ({ ...it, qty: num(form.items[it.key]) }))
    .filter(it => it.qty > 0)

  const cell = { border: '1px solid #333', padding: '3px 6px', fontSize: 11 }
  const head = { ...cell, background: '#f0f0f0', fontWeight: 700, whiteSpace: 'nowrap' }

  return (
    <div style={{ ...modalOverlay, alignItems: 'flex-start', overflow: 'auto', padding: 0 }}>
      <div style={{ width: '100%', minHeight: '100%', background: '#525659', padding: '16px 0' }}>
        {/* 操作バー */}
        <div className="no-print" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
          <button className="btn btn-outline" style={{ background: '#fff' }} onClick={onClose}>← 戻る</button>
          <button className="btn btn-primary" onClick={() => window.print()}>🖨 印刷する</button>
        </div>

        {/* A4ドキュメント */}
        <div className="print-area" style={{ width: 760, maxWidth: '94%', margin: '0 auto', background: '#fff', padding: 28, color: '#111', fontFamily: "'Noto Sans JP', sans-serif" }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111', paddingBottom: 8 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 4 }}>御 見 積 書</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>見積番号：{form.estimateNo}　／　見積日：{form.estimateDate || '―'}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, lineHeight: 1.6 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{COMPANY.name}</div>
              <div>{COMPANY.zip} {COMPANY.address}</div>
              <div>TEL {COMPANY.tel} ／ FAX {COMPANY.fax}</div>
              <div>登録番号 {COMPANY.regNo}</div>
            </div>
          </div>

          {/* 顧客 */}
          <div style={{ marginTop: 12, fontSize: 16, fontWeight: 800 }}>{form.name || '　　　　'} 様</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <tbody>
              <tr>
                <td style={head}>現住所</td>
                <td style={cell} colSpan={3}>{form.fromZip} {form.fromAddress}</td>
              </tr>
              <tr>
                <td style={head}>転居先</td>
                <td style={cell} colSpan={3}>{form.toZip} {form.toAddress}</td>
              </tr>
              <tr>
                <td style={head}>電話</td>
                <td style={cell}>{form.fromTelMobile || form.fromTelHome || '―'}</td>
                <td style={head}>引越日</td>
                <td style={cell}>{form.moveDate || '―'} {form.moveDate ? form.moveAP : ''} ／ お届 {form.deliverDate || '―'}</td>
              </tr>
            </tbody>
          </table>

          {/* 家財 */}
          <div style={{ marginTop: 14, fontWeight: 800, fontSize: 12 }}>■ 家財明細（ポイント合計 {totals.points.toLocaleString('ja-JP')} 才）</div>
          {checkedItems.length === 0 ? (
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>（家財の数量が入力されていません）</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
              <thead>
                <tr>
                  <td style={head}>品名</td><td style={head}>数量</td><td style={head}>才数</td>
                  <td style={head}>品名</td><td style={head}>数量</td><td style={head}>才数</td>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.ceil(checkedItems.length / 2) }).map((_, r) => {
                  const left = checkedItems[r * 2]
                  const right = checkedItems[r * 2 + 1]
                  const renderCells = (it) => it ? (
                    <>
                      <td style={cell}>{it.name}{it.size ? ` ${it.size}` : ''}</td>
                      <td style={{ ...cell, textAlign: 'center' }}>{it.qty}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{it.pt == null ? '別途' : (it.qty * it.pt).toLocaleString('ja-JP')}</td>
                    </>
                  ) : (<><td style={cell}></td><td style={cell}></td><td style={cell}></td></>)
                  return <tr key={r}>{renderCells(left)}{renderCells(right)}</tr>
                })}
              </tbody>
            </table>
          )}

          {/* 料金 */}
          <div style={{ marginTop: 14, fontWeight: 800, fontSize: 12 }}>■ お見積金額</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
            <tbody>
              <tr><td style={head}>基本料金 (A)</td><td style={{ ...cell, textAlign: 'right' }}>{yen(totals.a)}</td><td style={head}>附帯料金 (B)</td><td style={{ ...cell, textAlign: 'right' }}>{yen(totals.b)}</td></tr>
              <tr><td style={head}>資材の料金 (C)</td><td style={{ ...cell, textAlign: 'right' }}>{yen(totals.c)}</td><td style={head}>その他の料金 (D)</td><td style={{ ...cell, textAlign: 'right' }}>{yen(totals.d)}</td></tr>
              <tr><td style={head}>合計 (A+B+C+D)</td><td style={{ ...cell, textAlign: 'right' }}>{yen(totals.goukei)}</td><td style={head}>消費税 (10%)</td><td style={{ ...cell, textAlign: 'right' }}>{yen(totals.tax)}</td></tr>
              <tr>
                <td style={{ ...head, fontSize: 14 }}>再計（総額）</td>
                <td style={{ ...cell, textAlign: 'right', fontSize: 18, fontWeight: 900 }} colSpan={3}>{yen(totals.saikei)}</td>
              </tr>
            </tbody>
          </table>

          {form.requestTo && <div style={{ marginTop: 12, fontSize: 11 }}>お約束事項：{form.requestTo}</div>}
          {form.memo && <div style={{ marginTop: 4, fontSize: 11 }}>備考：{form.memo}</div>}
          <div style={{ marginTop: 14, fontSize: 11, color: '#333' }}>お支払いは、積込終了時にお願い致します。{form.payment ? `（${form.payment}）` : ''}</div>
        </div>
      </div>
    </div>
  )
}
