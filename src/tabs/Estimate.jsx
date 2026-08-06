import { useState, useEffect, useMemo } from 'react'
import { DEMO_CONTRACTS } from '../lib/demoData'
import { GMAPS_KEY, zipFromAddress } from '../lib/gmaps'

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

// 見積書（印刷）の家財は、査定サイトの帳票に合わせて
// 「家具 / 家電 / その他 / 重量物」の4分類で並べる。
// 品目キーごとに分類を明示し、未指定は家具として扱う。
const KAZAI_BUCKET = (() => {
  const b = {}
  const put = (bucket, keys) => keys.forEach(k => { b[k] = bucket })
  put('家電', ['fridge_6A', 'fridge_4B', 'fridge_3C', 'fridge_2D', 'fridge_miniE', 'minicompo',
    'aircon_S', 'aircon_W', 'washer_drum', 'washer_full', 'dryer', 'tv_brown', 'tv_thin', 'video',
    'pc', 'range', 'gascon', 'onpuuki', 'souji', 'senpuuki', 'mishin', 'shoumei'])
  put('その他', ['futonbukuro', 'zabuton', 'kanyou', 'monooki_A', 'monooki_B', 'monohoshi',
    'pipehanger', 'fancycase', 'hangerbox', 'dan_small', 'dan_mid', 'dan_wa',
    'ningyou', 'gogatsu', 'gaku'])
  put('重量物', ['piano_U', 'piano_G', 'electone_A', 'electone_B', 'kinko',
    'minibike', 'jitensha', 'sanrinsha', 'butsudan_A', 'butsudan_B', 'butsudan_C'])
  return b
})()
const KAZAI_BUCKETS = ['家具', '家電', 'その他', '重量物']
const bucketOf = (key) => KAZAI_BUCKET[key] || '家具'
// 品目のサイズ表記。元帳票の「( )」のような記入欄プレースホルダは印刷しない。
const sizeText = (sz) => {
  const t = String(sz || '').trim()
  return (!t || /^[（(]\s*[）)]$/.test(t)) ? '' : `（${t}）`
}

// 依頼作業（帳票のチェック欄）。査定サイトの「依頼作業」に合わせる。
const WORK_ITEMS = ['搬出/輸送/搬入', '荷造り/梱包', '家具梱包', '荷解き', '家具の配置', '不用品の処分', 'ペットの輸送']

// リードの家財語彙（LeadDetailModalの選択肢）→ 見積書の品目キー への対応表。
// 語彙・サイズ表記が異なるため明示的に対応づける（一致すれば家財数量に自動反映）。
const LEAD_KAZAI_TO_KEY = {
  // 家具
  'ソファ': 'sofa_2', 'ソファ（1人掛け）': 'sofa_1', 'ソファ（2人掛け）': 'sofa_2', 'ソファ（3人掛け）': 'sofa_3',
  'サイドボード・テレビ台': 'sideboard',
  'チェスト': 'chest', 'チェスト（大）': 'chest', 'チェスト（中・小）': 'chest',
  'リビングテーブル': 'table', 'ダイニングテーブルセット': 'dining_A',
  'シャンデリア・スタンド': 'shoumei', 'こたつ': 'kotatsu',
  '絨毯・カーペット': 'juutan', '絨毯・カーペット（10畳未満）': 'juutan', '絨毯・カーペット（10畳以上）': 'juutan',
  'ベッド': 'bed_S', 'ベッド（シングル）': 'bed_S', 'ベッド（セミダブル）': 'bed_SW', 'ベッド（ダブル）': 'bed_W',
  '布団類': 'futonbukuro',
  'タンス': 'seiri_B', 'タンス（中・小）': 'seiri_B', 'タンス（大）': 'seiri_A',
  '本棚': 'hondana_B', '本棚（中・小）': 'hondana_B', '本棚（大）': 'hondana_A',
  '衣装ケース': 'ishou', '机/椅子': 'tsukue_B', '机': 'tsukue_B', 'ドレッサー': 'dresser',
  '食器棚': 'shokki_B', '食器棚（中・小）': 'shokki_B', '食器棚（大）': 'shokki_A',
  // 家電
  'テレビ': 'tv_thin', 'テレビ（40インチ未満）': 'tv_thin', 'テレビ（40インチ以上）': 'tv_thin',
  'ステレオ・コンポ類': 'minicompo', 'ステレオ': 'minicompo', 'ミニコンポ': 'minicompo', 'デスクトップパソコン': 'pc',
  '冷蔵庫': 'fridge_2D', '冷蔵庫（２ドア）': 'fridge_2D', '冷蔵庫（2ドア）': 'fridge_2D', '冷蔵庫（3ドア）': 'fridge_3C',
  '洗濯機': 'washer_full', '洗濯機（縦型）': 'washer_full', '洗濯機（ドラム式）': 'washer_drum',
  '乾燥機': 'dryer', '電子レンジ': 'range', 'エアコン': 'aircon_S', 'ストーブ・ヒーター': 'onpuuki', '扇風機': 'senpuuki',
  // その他
  '自転車': 'jitensha', '物干し竿': 'monohoshi', '植木鉢・観葉植物': 'kanyou', '仏壇': 'butsudan_B',
  // 重量物
  'ピアノ類': 'piano_U', '小型ピアノ・エレクトーン': 'electone_B', '大型ピアノ': 'piano_G', 'バイク': 'minibike',
}
// 見積書語彙そのものの完全一致（保険）
const ITEM_NAME_TO_KEY = (() => {
  const m = {}
  ALL_ITEMS.forEach(it => { m[it.name + (it.size ? `（${it.size}）` : '')] = it.key; if (!(it.name in m)) m[it.name] = it.key })
  return m
})()
// リード家財名 → 見積書品目キー（完全一致 → カッコ前のベース名 → 見積書語彙一致 の順）
function resolveKazaiKey(name) {
  if (!name) return null
  const base = String(name).replace(/[（(].*$/, '').trim()
  return LEAD_KAZAI_TO_KEY[name] || LEAD_KAZAI_TO_KEY[base] || ITEM_NAME_TO_KEY[name] || ITEM_NAME_TO_KEY[base] || null
}

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
    // 帳票（見積書レイアウト）用の項目
    ageGender: '', job: '', email: '', persons: '', moveTime: '',
    fromType: '', fromFloor: '', fromElevator: '', fromLayout: '',
    toType: '', toFloor: '', toElevator: '', toLayout: '',
    request: '',           // 備考・その他希望
    priceText: '',         // 料金（空なら合計金額を表示）
    works: {},             // 依頼作業のチェック状態
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

export default function Estimate({ user, switchTab }) {
  const isDemo = user?.mode === 'demo'
  const [items, setItems]         = useState([])
  const [contracts, setContracts] = useState(isDemo ? DEMO_CONTRACTS : []) // 成約管理由来の行をマージ表示するため
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
    if (p.toTelMobile) f.toTelMobile = p.toTelMobile
    if (p.estimator) f.estimator = p.estimator
    if (p.moveDate) { f.moveDate = p.moveDate; f.deliverDate = p.moveDate } // お届日は引越日と同日を既定に
    if (p.moveAP) { f.moveAP = p.moveAP; f.deliverAP = p.moveAP }
    if (p.memo) f.memo = p.memo
    // 帳票レイアウト用の項目（空でない値だけ引き継ぐ＝見積書側の編集を消さない）
    ;['ageGender', 'job', 'email', 'persons', 'moveTime', 'request', 'priceText',
      'fromType', 'fromFloor', 'fromElevator', 'fromLayout',
      'toType', 'toFloor', 'toElevator', 'toLayout'].forEach(k => { if (p[k]) f[k] = p[k] })
    // 家財をリードから自動マッピング（語彙が異なるため対応表で変換）
    if (Array.isArray(p.kazai)) {
      p.kazai.forEach(k => {
        const key = resolveKazaiKey(k.name)
        if (key) f.items[key] = (Number(f.items[key]) || 0) + (Number(k.qty) || 0)
      })
    }
    if (p.boxCount) {
      // ダンボール（小）に割り当て
      const boxKey = ALL_ITEMS.find(it => it.name === 'ダンボール' && it.size === '小')?.key
      if (boxKey) f.items[boxKey] = Number(p.boxCount) || 0
    }
    setForm(f); setEditId(null); setView('edit'); setPreview(false)
    // 郵便番号が空なら住所から自動補完（Googleマップキーがある時のみ）
    if (GMAPS_KEY) {
      if (f.toAddress && !f.toZip) zipFromAddress(f.toAddress).then(r => { if (r.zip) setForm(prev => ({ ...prev, toZip: r.zip })) }).catch(() => {})
      if (f.fromAddress && !f.fromZip) zipFromAddress(f.fromAddress).then(r => { if (r.zip) setForm(prev => ({ ...prev, fromZip: r.zip })) }).catch(() => {})
    }
  }, [])

  const fetchItems = async () => {
    setLoading(true)
    try {
      const [eRes, cRes, lRes] = await Promise.all([
        fetch('/api/estimate').then(r => r.json()).catch(() => ({ items: [] })),
        fetch('/api/contracts').then(r => r.json()).catch(() => ({ items: [] })),
        fetch('/api/inbound').then(r => r.json()).catch(() => ({ items: [] })), // 家財の後追い紐付け用
      ])
      setItems(eRes.items || [])
      setContracts(backfillContractKazai(cRes.items || [], lRes.items || []))
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  // 過去の成約（家財未保存）に、元リード(leadKey一致)の家財を後から紐付けして保管する。
  // 家財が空でleadに家財がある成約だけを対象に、成約レコードへ永続化（PUT）する。
  const backfillContractKazai = (cons, leads) => {
    const byKey = {}
    ;(leads || []).forEach(l => { if (l && l.key) byKey[l.key] = l })
    const fixes = []
    const merged = (cons || []).map(c => {
      const hasKazai = Array.isArray(c.kazai) && c.kazai.length
      const l = (!hasKazai && c.leadKey) ? byKey[c.leadKey] : null
      if (l && Array.isArray(l.kazai) && l.kazai.length) {
        const patch = { id: c.id, kazai: l.kazai, boxCount: c.boxCount || l.boxCount || '' }
        fixes.push(patch)
        return { ...c, ...patch }
      }
      return c
    })
    if (fixes.length) {
      Promise.all(fixes.map(p => fetch('/api/contracts', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
      }))).catch(() => {})
    }
    return merged
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

  // 住所から郵便番号を取得（転居先／現住所）。Googleマップキーが必要。
  const [zipBusy, setZipBusy] = useState('') // 'from' | 'to' | ''
  const lookupZip = async (section) => {
    const addr = section === 'to' ? form.toAddress : form.fromAddress
    if (!addr || !addr.trim()) { showToast('先に住所を入力してください'); return }
    if (!GMAPS_KEY) { showToast('郵便番号の自動取得にはGoogleマップAPIキーが必要です（設定→Googleマップ設定）'); return }
    setZipBusy(section)
    const r = await zipFromAddress(addr)
    setZipBusy('')
    if (r.zip) { set(section === 'to' ? 'toZip' : 'fromZip', r.zip); showToast('郵便番号を取得しました') }
    else showToast('郵便番号を取得できませんでした（住所をご確認ください）')
  }
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
        salesDate: c.salesDate || '',
        total: num(c.amount),
        points: 0,
        status: c.status || '成約',
        _sortDate: c.salesDate || c.date || '', // 売り上げ登録日を優先して並べ替え
      }))
    const rows = [...fromEst, ...fromCon].sort((a, b) => String(b._sortDate).localeCompare(String(a._sortDate)))
    const estCount = items.length
    const conCount = fromCon.length
    const sumEst = items.reduce((s, i) => s + num(i.total), 0)
    const sumCon = fromCon.reduce((s, i) => s + num(i.total), 0)
    const sumAll = sumEst + sumCon

    // 成約レコードを「見積書として作成」する：成約データをプリフィルしてEdit Viewへ
    const issueFromContract = (c) => {
      const f = emptyForm()
      f.estimateNo = nextNo()
      f.estimateDate = new Date().toISOString().slice(0, 10)
      f.name = c.name || ''
      f.kana = c.kana || ''
      f.fromTelMobile = c.phone || ''
      f.toTelMobile = c.phone || '' // 同一人物なので転居先の携帯も同じ番号
      f.estimator = c.staff || ''   // 見積者は担当者で補完
      f.fromAddress = c.fromAddress || ''
      f.toAddress = c.toAddress || ''
      f.moveDate = (c.date && /^\d{4}-\d{2}-\d{2}/.test(c.date)) ? c.date : ''
      f.deliverDate = f.moveDate // お届日は引越日と同日を既定に
      f.memo = c.memo || ''
      // 帳票レイアウト用の項目（成約が持っているものだけ補完。見積書側での編集が優先）
      f.email = c.email || ''
      f.persons = c.persons ? `${c.persons}人` : ''
      f.fromZip = c.fromZip || f.fromZip
      f.toZip = c.toZip || f.toZip
      f.request = c.request || ''
      f.priceText = c.amount ? yen(c.amount) : ''
      f.contractId = c.id
      f.contractAmount = num(c.amount) // 参考表示用
      // 家財を成約から見積書の家財数量へ反映（リード→成約で引き継いだkazai/boxCount）
      if (Array.isArray(c.kazai)) {
        c.kazai.forEach(k => { const key = resolveKazaiKey(k.name); if (key) f.items[key] = (Number(f.items[key]) || 0) + (Number(k.qty) || 0) })
      }
      if (c.boxCount) { const boxKey = ALL_ITEMS.find(it => it.name === 'ダンボール' && it.size === '小')?.key; if (boxKey) f.items[boxKey] = Number(c.boxCount) || 0 }
      setForm(f); setEditId(null); setView('edit'); setPreview(false)
    }

    return (
      <div>
        <div className="page-hdr"><h1>見積書</h1><p>御見積書の作成・管理（成約管理のレコードも自動表示）</p></div>

        <div className="kpi-row kpi-3">
          <div className="kpi-card c-blue"><div className="kpi-label">件数（見積 ／ 成約）</div><div className="kpi-val">{estCount}<span>件</span> <span style={{ fontSize: 14, color: '#64748B' }}>/ {conCount}件</span></div></div>
          <div className="kpi-card c-teal"><div className="kpi-label">合計金額（一覧全体）</div><div className="kpi-val" style={{ fontSize: 18 }}>{yen(sumAll)}</div></div>
          <div className="kpi-card c-orange"><div className="kpi-label">成約 合計金額</div><div className="kpi-val" style={{ fontSize: 18 }}>{yen(sumCon)}</div></div>
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
          <Field label="お名前 *"><input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="例：サンプル 太郎" /></Field>
          <Field label="フリガナ"><input style={inputStyle} value={form.kana} onChange={e => set('kana', e.target.value)} placeholder="例：サンプル タロウ" /></Field>
        </div>
        {/* 見積書レイアウトの上段に出る項目。リード/成約から補完され、ここでの編集が優先される */}
        <div className="three-col" style={{ marginTop: 6 }}>
          <Field label="年代・性別"><input style={inputStyle} value={form.ageGender} onChange={e => set('ageGender', e.target.value)} placeholder="例：30代・男性" /></Field>
          <Field label="職業"><input style={inputStyle} value={form.job} onChange={e => set('job', e.target.value)} /></Field>
          <Field label="メールアドレス"><input style={inputStyle} value={form.email} onChange={e => set('email', e.target.value)} /></Field>
        </div>
        <div className="two-col" style={{ marginTop: 6 }}>
          <Field label="引越し人数"><input style={inputStyle} value={form.persons} onChange={e => set('persons', e.target.value)} placeholder="例：3人" /></Field>
          <Field label="引越し時間"><input style={inputStyle} value={form.moveTime} onChange={e => set('moveTime', e.target.value)} placeholder="例：午前" /></Field>
        </div>

        <div style={{ marginTop: 12, fontWeight: 700, fontSize: 12, color: '#1E5FA8' }}>［A］現住所</div>
        <div className="two-col" style={{ marginTop: 6 }}>
          <Field label="〒">
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={inputStyle} value={form.fromZip} onChange={e => set('fromZip', e.target.value)} placeholder="815-0000" />
              <button type="button" className="btn btn-outline btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => lookupZip('from')} disabled={zipBusy === 'from'} title="住所から郵便番号を取得">{zipBusy === 'from' ? '…' : '住所から'}</button>
            </div>
          </Field>
          <Field label="住所"><input style={inputStyle} value={form.fromAddress} onChange={e => set('fromAddress', e.target.value)} placeholder="福岡市南区…" /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 6 }}>
          <Field label="電話（自宅）"><input style={inputStyle} value={form.fromTelHome} onChange={e => set('fromTelHome', e.target.value)} /></Field>
          <Field label="電話（勤務先）"><input style={inputStyle} value={form.fromTelWork} onChange={e => set('fromTelWork', e.target.value)} /></Field>
          <Field label="携帯電話"><input style={inputStyle} value={form.fromTelMobile} onChange={e => set('fromTelMobile', e.target.value)} placeholder="090-…" /></Field>
        </div>
        <div className="four-col" style={{ marginTop: 6 }}>
          <Field label="建物種別"><input style={inputStyle} value={form.fromType} onChange={e => set('fromType', e.target.value)} placeholder="マンション" /></Field>
          <Field label="建物階数"><input style={inputStyle} value={form.fromFloor} onChange={e => set('fromFloor', e.target.value)} /></Field>
          <Field label="エレベーター"><input style={inputStyle} value={form.fromElevator} onChange={e => set('fromElevator', e.target.value)} placeholder="あり／なし" /></Field>
          <Field label="間取り"><input style={inputStyle} value={form.fromLayout} onChange={e => set('fromLayout', e.target.value)} placeholder="2LDK" /></Field>
        </div>

        <div style={{ marginTop: 14, fontWeight: 700, fontSize: 12, color: '#0E8A7A' }}>［B］転居先</div>
        <div className="two-col" style={{ marginTop: 6 }}>
          <Field label="〒">
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={inputStyle} value={form.toZip} onChange={e => set('toZip', e.target.value)} placeholder="819-0000" />
              <button type="button" className="btn btn-outline btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => lookupZip('to')} disabled={zipBusy === 'to'} title="転居先の住所から郵便番号を取得">{zipBusy === 'to' ? '…' : '住所から'}</button>
            </div>
          </Field>
          <Field label="住所"><input style={inputStyle} value={form.toAddress} onChange={e => set('toAddress', e.target.value)} placeholder="福岡市南区…" /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 6 }}>
          <Field label="電話（自宅）"><input style={inputStyle} value={form.toTelHome} onChange={e => set('toTelHome', e.target.value)} /></Field>
          <Field label="電話（勤務先）"><input style={inputStyle} value={form.toTelWork} onChange={e => set('toTelWork', e.target.value)} /></Field>
          <Field label="携帯電話"><input style={inputStyle} value={form.toTelMobile} onChange={e => set('toTelMobile', e.target.value)} /></Field>
        </div>
        <div className="four-col" style={{ marginTop: 6 }}>
          <Field label="建物種別"><input style={inputStyle} value={form.toType} onChange={e => set('toType', e.target.value)} placeholder="戸建て" /></Field>
          <Field label="建物階数"><input style={inputStyle} value={form.toFloor} onChange={e => set('toFloor', e.target.value)} /></Field>
          <Field label="エレベーター"><input style={inputStyle} value={form.toElevator} onChange={e => set('toElevator', e.target.value)} placeholder="あり／なし" /></Field>
          <Field label="間取り"><input style={inputStyle} value={form.toLayout} onChange={e => set('toLayout', e.target.value)} placeholder="3LDK" /></Field>
        </div>

        <div style={{ marginTop: 14, fontWeight: 700, fontSize: 12, color: '#1E5FA8' }}>［C］見積書に印刷する内容</div>
        <div style={{ marginTop: 6 }}>
          <Field label="備考・その他希望">
            <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={form.request} onChange={e => set('request', e.target.value)} />
          </Field>
        </div>
        <div className="two-col" style={{ marginTop: 6 }}>
          <Field label="料金（空欄なら合計金額を印刷）"><input style={inputStyle} value={form.priceText} onChange={e => set('priceText', e.target.value)} placeholder="例：89,000円 〜 150,000円" /></Field>
          <Field label="依頼作業（チェックしたものを印刷）">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', padding: '6px 0' }}>
              {WORK_ITEMS.map(w => (
                <label key={w} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={!!form.works?.[w]}
                    onChange={e => set('works', { ...(form.works || {}), [w]: e.target.checked })} />
                  {w}
                </label>
              ))}
            </div>
          </Field>
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
  // 家財は「数量が1以上のものだけ」を4分類に振り分けて出す。
  // 最終見積のため、0の品目は帳票に載せない。
  const byBucket = {}
  KAZAI_BUCKETS.forEach(b => { byBucket[b] = [] })
  ALL_ITEMS.forEach(it => {
    const qty = num(form.items[it.key])
    if (qty > 0) byBucket[bucketOf(it.key)].push({ ...it, qty })
  })
  const shownBuckets = KAZAI_BUCKETS.filter(b => byBucket[b].length > 0)
  const works = form.works || {}
  // 料金：手入力があればそれを、無ければ合計金額。どちらも無ければ空欄（¥0とは出さない）
  const priceText = form.priceText || (totals.saikei > 0 ? yen(totals.saikei) : '')
  // 引越し時間：未指定なら AM/PM を日本語表記に置き換える
  const moveTimeText = form.moveTime || (form.moveDate ? ({ AM: '午前', PM: '午後' }[form.moveAP] || '') : '')

  // 罫線つきセル（帳票の見た目に合わせる）
  const bd = '1px solid #9AA3AB'
  const cell = { border: bd, padding: '4px 7px', fontSize: 11, verticalAlign: 'middle' }
  const lab  = { ...cell, background: '#F4F6F8', fontWeight: 700, whiteSpace: 'nowrap', width: 92 }
  const val  = { ...cell, minWidth: 90 }
  // ブロックごとの色帯（元帳票：顧客=グレー、住所=オレンジ、詳細=水色）
  const band = (color) => ({ borderLeft: `4px solid ${color}` })

  return (
    <div style={{ ...modalOverlay, alignItems: 'flex-start', overflow: 'auto', padding: 0 }}>
      <div style={{ width: '100%', minHeight: '100%', background: '#525659', padding: '16px 0' }}>
        <div className="no-print" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
          <button className="btn btn-outline" style={{ background: '#fff' }} onClick={onClose}>← 戻る</button>
          <button className="btn btn-primary" onClick={() => window.print()}>🖨 印刷 / PDF</button>
        </div>

        <div className="print-area" style={{ width: 780, maxWidth: '96%', margin: '0 auto', background: '#fff', padding: 24, color: '#111', fontFamily: "'Noto Sans JP', sans-serif" }}>
          {/* 見出し */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 2 }}>見積書</div>
            <div style={{ textAlign: 'right', fontSize: 10, lineHeight: 1.5 }}>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{COMPANY.name}</div>
              <div>{COMPANY.zip} {COMPANY.address}</div>
              <div>TEL {COMPANY.tel} ／ FAX {COMPANY.fax}</div>
              <div>見積番号 {form.estimateNo}　見積日 {form.estimateDate || '―'}</div>
            </div>
          </div>

          {/* ── 顧客情報（グレー帯）── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', ...band('#9AA3AB') }}>
            <tbody>
              <tr>
                <td style={lab}>フリガナ</td><td style={val} colSpan={3}>{form.kana}</td>
              </tr>
              <tr>
                <td style={lab}>名前</td><td style={val}>{form.name ? `${form.name} 様` : ''}</td>
                <td style={lab}>引越し日</td><td style={val}>{form.moveDate || ''}</td>
              </tr>
              <tr>
                <td style={lab}>電話番号</td><td style={val}>{form.fromTelMobile || form.fromTelHome || ''}</td>
                <td style={lab}>引越し時間</td><td style={val}>{moveTimeText}</td>
              </tr>
              <tr>
                <td style={lab}>年代・性別</td><td style={val}>{form.ageGender}</td>
                <td style={lab}>引越し人数</td><td style={val}>{form.persons}</td>
              </tr>
              <tr>
                <td style={lab}>職業</td><td style={val}>{form.job}</td>
                <td style={lab}>メールアドレス</td><td style={val}>{form.email}</td>
              </tr>
            </tbody>
          </table>

          {/* ── 現住所 / 引越し先（オレンジ帯）── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6, ...band('#F0A868') }}>
            <tbody>
              <tr>
                <td style={{ ...lab, background: '#FDF1E4' }} colSpan={2}>現住所</td>
                <td style={{ ...lab, background: '#FDF1E4' }} colSpan={2}>引越し先</td>
              </tr>
              <tr>
                <td style={lab}>郵便番号</td><td style={val}>{form.fromZip}</td>
                <td style={lab}>郵便番号</td><td style={val}>{form.toZip}</td>
              </tr>
              <tr>
                <td style={lab}>住所</td><td style={val}>{form.fromAddress}</td>
                <td style={lab}>住所</td><td style={val}>{form.toAddress}</td>
              </tr>
              <tr>
                <td style={lab}>建物種別</td><td style={val}>{form.fromType}</td>
                <td style={lab}>建物種別</td><td style={val}>{form.toType}</td>
              </tr>
              <tr>
                <td style={lab}>建物階数</td><td style={val}>{form.fromFloor}</td>
                <td style={lab}>建物階数</td><td style={val}>{form.toFloor}</td>
              </tr>
              <tr>
                <td style={lab}>エレベーター</td><td style={val}>{form.fromElevator}</td>
                <td style={lab}>エレベーター</td><td style={val}>{form.toElevator}</td>
              </tr>
              <tr>
                <td style={lab}>間取り</td><td style={val}>{form.fromLayout}</td>
                <td style={lab}>間取り</td><td style={val}>{form.toLayout}</td>
              </tr>
            </tbody>
          </table>

          {/* ── 詳細内容（水色帯）── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6, ...band('#6BB8CC') }}>
            <tbody>
              <tr><td style={{ ...lab, background: '#E6F4F8' }} colSpan={6}>詳細内容</td></tr>
              <tr>
                <td style={lab}>備考・その他希望</td>
                <td style={{ ...cell, whiteSpace: 'pre-wrap' }} colSpan={5}>{form.request}</td>
              </tr>
              <tr>
                <td style={lab}>料金</td>
                <td style={{ ...cell, fontWeight: 800 }} colSpan={5}>{priceText}</td>
              </tr>
              {/* 依頼作業：チェック形式 */}
              <tr>
                <td style={lab} rowSpan={2}>依頼作業</td>
                {WORK_ITEMS.slice(0, 5).map(w => (
                  <td key={w} style={{ ...cell, textAlign: 'center', fontSize: 10 }}>
                    <span style={{ fontWeight: 800, marginRight: 3 }}>{works[w] ? '☑' : '☐'}</span>{w}
                  </td>
                ))}
              </tr>
              <tr>
                {WORK_ITEMS.slice(5).map(w => (
                  <td key={w} style={{ ...cell, textAlign: 'center', fontSize: 10 }}>
                    <span style={{ fontWeight: 800, marginRight: 3 }}>{works[w] ? '☑' : '☐'}</span>{w}
                  </td>
                ))}
                <td style={cell} colSpan={5 - WORK_ITEMS.slice(5).length} />
              </tr>
              {/* 家財：0の品目は載せない。「家財」ラベルは全行にまたがる */}
              {shownBuckets.length === 0 ? (
                <tr><td style={lab}>家財</td><td style={cell} colSpan={5}>（記載なし）</td></tr>
              ) : (() => {
                // 先に「行」を平坦化してから描画する（分類ごとに4品目ずつ折り返す）
                const rows = []
                shownBuckets.forEach(b => {
                  const list = byBucket[b]
                  const n = Math.ceil(list.length / 4)
                  for (let r = 0; r < n; r++) {
                    rows.push({ bucket: b, span: r === 0 ? n : 0, cells: list.slice(r * 4, r * 4 + 4) })
                  }
                })
                return rows.map((row, i) => (
                  <tr key={i}>
                    {i === 0 && <td style={lab} rowSpan={rows.length}>家財</td>}
                    {row.span > 0 && (
                      <td style={{ ...lab, width: 62, background: '#FAFBFC' }} rowSpan={row.span}>{row.bucket}</td>
                    )}
                    {Array.from({ length: 4 }).map((_, c) => {
                      const it = row.cells[c]
                      return (
                        <td key={c} style={{ ...cell, fontSize: 10 }}>
                          {it ? (<span>{it.name}{sizeText(it.size)}　<b>{it.qty}</b></span>) : ''}
                        </td>
                      )
                    })}
                  </tr>
                ))
              })()}
            </tbody>
          </table>

          {/* お約束・支払い */}
          {form.memo && form.memo !== form.request && <div style={{ marginTop: 8, fontSize: 10 }}>備考：{form.memo}</div>}
          {form.requestTo && <div style={{ marginTop: 2, fontSize: 10 }}>お約束事項：{form.requestTo}</div>}
          <div style={{ marginTop: 8, fontSize: 10, color: '#333' }}>
            お支払いは、積込終了時にお願い致します。{form.payment ? `（${form.payment}）` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
