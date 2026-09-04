import { useState, useEffect, useMemo, useRef } from 'react'
import { DEMO_CONTRACTS } from '../lib/demoData'
import { GMAPS_KEY, zipFromAddress } from '../lib/gmaps'
import ModalPortal from '../components/ModalPortal'

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
 * ptIn: true = 原本の才数欄が空で、その都度書き込む行（書いた才数×数量を合計に入れる）
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
      { key: 'tv_brown',     name: 'TVブラ',         size: '( )',   pt: null, ptIn: true },
      { key: 'tv_thin',      name: 'TV薄型',         size: '( )',   pt: null, ptIn: true },
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
  'ピアノ・エレクトーン': 'piano_U', 'ピアノ': 'piano_U', 'エレクトーン': 'electone_B',
  // 手入力・成約データで出てくる言い回し
  'ダイニングテーブル': 'dining_A', 'ダイニングセット': 'dining_A', 'テレビ台': 'tvdai',
  'カラーボックス': 'colorbox', '姿見': 'sugatami', '物置': 'monooki_A', '布団袋': 'futonbukuro',
}
// 表記ゆれ（全角半角・空白・長音・「類」）を吸収した見出し語にする。
// 例：ソファー（2人掛け）→ ソファ（2人掛け）、タンス類（大）→ タンス（大）
const canonKazai = (s) => String(s || '').normalize('NFKC').replace(/[\s　]/g, '')
  .replace(/\(/g, '（').replace(/\)/g, '）')
  .replace(/ー(?=（|$)/g, '')
  .replace(/類(?=（|$)/g, '')
// 見積書語彙そのものの一致（保険）。「ソファー2人用」「ソファー（2人用）」どちらでも引ける
const ITEM_NAME_TO_KEY = (() => {
  const m = {}
  const put = (k, v) => { const c = canonKazai(k); if (c && !(c in m)) m[c] = v }
  ALL_ITEMS.forEach(it => {
    if (it.size) { put(`${it.name}（${it.size}）`, it.key); put(`${it.name}${it.size}`, it.key) }
    put(it.name, it.key)
  })
  return m
})()
const LEAD_KEY_CANON = (() => {
  const m = {}
  for (const [k, v] of Object.entries(LEAD_KAZAI_TO_KEY)) m[canonKazai(k)] = v
  return m
})()
// 家財名 → 見積書品目キー（表記ゆれを吸収 → カッコ前のベース名 の順）
function resolveKazaiKey(name) {
  if (!name) return null
  const c = canonKazai(name)
  const base = c.replace(/（.*$/, '')
  return LEAD_KEY_CANON[c] || ITEM_NAME_TO_KEY[c] || LEAD_KEY_CANON[base] || ITEM_NAME_TO_KEY[base] || null
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
  { key: 'lightron', label: 'ライトロン・クレープ紙' },
  { key: 'aircap',   label: 'エアーキャップ' },
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

const PAY_METHODS = ['', '現金', '前受金', '会社請求', 'カード']
// 帳票側の選択肢とそろえる
// 帳票の家財表で原本から空欄になっている升の数（列4に1・列5に10）。ここに特殊家財を書ける
const KZX_MAX = 11
const SEND_ITEMS = ['直送一式', '直送長距離', '限定', '混載便', '積切']
const SEND_LABEL = { 直送一式: '直送一式', 直送長距離: '直送・長距離', 限定: '限定', 混載便: '混載便', 積切: '積切' }
const PIANO_OPTS = ['階段', 'エレベーター', '窓出し', '機械']
const SM_OPTS = ['S', 'M']
const MEDIA_ITEMS = ['電波', 'net', 'HP', '不動産', '電話帳', '法人名', 'DM', '再利用', 'チラシ', '紹介']
const SECRET_ITEMS = ['車輌', '資材', '制服', '引越先']
const GEAR_ITEMS = ['ロープ', 'ハシゴ', '工　具', '台　車', '養生資材']
// 荷造資材（帳票の「荷造資材」ブロック。列は 予定1／予定2／作業当日）
const MATERIAL_ROWS = [
  ['mtSmall', '小'], ['mtMid', '中'], ['mtWa', '和'], ['tape', 'ガムテープ'], ['futon', 'ふとん袋'],
  ['hbox', 'ハンガーボックス'], ['lightron', 'ライトロンクレープ紙'], ['aircap', 'エアーキャップ'],
]
const PERSON_CHOICES = ['お客様', '当社']
const ROAD_CHOICES = ['', 'S', 'M', 'L']
const YN = ['', '有', '無']
const REQ_CHOICES = ['', '要', '不要']

const TAX_RATE = 0.1

// 見積書の作成タブ（押したタブの内容だけ表示し、保存で次のタブへ進む）
const EST_STEPS = [
  { id: 'basic',    label: '基本' },
  { id: 'customer', label: '顧客' },
  { id: 'work',     label: '作業' },
  { id: 'kazai',    label: '家財' },
  { id: 'fee',      label: '料金' },
  { id: 'pay',      label: '支払・備考' },
]

// 空フォーム
function emptyForm() {
  return {
    estimateNo: '',
    // 基本情報
    estimateDate: '', estimator: '',
    moveDate: '', moveAP: 'AM',
    deliverDate: '', deliverAP: 'AM',
    packDate: '', openDate: '',
    sendTypes: [], distanceKm: '',
    // 顧客
    name: '', kana: '',
    fromZip: '', fromAddress: '', fromFurigana: '', fromTelHome: '', fromTelWork: '', fromTelMobile: '',
    toZip: '', toAddress: '', toFurigana: '', toTelHome: '', toTelWork: '', toTelMobile: '',
    // 受付・伝票（帳票の左上まわり）
    reception1: '', reception2: '', requestDate: '', frontNote: '',
    spaceSize: '', workLoad: '', packOpenCar: '', helperCar: '',
    confirmDate: '', confirmerName: '', refName: '',
    bizMove: false, bizClean: false, bizReuse: false, bizOther: '',
    media: [], mediaReuseCount: '',      // 媒体（複数選択）
    secret: [],                          // シークレット（複数選択）
    // 時刻（各日程）
    moveHour: '', packHour: '', deliverHour: '', unpackHour: '',
    packAP: '', unpackAP: '',
    // 作業内容の確認
    packSmallBy: 'お客様', packFurniBy: '当社', packOpenBy: 'お客様',
    packSmallOpt: [], packFurniOpt: [], packOpenOpt: [],   // （ALL・Part）（D・E）
    pianoCurOpt: [], pianoDstOpt: [],                      // 階段／エレベーター／窓出し／機械
    acSepFrom: [], acSepTo: [], acWinFrom: [], acWinTo: [],// エアコンの S・M
    antennaOpt: [], washerOpt: [],                         // アンテナ（脱・着）／洗濯機付（ドラム・全自動）
    pianoWork: '', airconSep: '', airconWindow: '', optionWork: '',
    airconSepTo: '', airconWindowTo: '',   // エアコン移設の台数は取外住所・取付住所で別々
    pianoCur: false, pianoDst: false, airconRemove: false, airconInstall: false,
    // 作業状況：現地[C]／行先[D] を別々に持つ（帳票が2段のため）
    twoPlace: '', roadWidth: '', elevator: '', windowLift: '', machine: '',
    roadWidthM: '', elevatorM: '',
    twoPlaceD: '', roadWidthD: '', roadWidthDM: '', elevatorD: '', elevatorDM: '', windowLiftD: '', machineD: '',
    moveFloorFrom: '', moveFloorTo: '', pianoFloorFrom: '', pianoFloorTo: '',
    // 家財数量
    items: {},
    pts: {},              // 原本の才数欄が空の行（TVブラ・TV薄型）に書き込む才数
    memos: {},            // 家財表の右列（品目ごとの2〜3文字のメモ）{ key: 'S' }
    extraKazai: [],       // 特殊家財（帳票の空き升に手書きする行）[{ name, pt, qty }]
    unmatchedKazai: [],   // 自由記入行にも入りきらなかった家財（上限超過ぶん）
    // 荷造資材（数量：予定1／予定2／作業当日）と用具
    mats: {}, gear: [], createDate: '', delivDate: '', storageUntil: '',
    // 料金（すべて手入力）
    feeA: {}, feeB: {}, feeC: {}, feeD: {},
    feeCx: {},   // 資材の料金の 数量①／数量②／金額②（金額① は feeC）
    // 請求先
    billName: '', billConfirm: '', billConfirmDate: '', billConfirmAmPm: '', billConfirmName: '', billAddr: '', billClose: '', billPay: '',
    pianoUG: '', pianoCurNote: '', pianoDstNote: '',
    billTel: '', billStaff: '', billSend: '',
    // その他
    memo: '', requestTo: '', payment: '',
    status: '作成中',
    // 成約管理由来の場合に元レコードを参照（重複表示防止に使う）
    contractId: '',
    // 見積書モーダルで書いた帳票の中身そのもの（開き直したときはこれを優先して戻す）
    paper: null,
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


/* -------------------------------------------------------------------------
 * 印刷プレビュー：原本再現の帳票フォーム（/estimate-form/）へデータを渡して開く。
 * 帳票側は localStorage のデータを読み込んで各欄へ流し込む。
 * ----------------------------------------------------------------------- */
const PRINT_FORM_KEY = 'transportfukuoka:estimatePrint'
// 家財キーの名称差（見積タブ → 帳票フォーム）
const PRINT_KEY_MAP = {
  bunkbed: 'bed2', sofa_3: 'sofa3', sofa_2: 'sofa2', sofa_1: 'sofa1',
  getabako: 'getabako_T', getabako_y: 'getabako_Y', juutan: 'jutan',
  kitchencnt: 'kitchen_c', dining_A: 'shokutaku_A', dining_B: 'shokutaku_B',
  table: 'table_wy',
}
// 「9/20」「9／20」「9月20日」「2026-09-20」→ 月／日。数字や「末」だけなら日の欄へ
function splitMD(v) {
  const s = String(v || '').trim(); if (!s) return { m: '', d: '' }
  let m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(s); if (m) return { m: String(+m[2]), d: String(+m[3]) }
  m = /^(\d{1,2})\s*[\/／月]\s*(\d{1,2}|末)/.exec(s); if (m) return { m: String(+m[1]), d: m[2] }
  return { m: '', d: s.replace(/日.*$/, '') }
}
// 「2026-10-31」「2026/10/31」「2026 10 31」「26.10.31」→ 年(下2桁)／月／日
function splitYMD(v) {
  const s = String(v || '').trim(); if (!s) return { y: '', m: '', d: '' }
  const m = /^(\d{2}|\d{4})\s*[-/.年\s]\s*(\d{1,2})\s*[-/.月\s]\s*(\d{1,2})/.exec(s)
  if (!m) return { y: s, m: '', d: '' }
  return { y: m[1].slice(-2), m: String(+m[2]), d: String(+m[3]) }
}
// 「2026-09-10」「2026/9/10 14:30」「2026年9月10日」→ 2026-09-10。
// 年の無い「9/26 10:00」（リードの受付日時）は hint の年を使う。取れなければ空
function ymd(v, hint) {
  const s = String(v || '')
  const m = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`
  const md = /^\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/.exec(s)
  const y = (/(\d{4})/.exec(String(hint || '')) || [])[1]
  return (md && y) ? `${y}-${String(+md[1]).padStart(2, '0')}-${String(+md[2]).padStart(2, '0')}` : ''
}
function splitDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '')
  return m ? { year: m[1].slice(2), month: String(Number(m[2])), day: String(Number(m[3])) } : { year: '', month: '', day: '' }
}
// 帳票の狭い欄向けの整形。「2026-09-01」→「26.9.1」／「9」（月日欄用）
const DOW = ['日', '月', '火', '水', '木', '金', '土']
const dowOf = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); return isNaN(d) ? '' : DOW[d.getDay()] }
function buildPrintData(form) {
  const d = {}
  const put = (k, v) => { if (v !== undefined && v !== null && v !== '') d[k] = v }
  // 顧客
  put('customerName', form.name); put('customerFurigana', form.kana)
  put('currentPostal', form.fromZip); put('currentAddress', form.fromAddress)
  put('curTelHome', form.fromTelHome); put('curTelWork', form.fromTelWork); put('curTelMobile', form.fromTelMobile)
  put('destPostal', form.toZip); put('destAddress', form.toAddress)
  put('dstTelHome', form.toTelHome); put('dstTelWork', form.toTelWork); put('dstTelMobile', form.toTelMobile)
  put('customerFurigana', form.kana)
  put('currentFurigana', form.fromFurigana); put('destFurigana', form.toFurigana)
  // 日程（時刻・AM/PMも）
  const mv = splitDate(form.moveDate); put('moveMonth', mv.month); put('moveDay', mv.day); put('moveAmPm', form.moveAP); put('moveHour', form.moveHour)
  const dv = splitDate(form.deliverDate); put('deliverMonth', dv.month); put('deliverDay', dv.day); put('deliverAmPm', form.deliverAP); put('deliverHour', form.deliverHour)
  const pk = splitDate(form.packDate); put('packMonth', pk.month); put('packDay', pk.day); put('packAmPm', form.packAP); put('packHour', form.packHour)
  const op = splitDate(form.openDate); put('unpackMonth', op.month); put('unpackDay', op.day); put('unpackAmPm', form.unpackAP); put('unpackHour', form.unpackHour)
  // 見積日・受付日は年／月／日の3枠に分けて渡す（年は下2桁）
  const ed = splitDate(form.estimateDate)
  put('estimateYear', ed.year); put('estimateMonth', ed.month); put('estimateDay', ed.day)
  const rd = splitDate(form.requestDate)
  put('requestYear', rd.year); put('requestMonth', rd.month); put('requestDay', rd.day)
  put('estimatorName', form.estimator)
  ;(form.sendTypes || []).forEach(v => { d['send_' + v] = true })
  put('distanceKm', form.distanceKm)
  // 受付・伝票まわり
  put('reception1', form.reception1); put('reception2', form.reception2)
  put('frontNote', form.frontNote)
  put('spaceSize', form.spaceSize)
  // 紙は「?〜?」「?／?」の2枠なので分けて渡す
  { const [a, b] = String(form.workLoad || '').split(/[~〜～]/); put('workLoadFrom', b == null ? '' : a); put('workLoad', b == null ? a : b) }
  { const [a, b] = String(form.packOpenCar || '').split(/[\/／]/); put('packOpenFrom', b == null ? '' : a); put('packOpenCar', b == null ? a : b) }
  put('helperCar', form.helperCar)
  const cf = splitDate(form.confirmDate)
  put('confirmMonth', cf.month); put('confirmDay', cf.day); put('confirmDow', dowOf(form.confirmDate))
  put('confirmerName', form.confirmerName)
  put('refName', form.refName)
  if (form.bizMove) d.bizMove = true
  if (form.bizClean) d.bizClean = true
  if (form.bizReuse) d.bizReuse = true
  put('bizOther', form.bizOther)
  ;(form.media || []).forEach(v => { d['media_' + v] = true })
  put('mediaReuseCount', form.mediaReuseCount)
  ;(form.secret || []).forEach(v => { d['secret_' + v] = true })
  // 作業内容の確認・作業状況
  put('packSmallBy', form.packSmallBy); put('packFurniBy', form.packFurniBy); put('packOpenBy', form.packOpenBy)
  ;(form.packSmallOpt || []).forEach(v => { d['small_' + v] = true })
  ;(form.packFurniOpt || []).forEach(v => { d['furni_' + v] = true })
  ;(form.packOpenOpt || []).forEach(v => { d['open_' + v] = true })
  // ピアノ行の 階段／エレベーター／窓出し／機械（現住所側・届先側）
  const PMAP = { 階段: 'step', エレベーター: 'elev', 窓出し: 'win', 機械: 'mach' }
  ;(form.pianoCurOpt || []).forEach(v => { if (PMAP[v]) d[PMAP[v] + 'Cur'] = true })
  ;(form.pianoDstOpt || []).forEach(v => { if (PMAP[v]) d[PMAP[v] + 'Dst'] = true })
  // エアコンの S・M
  ;(form.acSepFrom || []).forEach(v => { d['SepFrom_' + v] = true })
  ;(form.acSepTo   || []).forEach(v => { d['SepTo_' + v] = true })
  ;(form.acWinFrom || []).forEach(v => { d['WinFrom_' + v] = true })
  ;(form.acWinTo   || []).forEach(v => { d['WinTo_' + v] = true })
  ;(form.antennaOpt || []).forEach(v => { d['antenna_' + v] = true })
  ;(form.washerOpt  || []).forEach(v => { d['washer_' + v] = true })
  put('airconSepFrom', form.airconSep); put('airconSepTo', form.airconSepTo)
  put('airconWinFrom', form.airconWindow); put('airconWinTo', form.airconWindowTo)
  put('optionWork', form.optionWork)
  if (form.pianoCur) d.pianoCur = true
  if (form.pianoDst) d.pianoDst = true
  if (form.airconRemove) d.airconRemove = true
  if (form.airconInstall) d.airconInstall = true
  // 階数
  put('moveFloorFrom', form.moveFloorFrom); put('moveFloorTo', form.moveFloorTo)
  put('pianoFloorFrom', form.pianoFloorFrom); put('pianoFloorTo', form.pianoFloorTo)
  // 作業状況 [C]現地
  put('twoPlaceC', form.twoPlace)
  if (form.roadWidth) put('road' + form.roadWidth + 'C', form.roadWidthM || '')
  if (form.elevator) put('elevC', form.elevator)
  put('elevMC', form.elevatorM)
  if (form.windowLift) put('windowC', form.windowLift === 'F' || form.windowLift === '有' ? 'F' : '無')
  if (form.machine) put('machineC', form.machine)
  // 作業状況 [D]行先
  put('twoPlaceD', form.twoPlaceD)
  if (form.roadWidthD) put('road' + form.roadWidthD + 'D', form.roadWidthDM || '')
  if (form.elevatorD) put('elevD', form.elevatorD)
  put('elevMD', form.elevatorDM)
  if (form.windowLiftD) put('windowD', form.windowLiftD === 'F' || form.windowLiftD === '有' ? 'F' : '無')
  if (form.machineD) put('machineD', form.machineD)
  // 家財数量
  for (const [k, v] of Object.entries(form.items || {})) {
    if (num(v) > 0) d['kz_' + (PRINT_KEY_MAP[k] || k)] = v
  }
  // 家財表の右列（メモ）
  for (const [k, m] of Object.entries(form.memos || {})) {
    if (String(m || '').trim()) d['kz_' + (PRINT_KEY_MAP[k] || k) + '_x'] = String(m).trim()
  }
  // 原本の才数欄が空の行に書き込む才数
  for (const [k, v] of Object.entries(form.pts || {})) {
    if (String(v || '').trim()) d['kz_' + (PRINT_KEY_MAP[k] || k) + '_pt'] = String(v).trim()
  }
  // 料金
  for (const f of FEE_A) put('feeA_' + f.key, form.feeA?.[f.key])
  for (const f of FEE_B) put('feeB_' + f.key, form.feeB?.[f.key])
  for (const f of FEE_C) {
    const x = form.feeCx?.[f.key] || {}
    put('feeC_' + f.key + '_amt1', form.feeC?.[f.key]); put('feeC_' + f.key + '_qty1', x.q1)
    put('feeC_' + f.key + '_qty2', x.q2); put('feeC_' + f.key + '_amt2', x.a2)
  }
  for (const f of FEE_D) put('feeD_' + f.key, form.feeD?.[f.key])
  // 特殊家財（帳票の空き升への自由記入行）
  ;(form.extraKazai || []).slice(0, KZX_MAX).forEach((r, i) => {
    if (!r || (!r.name && !r.qty)) return
    put('kzx' + (i + 1) + '_name', r.name)
    put('kzx' + (i + 1) + '_pt', r.pt)
    put('kzx' + (i + 1) + '_qty', r.qty)
    put('kzx' + (i + 1) + '_x', r.x)
  })
  // 荷造資材（予定1／予定2／作業当日）と用具
  for (const [key] of MATERIAL_ROWS) {
    put('mat_' + key + '_d1', form.mats?.[key + '_d1'])
    put('mat_' + key + '_d2', form.mats?.[key + '_d2'])
    put('mat_' + key + '_day', form.mats?.[key + '_day'])
  }
  ;(form.gear || []).forEach(g => { d['gear_' + g.replace(/\s/g, '')] = true })
  put('createDate', form.createDate); put('delivDate', form.delivDate)
  { const s = splitYMD(form.storageUntil); put('storageYear', s.y); put('storageMonth', s.m); put('storageDay', s.d) }
  // 請求先
  put('billName', form.billName); put('billAddr', form.billAddr); put('billTel', form.billTel); put('billStaff', form.billStaff)
  // 紙は 月／日 のスロットなので分けて渡す
  { const c = splitDate(form.billConfirmDate); put('billConfirmM', c.month); put('billConfirmD', c.day) }
  put('billConfirmAmPm', form.billConfirmAmPm); put('billConfirmHour', form.billConfirm); put('billConfirmName', form.billConfirmName)
  ;['billClose', 'billPay', 'billSend'].forEach(k => { const s = splitMD(form[k]); put(k + 'M', s.m); put(k + 'D', s.d) })
  put('pianoUG', form.pianoUG)
  put('pianoCurNote', form.pianoCurNote); put('pianoDstNote', form.pianoDstNote)
  // 支払・備考
  put('payMethod', form.payment)
  put('promiseText', form.memo)
  return d
}
/* 帳票 → 見積フォーム（buildPrintData の逆）。
   見積書モーダルで直接書き換えた内容を、見積タブ・一覧・他タブが読める形に戻す。
   帳票にしか無い欄（月日だけで年が無い等）は base（開いたときのフォーム）から補う。 */
// 「月」「日」＋ base の年 → 2026-09-10。どちらか欠けたら空
function joinMD(base, m, d) {
  if (!Number.isFinite(Number(m)) || !Number.isFinite(Number(d)) || m === '' || d === '') return ''
  const y = (/^(\d{4})-/.exec(String(base || '')) || [])[1] || String(new Date().getFullYear())
  return `${y}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`
}
// 年（下2桁）＋月＋日 → 2026-09-10
function joinY2MD(y, m, d) {
  if (!y || !Number.isFinite(Number(m)) || !Number.isFinite(Number(d)) || m === '' || d === '') return ''
  return `20${String(y).slice(-2)}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`
}
function readPrintData(p, base) {
  const f = { ...emptyForm(), ...(base || {}) }
  const g = (k) => (p[k] === undefined || p[k] === null) ? '' : String(p[k])
  // 帳票の name="接頭辞_値" の 〇 を配列に戻す
  const picks = (prefix) => Object.keys(p).filter(k => k.startsWith(prefix) && p[k]).map(k => k.slice(prefix.length))
  // 顧客
  f.name = g('customerName'); f.kana = g('customerFurigana')
  f.fromZip = g('currentPostal'); f.fromAddress = g('currentAddress'); f.fromFurigana = g('currentFurigana')
  f.fromTelHome = g('curTelHome'); f.fromTelWork = g('curTelWork'); f.fromTelMobile = g('curTelMobile')
  f.toZip = g('destPostal'); f.toAddress = g('destAddress'); f.toFurigana = g('destFurigana')
  f.toTelHome = g('dstTelHome'); f.toTelWork = g('dstTelWork'); f.toTelMobile = g('dstTelMobile')
  // 日程（帳票は月日だけなので年は元のまま）
  f.moveDate = joinMD(base?.moveDate, p.moveMonth, p.moveDay); f.moveAP = g('moveAmPm'); f.moveHour = g('moveHour')
  f.deliverDate = joinMD(base?.deliverDate, p.deliverMonth, p.deliverDay); f.deliverAP = g('deliverAmPm'); f.deliverHour = g('deliverHour')
  f.packDate = joinMD(base?.packDate, p.packMonth, p.packDay); f.packAP = g('packAmPm'); f.packHour = g('packHour')
  f.openDate = joinMD(base?.openDate, p.unpackMonth, p.unpackDay); f.unpackAP = g('unpackAmPm'); f.unpackHour = g('unpackHour')
  f.estimateDate = joinY2MD(p.estimateYear, p.estimateMonth, p.estimateDay) || g('estimateDate')
  f.requestDate = joinY2MD(p.requestYear, p.requestMonth, p.requestDay) || g('requestDate')
  f.estimator = g('estimatorName')
  f.sendTypes = picks('send_'); f.distanceKm = g('distanceKm')
  // 受付・伝票
  f.reception1 = g('reception1'); f.reception2 = g('reception2'); f.frontNote = g('frontNote')
  f.spaceSize = g('spaceSize')
  f.workLoad = g('workLoadFrom') ? `${g('workLoadFrom')}〜${g('workLoad')}` : g('workLoad')
  f.packOpenCar = g('packOpenFrom') ? `${g('packOpenFrom')}／${g('packOpenCar')}` : g('packOpenCar')
  f.helperCar = g('helperCar')
  f.confirmDate = joinMD(base?.confirmDate, p.confirmMonth, p.confirmDay)
  f.confirmerName = g('confirmerName'); f.refName = g('refName')
  f.bizMove = !!p.bizMove; f.bizClean = !!p.bizClean; f.bizReuse = !!p.bizReuse; f.bizOther = g('bizOther')
  f.media = picks('media_'); f.mediaReuseCount = g('mediaReuseCount'); f.secret = picks('secret_')
  // 作業内容の確認
  f.packSmallBy = g('packSmallBy'); f.packFurniBy = g('packFurniBy'); f.packOpenBy = g('packOpenBy')
  f.packSmallOpt = picks('small_'); f.packFurniOpt = picks('furni_'); f.packOpenOpt = picks('open_')
  const PMAP_R = { step: '階段', elev: 'エレベーター', win: '窓出し', mach: '機械' }
  f.pianoCurOpt = Object.keys(PMAP_R).filter(k => p[k + 'Cur']).map(k => PMAP_R[k])
  f.pianoDstOpt = Object.keys(PMAP_R).filter(k => p[k + 'Dst']).map(k => PMAP_R[k])
  f.acSepFrom = picks('SepFrom_'); f.acSepTo = picks('SepTo_')
  f.acWinFrom = picks('WinFrom_'); f.acWinTo = picks('WinTo_')
  f.antennaOpt = picks('antenna_'); f.washerOpt = picks('washer_')
  f.airconSep = g('airconSepFrom'); f.airconSepTo = g('airconSepTo')
  f.airconWindow = g('airconWinFrom'); f.airconWindowTo = g('airconWinTo')
  f.optionWork = g('optionWork')
  f.pianoCur = !!p.pianoCur; f.pianoDst = !!p.pianoDst
  f.airconRemove = !!p.airconRemove; f.airconInstall = !!p.airconInstall
  f.moveFloorFrom = g('moveFloorFrom'); f.moveFloorTo = g('moveFloorTo')
  f.pianoFloorFrom = g('pianoFloorFrom'); f.pianoFloorTo = g('pianoFloorTo')
  f.pianoUG = g('pianoUG'); f.pianoCurNote = g('pianoCurNote'); f.pianoDstNote = g('pianoDstNote')
  // 作業状況（現地[C]／行先[D]）。道幅は S・M・L のどれに数字が入っているかで判定
  const road = (suf) => { const b = ['S', 'M', 'L'].find(x => p['road' + x + suf] !== undefined); return b ? [b, g('road' + b + suf)] : ['', ''] }
  f.twoPlace = g('twoPlaceC'); [f.roadWidth, f.roadWidthM] = road('C')
  f.elevator = g('elevC'); f.elevatorM = g('elevMC'); f.windowLift = g('windowC'); f.machine = g('machineC')
  f.twoPlaceD = g('twoPlaceD'); [f.roadWidthD, f.roadWidthDM] = road('D')
  f.elevatorD = g('elevD'); f.elevatorDM = g('elevMD'); f.windowLiftD = g('windowD'); f.machineD = g('machineD')
  // 家財の数量とメモ
  f.items = {}; f.memos = {}; f.pts = {}
  for (const it of ALL_ITEMS) {
    const pk = PRINT_KEY_MAP[it.key] || it.key
    if (p['kz_' + pk] !== undefined) f.items[it.key] = String(p['kz_' + pk])
    if (p['kz_' + pk + '_x'] !== undefined) f.memos[it.key] = String(p['kz_' + pk + '_x'])
    if (p['kz_' + pk + '_pt'] !== undefined) f.pts[it.key] = String(p['kz_' + pk + '_pt'])
  }
  // 特殊家財（帳票の空き升）
  f.extraKazai = []
  for (let i = 1; i <= KZX_MAX; i++) {
    const r = { name: g(`kzx${i}_name`), pt: g(`kzx${i}_pt`), qty: g(`kzx${i}_qty`), x: g(`kzx${i}_x`) }
    if (r.name || r.qty || r.pt) f.extraKazai.push(r)
  }
  // 料金
  f.feeA = {}; f.feeB = {}; f.feeC = {}; f.feeCx = {}; f.feeD = {}
  for (const x of FEE_A) if (p['feeA_' + x.key] !== undefined) f.feeA[x.key] = String(p['feeA_' + x.key])
  for (const x of FEE_B) if (p['feeB_' + x.key] !== undefined) f.feeB[x.key] = String(p['feeB_' + x.key])
  for (const x of FEE_D) if (p['feeD_' + x.key] !== undefined) f.feeD[x.key] = String(p['feeD_' + x.key])
  for (const x of FEE_C) {
    if (p[`feeC_${x.key}_amt1`] !== undefined) f.feeC[x.key] = String(p[`feeC_${x.key}_amt1`])
    const cx = { q1: g(`feeC_${x.key}_qty1`), q2: g(`feeC_${x.key}_qty2`), a2: g(`feeC_${x.key}_amt2`) }
    if (cx.q1 || cx.q2 || cx.a2) f.feeCx[x.key] = cx
  }
  // 荷造資材・用具
  f.mats = {}
  for (const [key] of MATERIAL_ROWS) for (const c of ['d1', 'd2', 'day'])
    if (p[`mat_${key}_${c}`] !== undefined) f.mats[`${key}_${c}`] = String(p[`mat_${key}_${c}`])
  f.gear = GEAR_ITEMS.filter(x => p['gear_' + x.replace(/\s/g, '')])
  f.createDate = g('createDate'); f.delivDate = g('delivDate')
  f.storageUntil = joinY2MD(p.storageYear, p.storageMonth, p.storageDay)
  // 請求先
  f.billName = g('billName'); f.billAddr = g('billAddr'); f.billTel = g('billTel'); f.billStaff = g('billStaff')
  f.billConfirmDate = joinMD(base?.billConfirmDate, p.billConfirmM, p.billConfirmD)
  f.billConfirmAmPm = g('billConfirmAmPm'); f.billConfirm = g('billConfirmHour'); f.billConfirmName = g('billConfirmName')
  const md = (k) => g(k + 'M') ? `${g(k + 'M')}/${g(k + 'D')}` : g(k + 'D')
  f.billClose = md('billClose'); f.billPay = md('billPay'); f.billSend = md('billSend')
  f.payment = g('payMethod'); f.memo = g('promiseText')
  return f
}
// 見積フォームに戻しきれない欄（TVの括弧内・資材の予定日・エアコンの外し／付け・
// カード備考・領収書宛先・道幅のS/M/L併記 など）だけを取り出す。
// これを保存しておけば、次に開いたときに帳票の見た目がそのまま戻る。
function paperResidue(paper, form) {
  const echo = buildPrintData(form)
  const out = {}
  for (const [k, v] of Object.entries(paper)) {
    if (k === '_calc') { if (Object.keys(v || {}).length) out._calc = v; continue }
    if (String(echo[k] ?? '') !== String(v ?? '')) out[k] = v
  }
  return Object.keys(out).length ? out : null
}

/* -----------------------------------------------------------------------
 * 見積書モーダル：原本どおりの帳票（/estimate-form/）をそのまま出して、
 * 利用者に直接書き込んでもらう。モーダルの外を触ったら保存して閉じる。
 * ----------------------------------------------------------------------- */
function PaperModal({ form, saving, onSave, onClose, onOpenDetail }) {
  const frameRef = useRef(null)
  const [h, setH] = useState(1123)
  const [ready, setReady] = useState(false)
  // 表示倍率。スマホでも字が潰れないよう既定は実寸（枠内で縦横に送る）
  const [z, setZ] = useState(1)
  // 開いたときに1回だけ流し込む。前に帳票で書いた内容（paper）があればそれを優先する
  const seed = useRef({ ...buildPrintData(form), ...(form.paper || {}) })

  useEffect(() => {
    const onMsg = (e) => { if (e.data && e.data.type === 'estimate:height') setH(e.data.height + 2) }
    addEventListener('message', onMsg)
    return () => removeEventListener('message', onMsg)
  }, [])
  // Esc でも保存して閉じる（モーダルの外を触ったときと同じ扱い）
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') save() }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const api = () => { try { return frameRef.current?.contentWindow?.estimateForm || null } catch { return null } }
  const onLoad = () => {
    const a = api(); if (a) { a.fill(seed.current); setReady(true) }
    // 実寸だと枠より広いので、左上から見えるようにしておく
    const box = frameRef.current?.parentElement
    if (box) { box.scrollTo(0, 0); setTimeout(() => box.scrollTo(0, 0), 60) }
  }
  // 帳票の中身を読み出して保存する。読めなかったときは黙って閉じずに知らせる
  const save = () => { const a = api(); onSave(a ? a.read() : null) }

  return (
    <ModalPortal><div style={ovl} onMouseDown={e => { if (e.target === e.currentTarget) save() }}>
      <div style={paperBox}>
        <div style={paperBar}>
          <b style={{ fontSize: 14 }}>御見積書</b>
          <span className="pm-hint" style={{ fontSize: 12, color: '#64748B' }}>{form.estimateNo}　{form.name ? form.name + ' 様' : ''}</span>
          <span style={{ flex: 1 }} />
          <span className="pm-hint" style={{ fontSize: 11, color: '#94A3B8' }}>枠の外を触ると保存して閉じます</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <button className="btn btn-outline btn-sm" title="縮小" onClick={() => setZ(v => Math.max(0.4, +(v - 0.1).toFixed(2)))}>−</button>
            <button className="btn btn-outline btn-sm" style={{ minWidth: 52 }} onClick={() => setZ(1)}>{Math.round(z * 100)}%</button>
            <button className="btn btn-outline btn-sm" title="拡大" onClick={() => setZ(v => Math.min(2, +(v + 0.1).toFixed(2)))}>＋</button>
          </span>
          <button className="btn btn-outline btn-sm" disabled={!ready}
            onClick={() => { const a = api(); onOpenDetail(a ? a.read() : null) }}>詳細</button>
          <button className="btn btn-outline btn-sm" disabled={!ready}
            onClick={() => { try { frameRef.current.contentWindow.print() } catch {} }}>🖨</button>
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存して閉じる'}</button>
          <button className="btn btn-sm" style={{ background: '#F1F5F9' }} onClick={onClose}>破棄</button>
        </div>
        <div style={{ flex: '1 1 auto', overflow: 'auto', background: '#E2E8F0', padding: 8 }}>
          <iframe ref={frameRef} onLoad={onLoad} title="御見積書"
            src="/estimate-form/index.html?embed=1"
            style={{ width: Math.round(A4_PX * z), maxWidth: 'none', height: h, border: 0, background: '#fff', display: 'block' }} />
        </div>
      </div>
    </div></ModalPortal>
  )
}
const A4_PX = 210 * 96 / 25.4          // A4の幅（実寸）
const ovl = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', zIndex: 1200,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }
// 帳票は縦に長いので、操作の並びは上に固定して中身だけを枠内で送る
const paperBox = { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 880,
  boxShadow: '0 20px 60px rgba(0,0,0,.3)', overflow: 'hidden',
  display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 24px)' }
const paperBar = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: '0 0 auto',
  padding: '10px 12px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }

function openPrintPreview(form) {
  try { localStorage.setItem(PRINT_FORM_KEY, JSON.stringify(buildPrintData(form))) } catch { /* 容量超過等は素通し */ }
  window.open('/estimate-form/index.html', '_blank')
}

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
    // 家財をリードから自動マッピング（語彙が異なるため対応表で変換）
    // 対応表にない家財（椅子・ゴルフセット・自由入力など）は、黙って捨てずに控えておく
    const extra = [], over = []
    if (Array.isArray(p.kazai)) {
      p.kazai.forEach(k => {
        const key = resolveKazaiKey(k.name)
        if (key) f.items[key] = (Number(f.items[key]) || 0) + (Number(k.qty) || 0)
        else if (k.name) {
          // 対応表に無い家財は、帳票の空き升へ書く「特殊家財」として持つ（点数は人が入れる）
          if (extra.length < KZX_MAX) extra.push({ name: k.name, pt: '', qty: String(Number(k.qty) || 1) })
          else over.push(`${k.name}${Number(k.qty) > 1 ? ` ×${k.qty}` : ''}`)
        }
      })
    }
    f.extraKazai = extra
    f.unmatchedKazai = over
    if (p.boxCount) {
      // ダンボール（小）に割り当て
      const boxKey = ALL_ITEMS.find(it => it.name === 'ダンボール' && it.size === '小')?.key
      if (boxKey) f.items[boxKey] = Number(p.boxCount) || 0
    }
    setForm(f); setEditId(null); setView('edit'); setPreview(false); setStep('basic')
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
    openPaper(f, null)
  }
  const formOf = (item) => ({ ...emptyForm(), ...item, items: { ...(item.items || {}) }, memos: { ...(item.memos || {}) }, pts: { ...(item.pts || {}) },
    feeA: { ...(item.feeA || {}) }, feeB: { ...(item.feeB || {}) },
    feeC: { ...(item.feeC || {}) }, feeCx: { ...(item.feeCx || {}) }, feeD: { ...(item.feeD || {}) } })
  /* ---- 見積書モーダル（帳票をそのまま出して直接書いてもらう） ---- */
  const [paperForm, setPaperForm] = useState(null)   // 開いている見積書
  const [paperId, setPaperId] = useState(null)       // 既存レコードなら その id
  const openPaper = (f, id = null) => { setPaperForm(f); setPaperId(id) }
  const closePaper = () => { setPaperForm(null); setPaperId(null) }
  // 帳票の中身を読み出して保存する。金額・才数は帳票が計算した値をそのまま使う
  const savePaper = async (read) => {
    if (!read) { showToast('帳票を読み取れませんでした。開き直してください'); return }
    const pd = read.data || {}
    // 白紙のまま閉じたときは、空のレコードを作らない
    if (!paperId && !pd.customerName && !read.totals.total && !read.totals.points) {
      closePaper(); showToast('白紙だったので保存しませんでした'); return
    }
    const id = paperId || Date.now().toString()
    const next = readPrintData(pd, paperForm)
    next.paper = paperResidue(pd, next)
    const payload = { ...next, id, total: read.totals.total, points: read.totals.points }
    setSaving(true)
    if (isDemo) {
      setItems(pr => paperId ? pr.map(i => (i.id === id ? payload : i)) : [payload, ...pr])
      setSaving(false); closePaper(); showToast('保存しました（デモ：ローカルのみ）'); return
    }
    try {
      await fetch('/api/estimate', { method: paperId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      await fetchItems(); showToast('保存しました')
    } catch (e) { console.error(e); showToast('保存に失敗しました') }
    setSaving(false); closePaper()
  }
  // モーダルから今までのタブ形式の入力画面へ移る（書いた内容は持っていく／保存はまだしない）
  const paperToDetail = (read) => {
    setForm(read ? readPrintData(read.data || {}, paperForm) : paperForm)
    setEditId(paperId); setView('edit'); setPreview(false); setStep('basic'); closePaper()
  }
  const backToList = () => { setView('list'); setPreview(false); setForm(emptyForm()); setEditId(null); setStep('basic') }

  // フォーム更新ヘルパー
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // 住所から郵便番号を取得（転居先／現住所）。Googleマップキーが必要。
  const [zipBusy, setZipBusy] = useState('') // 'from' | 'to' | ''
  const [step, setStep] = useState('basic')                 // 表示中のタブ（押したタブの内容だけ出す）
  const [kazaiQuery, setKazaiQuery] = useState('')          // 家財の検索語
  const [kazaiOnlyEntered, setKazaiOnlyEntered] = useState(true) // 入力済みのみ表示（既定ON）
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
  // 住所を入力し終えたら、郵便番号が空のときだけ自動で引く（手入力済みなら触らない）
  const autoZip = async (section) => {
    if (!GMAPS_KEY) return
    const addr = section === 'to' ? form.toAddress : form.fromAddress
    const zip = section === 'to' ? form.toZip : form.fromZip
    if (!addr || !addr.trim() || (zip && zip.trim())) return
    setZipBusy(section)
    try { const r = await zipFromAddress(addr); if (r.zip) set(section === 'to' ? 'toZip' : 'fromZip', r.zip) } catch {}
    setZipBusy('')
  }
  const setItemQty = (key, v) => setForm(p => ({ ...p, items: { ...p.items, [key]: v } }))
  const setMemo = (key, v) => setForm(p => ({ ...p, memos: { ...(p.memos || {}), [key]: v } }))
  // S・M（エアコンの大きさ）はどちらか一方だけ。同じものをもう一度押すと外れる
  const pickOne = (arr, v) => ((arr || [])[0] === v && (arr || []).length === 1 ? [] : [v])
  const setItemPt = (key, v) => setForm(p => ({ ...p, pts: { ...(p.pts || {}), [key]: v } }))
  // 特殊家財（帳票の空き升に印刷する自由記入行）
  const addExtra = () => setForm(p => (p.extraKazai || []).length >= KZX_MAX ? p : ({ ...p, extraKazai: [...(p.extraKazai || []), { name: '', pt: '', qty: '1' }] }))
  const setExtra = (i, patch) => setForm(p => ({ ...p, extraKazai: (p.extraKazai || []).map((r, ix) => ix === i ? { ...r, ...patch } : r) }))
  const removeExtra = (i) => setForm(p => ({ ...p, extraKazai: (p.extraKazai || []).filter((_, ix) => ix !== i) }))
  // 表に同じ品目がある名前（ソファー（2人掛け）＝ソファー 2人用 など）は、
  // 空き升に書かず表の数量へ統合する
  const mergeExtra = (i) => setForm(p => {
    const r = (p.extraKazai || [])[i]
    if (!r || !r.name) return p
    const key = resolveKazaiKey(r.name)
    if (!key) return p
    const it = ALL_ITEMS.find(x => x.key === key)
    setToast(`「${r.name}」は家財表の「${it ? it.name + (it.size ? ' ' + it.size : '') : key}」に統合しました`)
    setTimeout(() => setToast(''), 2600)
    return {
      ...p,
      items: { ...p.items, [key]: String(num(p.items[key]) + (num(r.qty) || 1)) },
      extraKazai: (p.extraKazai || []).filter((_, ix) => ix !== i),
    }
  })
  const setFee = (block, key, v) => setForm(p => ({ ...p, [block]: { ...p[block], [key]: v } }))
  const setFeeCx = (key, f, v) => setForm(p => ({ ...p, feeCx: { ...(p.feeCx || {}), [key]: { ...((p.feeCx || {})[key] || {}), [f]: v } } }))

  // 集計
  const totals = useMemo(() => {
    const points = ALL_ITEMS.reduce((s, it) => {
      const q = num(form.items[it.key])
      // 才数が印字されている行はその値、空の行（TVブラ等）は書き込まれた才数を使う
      return s + q * (it.pt ? it.pt : (it.ptIn ? num(form.pts?.[it.key]) : 0))
    }, 0)
    const extraPt = (form.extraKazai || []).reduce((s, r) => s + num(r.pt) * num(r.qty), 0)
    const qtyTotal = ALL_ITEMS.reduce((s, it) => s + num(form.items[it.key]), 0)
    const a = sumFee(form.feeA, FEE_A)
    const b = sumFee(form.feeB, FEE_B)
    const c = sumFee(form.feeC, FEE_C) + FEE_C.reduce((s, f) => s + num(form.feeCx?.[f.key]?.a2), 0)
    const d = sumFee(form.feeD, FEE_D)
    const goukei = a + b + c + d
    const tax = Math.round(goukei * TAX_RATE)
    const saikei = goukei + tax
    return { points: points + extraPt, qtyTotal, a, b, c, d, goukei, tax, saikei }
  }, [form])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2200) }

  const handleSave = async ({ keepEditing = false } = {}) => {
    if (!form.name) { showToast('顧客名を入力してください'); setStep('customer'); return false }
    setSaving(true)
    const id = editId || Date.now().toString()
    const payload = { ...form, id, total: totals.saikei, points: totals.points }
    if (isDemo) {
      if (editId) setItems(p => p.map(i => i.id === editId ? payload : i))
      else setItems(p => [payload, ...p])
      setSaving(false)
      // 途中保存では一覧へ戻らず、以後は同じ見積として更新していく
      if (keepEditing) { setEditId(id); showToast('保存しました（デモ：ローカルのみ）'); return true }
      showToast('保存しました（デモ：ローカルのみ）'); backToList(); return true
    }
    try {
      const method = editId ? 'PUT' : 'POST'
      await fetch('/api/estimate', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      await fetchItems()
      setSaving(false)
      if (keepEditing) { setEditId(id); showToast('保存しました'); return true }
      showToast('保存しました'); backToList(); return true
    } catch (e) { console.error(e); showToast('保存に失敗しました'); setSaving(false); return false }
  }

  // タブの「保存して次へ」。最後のタブだけ一覧へ戻る（途中は保存して次のタブを開く）
  const stepIndex = EST_STEPS.findIndex(s => s.id === step)
  const isLastStep = stepIndex === EST_STEPS.length - 1
  const saveAndNext = async () => {
    const ok = await handleSave({ keepEditing: !isLastStep })
    if (ok && !isLastStep) setStep(EST_STEPS[stepIndex + 1].id)
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
    // 成約から起こした見積書は、元の成約と同じ並び順（売上登録日＋成約の並び）のままにする。
    // 見積日で並べ替えると「見積書として作成」を押した瞬間に行が別の場所へ飛ぶため。
    const conById = {}
    contracts.forEach((c, ix) => { conById[c.id] = { c, ix } })
    const fromEst = items.map(i => {
      const h = i.contractId ? conById[i.contractId] : null
      return { ...i, _kind: 'estimate',
        _sortDate: (h && (h.c.salesDate || h.c.date)) || i.estimateDate || i.moveDate || '',
        _tie: h ? 1000 + h.ix : 0 }
    })
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
    // 同じ日付の中でも位置が変わらないよう、成約由来は成約一覧の並びを副キーにする
    const conIx = Object.fromEntries(contracts.map((c, ix) => [c.id, ix]))
    fromCon.forEach(r => { r._tie = 1000 + conIx[r._contract.id] })
    const rows = [...fromEst, ...fromCon]
      .sort((a, b) => String(b._sortDate).localeCompare(String(a._sortDate)) || (a._tie - b._tie))
    const estCount = items.length
    const conCount = fromCon.length
    const sumEst = items.reduce((s, i) => s + num(i.total), 0)
    const sumCon = fromCon.reduce((s, i) => s + num(i.total), 0)
    const sumAll = sumEst + sumCon

    // 成約レコードを「見積書として作成」する：成約・リードの内容を入れた帳票をモーダルで開く
    const issueFromContract = (c) => {
      const f = emptyForm()
      f.estimateNo = nextNo()
      // 訪問見積日があればそれを見積日に、無ければ今日
      f.estimateDate = ymd(c.visitEstimateDate) || new Date().toISOString().slice(0, 10)
      // 受付日は、リードから引き継いだ受付日時（無ければ売上登録日）
      f.requestDate = ymd(c.receivedAt, c.salesDate || c.date) || ymd(c.salesDate) || ''
      // 一括見積サイト経由（サムライ／ズバッと／価格.com／SUUMO ほか）は帳票の媒体「net」に〇
      if (c.srcLabel) f.media = ['net']
      f.name = c.name || ''
      f.kana = c.kana || ''
      f.fromTelMobile = c.phone || ''
      f.toTelMobile = c.phone || '' // 同一人物なので転居先の携帯も同じ番号
      f.estimator = c.staff || ''   // 見積者は担当者で補完
      f.fromAddress = c.fromAddress || ''
      f.toAddress = c.toAddress || ''
      f.moveDate = ymd(c.date) || ymd(c.moveDateText) || ''
      f.deliverDate = f.moveDate // お届日は引越日と同日を既定に
      f.memo = c.memo || ''
      f.contractId = c.id
      f.contractAmount = num(c.amount) // 参考表示用
      // 家財を成約から見積書の家財数量へ反映（リード→成約で引き継いだkazai/boxCount）
      // 対応表にない家財は黙って捨てず、家財タブの警告に出す
      const extra = [], over = []
      if (Array.isArray(c.kazai)) {
        c.kazai.forEach(k => {
          const key = resolveKazaiKey(k.name)
          if (key) f.items[key] = (Number(f.items[key]) || 0) + (Number(k.qty) || 0)
          else if (k.name) {
            if (extra.length < KZX_MAX) extra.push({ name: k.name, pt: '', qty: String(Number(k.qty) || 1) })
            else over.push(`${k.name}${Number(k.qty) > 1 ? ` ×${k.qty}` : ''}`)
          }
        })
      }
      f.extraKazai = extra
      f.unmatchedKazai = over
      if (c.boxCount) { const boxKey = ALL_ITEMS.find(it => it.name === 'ダンボール' && it.size === '小')?.key; if (boxKey) f.items[boxKey] = Number(c.boxCount) || 0 }
      openPaper(f, null)
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
                                <button className="btn btn-outline btn-sm" onClick={() => openPaper(formOf(item), item.id)}>編集</button>
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
          <ModalPortal><div style={modalOverlay} onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
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
          </div></ModalPortal>
        )}

        {paperForm && (
          <PaperModal form={paperForm} saving={saving}
            onSave={savePaper} onClose={closePaper} onOpenDetail={paperToDetail} />
        )}

        {toast && <Toast msg={toast} />}
      </div>
    )
  }

  /* ===================== 編集ビュー ===================== */
  return (
    <div>
      <PrintStyle />

      {/* ヘッダー操作（画面上部に固定） */}
      <div className="no-print" style={{
        position: 'sticky', top: -16, zIndex: 50, background: '#F7F9FC',
        margin: '-16px -16px 12px', padding: '20px 16px 6px', borderBottom: '1px solid #E2E8F0',
        boxShadow: '0 4px 12px rgba(15,42,74,.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={backToList}>← 一覧へ</button>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 15, fontWeight: 900 }}>御見積書 {editId ? '編集' : '作成'}</div>
            <div style={{ fontSize: 10, color: '#64748B' }}>見積番号 {form.estimateNo}</div>
          </div>
          <div style={{ textAlign: 'right', marginRight: 4 }}>
            <div style={{ fontSize: 9, color: '#64748B' }}>再計（税込）</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#1E5FA8', lineHeight: 1.1 }}>{yen(totals.saikei)}</div>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => openPrintPreview(form)}>🖨 印刷プレビュー</button>
          <button className="btn btn-primary btn-sm" onClick={() => handleSave()} disabled={saving} style={{ opacity: saving ? .6 : 1 }}>
            {saving ? '保存中...' : '保存して一覧へ'}
          </button>
        </div>
        {/* タブ：押した内容だけを表示する */}
        <div style={{ display: 'flex', gap: 6, marginTop: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {EST_STEPS.map((st, i) => (
            <button key={st.id} type="button" className="btn btn-sm" onClick={() => setStep(st.id)}
              style={step === st.id
                ? { background: '#1E5FA8', color: '#fff', whiteSpace: 'nowrap', padding: '3px 12px', fontSize: 11, fontWeight: 800 }
                : { background: '#fff', border: '1px solid #E2E8F0', color: '#475569', whiteSpace: 'nowrap', padding: '3px 12px', fontSize: 11 }}>
              <span style={{ opacity: .65, marginRight: 4 }}>{i + 1}</span>{st.label}
            </button>
          ))}
        </div>
      </div>

      {/* 基本情報 */}
      {step === 'basic' && <Section id="sec-basic" title="基本情報">
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
              <input style={{ ...inputStyle, width: 58, textAlign: 'center' }} value={form.moveHour} onChange={e => set('moveHour', e.target.value)} placeholder="時" />
            </div>
          </Field>
          <Field label="お届日">
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" style={inputStyle} value={form.deliverDate} onChange={e => set('deliverDate', e.target.value)} />
              <select style={{ ...inputStyle, width: 70 }} value={form.deliverAP} onChange={e => set('deliverAP', e.target.value)}><option>AM</option><option>PM</option></select>
              <input style={{ ...inputStyle, width: 58, textAlign: 'center' }} value={form.deliverHour} onChange={e => set('deliverHour', e.target.value)} placeholder="時" />
            </div>
          </Field>
          <Field label="距離（km）"><input type="number" style={inputStyle} value={form.distanceKm} onChange={e => set('distanceKm', e.target.value)} placeholder="例：12" /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="梱包日">
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" style={inputStyle} value={form.packDate} onChange={e => set('packDate', e.target.value)} />
              <select style={{ ...inputStyle, width: 70 }} value={form.packAP} onChange={e => set('packAP', e.target.value)}><option value="">—</option><option>AM</option><option>PM</option></select>
              <input style={{ ...inputStyle, width: 58, textAlign: 'center' }} value={form.packHour} onChange={e => set('packHour', e.target.value)} placeholder="時" />
            </div>
          </Field>
          <Field label="開梱日">
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" style={inputStyle} value={form.openDate} onChange={e => set('openDate', e.target.value)} />
              <select style={{ ...inputStyle, width: 70 }} value={form.unpackAP} onChange={e => set('unpackAP', e.target.value)}><option value="">—</option><option>AM</option><option>PM</option></select>
              <input style={{ ...inputStyle, width: 58, textAlign: 'center' }} value={form.unpackHour} onChange={e => set('unpackHour', e.target.value)} placeholder="時" />
            </div>
          </Field>
          <Field label="発送内容（複数可）">
            <ChkRow items={SEND_ITEMS} labelOf={v => SEND_LABEL[v]} on={form.sendTypes}
              onToggle={v => set('sendTypes', toggleIn(form.sendTypes, v))} />
          </Field>
        </div>

        <SubHead>受付・伝票</SubHead>
        <div className="three-col">
          <Field label="受付(1)"><input style={inputStyle} value={form.reception1} onChange={e => set('reception1', e.target.value)} /></Field>
          <Field label="受付(2)"><input style={inputStyle} value={form.reception2} onChange={e => set('reception2', e.target.value)} /></Field>
          <Field label="受付日"><input type="date" style={inputStyle} value={form.requestDate} onChange={e => set('requestDate', e.target.value)} /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="フロント"><input style={inputStyle} value={form.frontNote} onChange={e => set('frontNote', e.target.value)} /></Field>
          <Field label="確認日"><input type="date" style={inputStyle} value={form.confirmDate} onChange={e => set('confirmDate', e.target.value)} /></Field>
          <Field label="確認者"><input style={inputStyle} value={form.confirmerName} onChange={e => set('confirmerName', e.target.value)} /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="スペース"><input style={inputStyle} value={form.spaceSize} onChange={e => set('spaceSize', e.target.value)} /></Field>
          <Field label="作業量（〜で2枠）"><input style={inputStyle} value={form.workLoad} onChange={e => set('workLoad', e.target.value)} placeholder="例：3〜4" /></Field>
          <Field label="梱包・開包（／で2枠）"><input style={inputStyle} value={form.packOpenCar} onChange={e => set('packOpenCar', e.target.value)} placeholder="例：1／2" /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="補助車輌">
            <select style={inputStyle} value={form.helperCar} onChange={e => set('helperCar', e.target.value)}>
              <option value="">—</option><option value="現">現</option><option value="行">行</option>
            </select>
          </Field>
          <Field label="その他（事業内容）"><input style={inputStyle} value={form.bizOther} onChange={e => set('bizOther', e.target.value)} /></Field>
          <Field label="再利用の回数"><input style={inputStyle} value={form.mediaReuseCount} onChange={e => set('mediaReuseCount', e.target.value)} placeholder="例：2" /></Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="事業内容">
            <ChkRow items={['引越', '片付け', 'リユース']}
              on={[form.bizMove && '引越', form.bizClean && '片付け', form.bizReuse && 'リユース'].filter(Boolean)}
              onToggle={v => set(v === '引越' ? 'bizMove' : v === '片付け' ? 'bizClean' : 'bizReuse',
                !(v === '引越' ? form.bizMove : v === '片付け' ? form.bizClean : form.bizReuse))} />
          </Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="媒体"><ChkRow items={MEDIA_ITEMS} on={form.media} onToggle={v => set('media', toggleIn(form.media, v))} /></Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="シークレット"><ChkRow items={SECRET_ITEMS} on={form.secret} onToggle={v => set('secret', toggleIn(form.secret, v))} /></Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="ご紹介先"><textarea rows={2} style={{ ...inputStyle, resize: 'vertical' }} value={form.refName} onChange={e => set('refName', e.target.value)} /></Field>
        </div>
      </Section>}

      {/* 顧客情報 */}
      {step === 'customer' && <Section id="sec-customer" title="顧客情報">
        <div className="two-col">
          <Field label="お名前 *"><input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="例：サンプル 太郎" /></Field>
          <Field label="フリガナ"><input style={inputStyle} value={form.kana} onChange={e => set('kana', e.target.value)} placeholder="例：サンプル タロウ" /></Field>
        </div>

        <div style={{ marginTop: 12, fontWeight: 700, fontSize: 12, color: '#1E5FA8' }}>［A］現住所</div>
        <div className="two-col" style={{ marginTop: 6 }}>
          <Field label="〒">
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={inputStyle} inputMode="numeric" value={form.fromZip} onChange={e => set('fromZip', e.target.value)} placeholder="815-0000" />
              <button type="button" className="btn btn-outline btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => lookupZip('from')} disabled={zipBusy === 'from'} title="住所から郵便番号を取得">{zipBusy === 'from' ? '…' : '住所から'}</button>
            </div>
          </Field>
          <Field label="住所"><input style={inputStyle} value={form.fromAddress} onChange={e => set('fromAddress', e.target.value)} onBlur={() => autoZip('from')} placeholder="福岡市南区…" /></Field>
        </div>
        <div style={{ marginTop: 6 }}>
          <Field label="住所フリガナ"><input style={inputStyle} value={form.fromFurigana} onChange={e => set('fromFurigana', e.target.value)} placeholder="フクオカシミナミク…" /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 6 }}>
          <Field label="電話（自宅）"><TelInput label="電話（自宅）" value={form.fromTelHome} onChange={v => set('fromTelHome', v)} /></Field>
          <Field label="電話（勤務先）"><TelInput label="電話（勤務先）" value={form.fromTelWork} onChange={v => set('fromTelWork', v)} /></Field>
          <Field label="携帯電話"><TelInput label="携帯電話" value={form.fromTelMobile} onChange={v => set('fromTelMobile', v)} /></Field>
        </div>

        <div style={{ marginTop: 14, fontWeight: 700, fontSize: 12, color: '#0E8A7A' }}>［B］転居先</div>
        <div className="two-col" style={{ marginTop: 6 }}>
          <Field label="〒">
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={inputStyle} inputMode="numeric" value={form.toZip} onChange={e => set('toZip', e.target.value)} placeholder="819-0000" />
              <button type="button" className="btn btn-outline btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => lookupZip('to')} disabled={zipBusy === 'to'} title="転居先の住所から郵便番号を取得">{zipBusy === 'to' ? '…' : '住所から'}</button>
            </div>
          </Field>
          <Field label="住所"><input style={inputStyle} value={form.toAddress} onChange={e => set('toAddress', e.target.value)} onBlur={() => autoZip('to')} placeholder="福岡市南区…" /></Field>
        </div>
        <div style={{ marginTop: 6 }}>
          <Field label="住所フリガナ"><input style={inputStyle} value={form.toFurigana} onChange={e => set('toFurigana', e.target.value)} placeholder="フクオカシミナミク…" /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 6 }}>
          <Field label="電話（自宅）"><TelInput label="電話（自宅）" value={form.toTelHome} onChange={v => set('toTelHome', v)} /></Field>
          <Field label="電話（勤務先）"><TelInput label="電話（勤務先）" value={form.toTelWork} onChange={v => set('toTelWork', v)} /></Field>
          <Field label="携帯電話"><TelInput label="携帯電話" value={form.toTelMobile} onChange={v => set('toTelMobile', v)} /></Field>
        </div>
      </Section>}

      {/* 作業条件 */}
      {step === 'work' && <Section id="sec-work" title="作業内容・作業状況">
        <div className="three-col">
          <Field label="小物梱包">
            <Seg choices={PERSON_CHOICES} value={form.packSmallBy} onChange={v => set('packSmallBy', v)} />
            <div style={{ marginTop: 6 }}><ChkRow items={['ALL', 'Part']} on={form.packSmallOpt} onToggle={v => set('packSmallOpt', toggleIn(form.packSmallOpt, v))} /></div>
          </Field>
          <Field label="家具梱包">
            <Seg choices={PERSON_CHOICES} value={form.packFurniBy} onChange={v => set('packFurniBy', v)} />
            <div style={{ marginTop: 6 }}><ChkRow items={['D', 'E']} on={form.packFurniOpt} onToggle={v => set('packFurniOpt', toggleIn(form.packFurniOpt, v))} /></div>
          </Field>
          <Field label="開梱作業">
            <Seg choices={PERSON_CHOICES} value={form.packOpenBy} onChange={v => set('packOpenBy', v)} />
            <div style={{ marginTop: 6 }}><ChkRow items={['ALL', 'Part']} on={form.packOpenOpt} onToggle={v => set('packOpenOpt', toggleIn(form.packOpenOpt, v))} /></div>
          </Field>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="エアコン セパレート（台）">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#94A3B8' }}>取外</span>
              <ChkRow items={SM_OPTS} on={form.acSepFrom} onToggle={v => set('acSepFrom', pickOne(form.acSepFrom, v))} />
              <input type="number" style={{ ...inputStyle, width: 70 }} value={form.airconSep} onChange={e => set('airconSep', e.target.value)} />
              <span style={{ fontSize: 10, color: '#94A3B8' }}>台</span>
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#94A3B8' }}>取付</span>
              <ChkRow items={SM_OPTS} on={form.acSepTo} onToggle={v => set('acSepTo', pickOne(form.acSepTo, v))} />
              <input type="number" style={{ ...inputStyle, width: 70 }} value={form.airconSepTo} onChange={e => set('airconSepTo', e.target.value)} />
              <span style={{ fontSize: 10, color: '#94A3B8' }}>台</span>
            </div>
          </Field>
          <Field label="エアコン ウィンド（台）">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#94A3B8' }}>取外</span>
              <ChkRow items={SM_OPTS} on={form.acWinFrom} onToggle={v => set('acWinFrom', pickOne(form.acWinFrom, v))} />
              <input type="number" style={{ ...inputStyle, width: 70 }} value={form.airconWindow} onChange={e => set('airconWindow', e.target.value)} />
              <span style={{ fontSize: 10, color: '#94A3B8' }}>台</span>
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#94A3B8' }}>取付</span>
              <ChkRow items={SM_OPTS} on={form.acWinTo} onToggle={v => set('acWinTo', pickOne(form.acWinTo, v))} />
              <input type="number" style={{ ...inputStyle, width: 70 }} value={form.airconWindowTo} onChange={e => set('airconWindowTo', e.target.value)} />
              <span style={{ fontSize: 10, color: '#94A3B8' }}>台</span>
            </div>
          </Field>
          <Field label="ピアノ・エレクトーン作業"><input style={inputStyle} value={form.pianoWork} onChange={e => set('pianoWork', e.target.value)} placeholder="有無・備考" /></Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="オプション工事"><input style={inputStyle} value={form.optionWork} onChange={e => set('optionWork', e.target.value)} placeholder="内容を記入" /></Field>
        </div>

        <SubHead>階数・ピアノ / エアコンの〇印</SubHead>
        <div className="three-col">
          <Field label="引越（現 F → 先 F）">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input style={{ ...inputStyle, textAlign: 'center' }} value={form.moveFloorFrom} onChange={e => set('moveFloorFrom', e.target.value)} placeholder="3" />
              <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap' }}>F →</span>
              <input style={{ ...inputStyle, textAlign: 'center' }} value={form.moveFloorTo} onChange={e => set('moveFloorTo', e.target.value)} placeholder="1" />
              <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap' }}>F</span>
            </div>
          </Field>
          <Field label="ピアノ（現 F → 先 F）">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input style={{ ...inputStyle, textAlign: 'center' }} value={form.pianoFloorFrom} onChange={e => set('pianoFloorFrom', e.target.value)} />
              <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap' }}>F →</span>
              <input style={{ ...inputStyle, textAlign: 'center' }} value={form.pianoFloorTo} onChange={e => set('pianoFloorTo', e.target.value)} />
              <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap' }}>F</span>
            </div>
          </Field>
          <Field label="ピアノ U／G の〇"><ChkRow items={['U', 'G']} on={form.pianoUG ? [form.pianoUG] : []} onToggle={v => set('pianoUG', form.pianoUG === v ? '' : v)} /></Field>
          <Field label="ピアノ 現住所（F の左）"><input style={inputStyle} value={form.pianoCurNote} onChange={e => set('pianoCurNote', e.target.value)} placeholder="例：3" /></Field>
          <Field label="ピアノ 届先住所（F の左）"><input style={inputStyle} value={form.pianoDstNote} onChange={e => set('pianoDstNote', e.target.value)} placeholder="例：1" /></Field>
          <Field label="ピアノ 現住所の〇"><ChkRow items={PIANO_OPTS} on={form.pianoCurOpt} onToggle={v => set('pianoCurOpt', toggleIn(form.pianoCurOpt, v))} /></Field>
          <Field label="ピアノ 届先住所の〇"><ChkRow items={PIANO_OPTS} on={form.pianoDstOpt} onToggle={v => set('pianoDstOpt', toggleIn(form.pianoDstOpt, v))} /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="〇を付ける欄">
            <ChkRow items={['ピアノ現住所', 'ピアノ届先', 'エアコン取外', 'エアコン取付']}
              on={[form.pianoCur && 'ピアノ現住所', form.pianoDst && 'ピアノ届先', form.airconRemove && 'エアコン取外', form.airconInstall && 'エアコン取付'].filter(Boolean)}
              onToggle={v => {
                const k = v === 'ピアノ現住所' ? 'pianoCur' : v === 'ピアノ届先' ? 'pianoDst' : v === 'エアコン取外' ? 'airconRemove' : 'airconInstall'
                set(k, !form[k])
              }} />
          </Field>
        </div>

        <SubHead>作業状況［C］現地</SubHead>
        <div className="three-col">
          <Field label="二ヶ所積み・降し"><input style={inputStyle} value={form.twoPlace} onChange={e => set('twoPlace', e.target.value)} placeholder="現地の内容" /></Field>
          <Field label="道幅（横持ち作業）">
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={inputStyle} value={form.roadWidth} onChange={e => set('roadWidth', e.target.value)}>{ROAD_CHOICES.map(x => <option key={x} value={x}>{x || '—'}</option>)}</select>
              <input style={{ ...inputStyle, width: 86, textAlign: 'center' }} value={form.roadWidthM} onChange={e => set('roadWidthM', e.target.value)} placeholder="m" />
            </div>
          </Field>
          <Field label="エレベーター作業">
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={inputStyle} value={form.elevator} onChange={e => set('elevator', e.target.value)}>{YN.map(x => <option key={x} value={x}>{x || '—'}</option>)}</select>
              <input style={{ ...inputStyle, width: 86, textAlign: 'center' }} value={form.elevatorM} onChange={e => set('elevatorM', e.target.value)} placeholder="人乗 m" />
            </div>
          </Field>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="窓吊り上下作業"><select style={inputStyle} value={form.windowLift} onChange={e => set('windowLift', e.target.value)}>{YN.map(x => <option key={x} value={x}>{x || '—'}</option>)}</select></Field>
          <Field label="機械作業"><select style={inputStyle} value={form.machine} onChange={e => set('machine', e.target.value)}>{REQ_CHOICES.map(x => <option key={x} value={x}>{x || '—'}</option>)}</select></Field>
          <div />
        </div>

        <SubHead>作業状況［D］行先</SubHead>
        <div className="three-col">
          <Field label="二ヶ所積み・降し"><input style={inputStyle} value={form.twoPlaceD} onChange={e => set('twoPlaceD', e.target.value)} placeholder="行先の内容" /></Field>
          <Field label="道幅（横持ち作業）">
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={inputStyle} value={form.roadWidthD} onChange={e => set('roadWidthD', e.target.value)}>{ROAD_CHOICES.map(x => <option key={x} value={x}>{x || '—'}</option>)}</select>
              <input style={{ ...inputStyle, width: 86, textAlign: 'center' }} value={form.roadWidthDM} onChange={e => set('roadWidthDM', e.target.value)} placeholder="m" />
            </div>
          </Field>
          <Field label="エレベーター作業">
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={inputStyle} value={form.elevatorD} onChange={e => set('elevatorD', e.target.value)}>{YN.map(x => <option key={x} value={x}>{x || '—'}</option>)}</select>
              <input style={{ ...inputStyle, width: 86, textAlign: 'center' }} value={form.elevatorDM} onChange={e => set('elevatorDM', e.target.value)} placeholder="人乗 m" />
            </div>
          </Field>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="窓吊り上下作業"><select style={inputStyle} value={form.windowLiftD} onChange={e => set('windowLiftD', e.target.value)}>{YN.map(x => <option key={x} value={x}>{x || '—'}</option>)}</select></Field>
          <Field label="機械作業"><select style={inputStyle} value={form.machineD} onChange={e => set('machineD', e.target.value)}>{REQ_CHOICES.map(x => <option key={x} value={x}>{x || '—'}</option>)}</select></Field>
          <div />
        </div>
      </Section>}

      {/* 家財リスト */}
      {step === 'kazai' && <Section
        id="sec-kazai"
        title="家財リスト（数量を入力）"
        right={<span style={{ fontSize: 12, fontWeight: 800, color: '#1E5FA8' }}>ポイント合計 {totals.points.toLocaleString('ja-JP')} 才</span>}
      >
        {/* リードから取り込めなかった家財（見積書の品目に該当なし）。捨てずにここで知らせる */}
        {Array.isArray(form.unmatchedKazai) && form.unmatchedKazai.length > 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '9px 12px', marginBottom: 10, fontSize: 12, color: '#92400E' }}>
            <b>⚠ 特殊家財の欄（{KZX_MAX}行）に入りきりませんでした</b>（備考に記載するか、近い品目に手入力してください）
            <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {form.unmatchedKazai.map((n, i) => (
                <span key={i} style={{ background: '#fff', border: '1px solid #FDE68A', borderRadius: 999, padding: '2px 9px', fontWeight: 700 }}>{n}</span>
              ))}
            </div>
            <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 7 }}
              onClick={() => { set('memo', [form.memo, '【家財表に入りきらない家財】' + form.unmatchedKazai.join('、')].filter(Boolean).join('\n')); set('unmatchedKazai', []) }}>
              備考に書き写して閉じる
            </button>
          </div>
        )}

        {/* 検索と絞り込み */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...inputStyle, maxWidth: 260 }}
            value={kazaiQuery}
            onChange={e => setKazaiQuery(e.target.value)}
            placeholder="🔍 品名で探す（例：タンス、ベッド）"
          />
          <button type="button" className="btn btn-sm"
            onClick={() => setKazaiOnlyEntered(v => !v)}
            style={kazaiOnlyEntered
              ? { background: '#1E5FA8', color: '#fff' }
              : { background: '#fff', color: '#64748B', border: '1px solid #E2E8F0' }}>
            入力済みのみ {kazaiOnlyEntered ? 'ON' : 'OFF'}
          </button>
          {kazaiQuery && <button type="button" className="btn btn-outline btn-sm" onClick={() => setKazaiQuery('')}>クリア</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {KAZAI_GROUPS.map(group => {
            const visible = group.items.filter(it => {
              // 検索中は「入力済みのみ」を一時的に無視する（そうしないと未入力の品目を探して追加できない）
              if (kazaiOnlyEntered && !kazaiQuery && !(num(form.items[it.key]) > 0) && !String(form.memos?.[it.key] || '').trim()) return false
              if (kazaiQuery && !(`${it.name}${it.size}`.includes(kazaiQuery))) return false
              return true
            })
            if (!visible.length) return null
            const gPts = group.items.reduce((sum, it) =>
              sum + num(form.items[it.key]) * (it.pt != null ? it.pt : (it.ptIn ? num(form.pts?.[it.key]) : 0)), 0)
            return (
            <div key={group.title} style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ background: '#F1F5FB', padding: '7px 10px', fontSize: 11, fontWeight: 800, color: '#334155', display: 'flex', justifyContent: 'space-between' }}>
                <span>{group.title}</span>
                {gPts > 0 && <span style={{ color: '#1E5FA8' }}>{gPts.toLocaleString('ja-JP')}才</span>}
              </div>
              <div>
                {visible.map(it => {
                  const q = num(form.items[it.key])
                  return (
                    <div key={it.key} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                      borderTop: '1px solid #F1F5F9', background: q > 0 ? '#EFF6FF' : '#fff',
                    }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                        {it.name}{it.size && <span style={{ color: '#94A3B8' }}> {it.size}</span>}
                        {it.ptIn ? (
                          <span style={{ color: '#94A3B8', fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <input type="number" min={0} inputMode="numeric" title="才数（原本の才数欄が空の行）"
                              value={form.pts?.[it.key] ?? ''} onChange={e => setItemPt(it.key, e.target.value)}
                              style={{ width: 44, padding: '3px 4px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, textAlign: 'center', fontFamily: 'inherit', outline: 'none' }} />才
                          </span>
                        ) : (
                          <span style={{ color: '#CBD5E1', fontSize: 10 }}> {it.pt == null ? '(別途)' : `${it.pt}才`}</span>
                        )}
                      </div>
                      {q > 0 && (it.pt != null || (it.ptIn && num(form.pts?.[it.key]) > 0)) && (
                        <span style={{ fontSize: 10, color: '#1E5FA8', fontWeight: 700, whiteSpace: 'nowrap' }}>{(q * (it.pt != null ? it.pt : num(form.pts?.[it.key]))).toLocaleString('ja-JP')}才</span>
                      )}
                      <button type="button" onClick={() => setItemQty(it.key, Math.max(0, q - 1))}
                        style={{ width: 30, height: 30, border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', color: q > 0 ? '#B91C1C' : '#CBD5E1', fontSize: 16, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>−</button>
                      <input
                        type="number" min={0} inputMode="numeric"
                        value={form.items[it.key] ?? ''}
                        onChange={e => setItemQty(it.key, e.target.value)}
                        style={{ width: 44, padding: '5px 4px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 14, textAlign: 'center', fontFamily: 'inherit', outline: 'none', fontWeight: q > 0 ? 800 : 400 }}
                      />
                      <button type="button" onClick={() => setItemQty(it.key, q + 1)}
                        style={{ width: 30, height: 30, border: '1px solid #1E5FA8', borderRadius: 6, background: '#EFF6FF', color: '#1E5FA8', fontSize: 16, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>＋</button>
                      <input value={form.memos?.[it.key] ?? ''} maxLength={4} placeholder="メモ" title="家財表の右列に印字するメモ（2〜3文字）"
                        onChange={e => setMemo(it.key, e.target.value)}
                        style={{ width: 54, padding: '5px 4px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, textAlign: 'center', fontFamily: 'inherit', outline: 'none' }} />
                    </div>
                  )
                })}
              </div>
            </div>
            )
          })}
        </div>
        {kazaiOnlyEntered && !kazaiQuery && !Object.values(form.items || {}).some(v => num(v) > 0) && !Object.values(form.memos || {}).some(v => String(v || '').trim()) && (
          <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>まだ数量が入力されていません。「入力済みのみ」をOFFにしてください。</div>
        )}
        <div style={{ marginTop: 10, fontSize: 11, color: '#94A3B8' }}>
          ※ ポイント（才数）は数量×才数の自動合計です。TVブラ・TV薄型は原本の才数欄が空なので、その場で才数を入れてください（入れた分は合計に入ります）。「(別途)」項目（ピアノ等）は合計に含めません。
        </div>

        <SubHead>特殊家財（表に無い品目）</SubHead>
        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 8, lineHeight: 1.6 }}>
          家財表の空き欄（{KZX_MAX}行まで）に品名ごと印刷します。点数を入れるとポイント合計にも入ります。
        </div>
        {(form.extraKazai || []).length === 0 ? (
          <div style={{ fontSize: 12, color: '#94A3B8', padding: '6px 0' }}>まだありません。</div>
        ) : (
          <div className="scroll-x">
            <table style={{ minWidth: 420 }}>
              <thead>
                <tr><th>品名</th><th style={{ width: 110, textAlign: 'center' }}>点数（才）</th><th style={{ width: 90, textAlign: 'center' }}>数量</th><th style={{ width: 90, textAlign: 'center' }}>メモ</th><th style={{ width: 44 }}></th></tr>
              </thead>
              <tbody>
                {form.extraKazai.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: 4 }}>
                      <input style={inputStyle} value={r.name || ''} placeholder="例：ゴルフセット"
                        onChange={e => setExtra(i, { name: e.target.value })} onBlur={() => mergeExtra(i)} />
                      {resolveKazaiKey(r.name) && (
                        <div style={{ fontSize: 10, color: '#1E5FA8', marginTop: 3 }}>
                          家財表の項目と一致（入力欄を離れると統合します）
                        </div>
                      )}
                    </td>
                    <td style={{ padding: 4 }}>
                      <input style={{ ...inputStyle, textAlign: 'center' }} value={r.pt || ''} placeholder="才"
                        onChange={e => setExtra(i, { pt: e.target.value })} />
                    </td>
                    <td style={{ padding: 4 }}>
                      <input style={{ ...inputStyle, textAlign: 'center' }} value={r.qty || ''} placeholder="1"
                        onChange={e => setExtra(i, { qty: e.target.value })} />
                    </td>
                    <td style={{ padding: 4 }}>
                      <input style={{ ...inputStyle, textAlign: 'center' }} value={r.x || ''} placeholder="2〜3字" maxLength={4}
                        onChange={e => setExtra(i, { x: e.target.value })} />
                    </td>
                    <td style={{ padding: 4, textAlign: 'center' }}>
                      <button type="button" title="この行を削除" onClick={() => removeExtra(i)}
                        style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 7, width: 28, height: 28, cursor: 'pointer', fontSize: 13 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8 }}
          onClick={addExtra} disabled={(form.extraKazai || []).length >= KZX_MAX}>
          ＋ 特殊家財を追加{(form.extraKazai || []).length >= KZX_MAX ? `（上限${KZX_MAX}行）` : ''}
        </button>

        <SubHead>荷造資材（枚数・個数）</SubHead>
        <div className="scroll-x">
          <table style={{ minWidth: 420 }}>
            <thead>
              <tr>
                <th style={{ width: 150 }}>品名</th><th style={{ textAlign: 'center' }}>予定 ①</th>
                <th style={{ textAlign: 'center' }}>予定 ②</th><th style={{ textAlign: 'center' }}>作業当日</th>
              </tr>
            </thead>
            <tbody>
              {MATERIAL_ROWS.map(([key, label]) => (
                <tr key={key}>
                  <td style={{ fontWeight: 700 }}>{label}</td>
                  {['_d1', '_d2', '_day'].map(sfx => (
                    <td key={sfx} style={{ padding: 4 }}>
                      <input style={{ ...inputStyle, textAlign: 'center', padding: '6px 4px' }}
                        value={form.mats?.[key + sfx] || ''}
                        onChange={e => setForm(pr => ({ ...pr, mats: { ...pr.mats, [key + sfx]: e.target.value } }))} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="作成日"><input style={inputStyle} value={form.createDate} onChange={e => set('createDate', e.target.value)} placeholder="例：9/1" /></Field>
          <Field label="配達日"><input style={inputStyle} value={form.delivDate} onChange={e => set('delivDate', e.target.value)} placeholder="例：9/3" /></Field>
          <Field label="保管（〜迄）"><input style={inputStyle} value={form.storageUntil} onChange={e => set('storageUntil', e.target.value)} placeholder="例：2026/10/31" /></Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="用具"><ChkRow items={GEAR_ITEMS} on={form.gear} onToggle={v => set('gear', toggleIn(form.gear, v))} /></Field>
        </div>
      </Section>}

      {/* 料金 */}
      {step === 'fee' && <Section id="sec-fee" title="料金（手入力）">
        <div className="fee-grid">
          <FeeBlock title="基本料金 (A)" list={FEE_A} obj={form.feeA} onChange={(k, v) => setFee('feeA', k, v)} subtotal={totals.a} />
          <FeeBlock title="附帯料金 (B)" list={FEE_B} obj={form.feeB} onChange={(k, v) => setFee('feeB', k, v)} subtotal={totals.b} />
          <FeeBlock title="その他の料金 (D)" list={FEE_D} obj={form.feeD} onChange={(k, v) => setFee('feeD', k, v)} subtotal={totals.d} />
        </div>
        <FeeCBlock list={FEE_C} amt={form.feeC} ext={form.feeCx} onAmt={(k, v) => setFee('feeC', k, v)} onExt={setFeeCx} subtotal={totals.c} />
        <SubHead>その他の料金の〇印</SubHead>
        <div className="two-col">
          <Field label="アンテナ"><ChkRow items={['脱', '着']} on={form.antennaOpt} onToggle={v => set('antennaOpt', toggleIn(form.antennaOpt, v))} /></Field>
          <Field label="洗濯機付"><ChkRow items={['ドラム', '全自動']} on={form.washerOpt} onToggle={v => set('washerOpt', toggleIn(form.washerOpt, v))} /></Field>
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
      </Section>}

      {/* お約束事項・支払 */}
      {step === 'pay' && <Section id="sec-pay" title="お約束事項・お支払い">
        <div className="two-col">
          <Field label="新居・お約束事項"><input style={inputStyle} value={form.requestTo} onChange={e => set('requestTo', e.target.value)} placeholder="例：新居（米曹屋郡笹栗町…）倍屋" /></Field>
          <Field label="お支払方法"><select style={inputStyle} value={form.payment} onChange={e => set('payment', e.target.value)}>{PAY_METHODS.map(s => <option key={s} value={s}>{s || '—'}</option>)}</select></Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="備考"><textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} value={form.memo} onChange={e => set('memo', e.target.value)} /></Field>
        </div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>お支払いは、積込終了時にお願い致します。</div>

        <SubHead>請求先（会社請求のとき）</SubHead>
        <div className="two-col">
          <Field label="請求先 会社名"><input style={inputStyle} value={form.billName} onChange={e => set('billName', e.target.value)} /></Field>
          <Field label="確認（月／日・AM/PM・時・様）">
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.7fr 1.4fr', gap: 6 }}>
              <input type="date" style={inputStyle} value={form.billConfirmDate} onChange={e => set('billConfirmDate', e.target.value)} />
              <select style={inputStyle} value={form.billConfirmAmPm} onChange={e => set('billConfirmAmPm', e.target.value)}><option value="">—</option><option value="AM">AM</option><option value="PM">PM</option></select>
              <input style={inputStyle} value={form.billConfirm} onChange={e => set('billConfirm', e.target.value)} placeholder="時" />
              <input style={inputStyle} value={form.billConfirmName} onChange={e => set('billConfirmName', e.target.value)} placeholder="様（氏名）" />
            </div>
          </Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="住所"><input style={inputStyle} value={form.billAddr} onChange={e => set('billAddr', e.target.value)} /></Field>
        </div>
        <div className="three-col" style={{ marginTop: 10 }}>
          <Field label="〆日"><input style={inputStyle} value={form.billClose} onChange={e => set('billClose', e.target.value)} placeholder="例：9/20（月/日）または 20" /></Field>
          <Field label="支払日"><input style={inputStyle} value={form.billPay} onChange={e => set('billPay', e.target.value)} placeholder="例：10/末 または 末" /></Field>
          <Field label="電話"><TelInput label="電話" value={form.billTel} onChange={v => set('billTel', v)} /></Field>
        </div>
        <div className="two-col" style={{ marginTop: 10 }}>
          <Field label="担当者"><input style={inputStyle} value={form.billStaff} onChange={e => set('billStaff', e.target.value)} /></Field>
          <Field label="請求書発送"><input style={inputStyle} value={form.billSend} onChange={e => set('billSend', e.target.value)} placeholder="例：9/25（月/日）" /></Field>
        </div>
      </Section>}

      {/* 下部固定サマリーバー（合計を見ながら保存・プレビューできる） */}
      <div className="no-print" style={{
        position: 'sticky', bottom: -16, zIndex: 40,
        background: '#0F2A4A', color: '#fff', borderRadius: '12px 12px 0 0',
        padding: '10px 14px 22px', margin: '18px -16px -16px',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        boxShadow: '0 -6px 20px rgba(15,42,74,.25)',
      }}>
        <div style={{ fontSize: 11, opacity: .85 }}>ポイント<br /><b style={{ fontSize: 14 }}>{totals.points.toLocaleString('ja-JP')}才</b></div>
        <div style={{ fontSize: 11, opacity: .85 }}>合計<br /><b style={{ fontSize: 14 }}>{yen(totals.goukei)}</b></div>
        <div style={{ fontSize: 11, opacity: .85 }}>消費税<br /><b style={{ fontSize: 14 }}>{yen(totals.tax)}</b></div>
        <div style={{ fontSize: 12 }}>再計（税込）<br /><b style={{ fontSize: 20, color: '#7CC4FF' }}>{yen(totals.saikei)}</b></div>
        <div style={{ flex: 1 }} />
        {stepIndex > 0 && (
          <button className="btn btn-outline" style={{ background: '#fff' }} onClick={() => setStep(EST_STEPS[stepIndex - 1].id)}>← {EST_STEPS[stepIndex - 1].label}へ</button>
        )}
        <button className="btn btn-outline" style={{ background: '#fff' }} onClick={() => openPrintPreview(form)}>🖨 印刷プレビュー</button>
        <button className="btn btn-primary" onClick={saveAndNext} disabled={saving} style={{ opacity: saving ? .6 : 1 }}>
          {saving ? '保存中...' : (isLastStep ? '保存して一覧へ' : `保存して ${EST_STEPS[stepIndex + 1].label} へ →`)}
        </button>
      </div>

      {preview && <PreviewModal form={form} totals={totals} onClose={() => setPreview(false)} />}
      {toast && <Toast msg={toast} />}
    </div>
  )
}

/* ===================== 小コンポーネント ===================== */
function Section({ title, right, children, id, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card no-print" id={id} style={{ scrollMarginTop: 64 }}>
      <div className="card-head" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setOpen(o => !o)}>
        <h3><span style={{ display: 'inline-block', width: 16, color: '#94A3B8' }}>{open ? '▾' : '▸'}</span>{title}</h3>
        <div onClick={e => e.stopPropagation()}>{right}</div>
      </div>
      {open && <div className="card-body">{children}</div>}
    </div>
  )
}
// セクション内の小見出し（受付・請求先など、ブロックの区切り）
function SubHead({ children }) {
  return (
    <div style={{ margin: '16px 0 8px', paddingBottom: 5, borderBottom: '1px solid #E2E8F0',
      fontSize: 11, fontWeight: 800, color: '#1E5FA8', letterSpacing: '.04em' }}>{children}</div>
  )
}
// 複数選択のチップ列（帳票の〇印に対応）
function ChkRow({ items, on = [], onToggle, labelOf }) {
  const set = new Set(on || [])
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map(v => {
        const active = set.has(v)
        return (
          <button key={v} type="button" onClick={() => onToggle(v)}
            style={{
              padding: '5px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${active ? '#1E5FA8' : '#E2E8F0'}`,
              background: active ? '#1E5FA8' : '#fff', color: active ? '#fff' : '#64748B',
            }}>{active ? '✓ ' : ''}{labelOf ? labelOf(v) : v}</button>
        )
      })}
    </div>
  )
}
const toggleIn = (arr, v) => (Array.isArray(arr) && arr.includes(v) ? arr.filter(x => x !== v) : [...(arr || []), v])

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
// 電話番号：紙と同じ3つの枠。－は自動で入り、枠が埋まる（か－を打つ）と次の枠へ移る。保存は「092-123-4567」
function splitTel(v) {
  const s = String(v || '').trim()
  if (!s) return ['', '', '']
  if (s.includes('-')) { const p = s.split('-'); return [p[0] || '', p[1] || '', p.slice(2).join('') || ''] }
  const d = s.replace(/\D/g, '')
  if (d.length === 11) return [d.slice(0, 3), d.slice(3, 7), d.slice(7)]
  if (d.length === 10) return /^0[36]/.test(d) ? [d.slice(0, 2), d.slice(2, 6), d.slice(6)] : [d.slice(0, 3), d.slice(3, 6), d.slice(6)]
  return [s, '', '']
}
function TelInput({ value, onChange, label }) {
  const parts = splitTel(value)
  const refs = [useRef(null), useRef(null), useRef(null)]
  const MAX = [4, 4, 4]
  const upd = (i, raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, MAX[i])
    const next = [...parts]; next[i] = digits
    onChange(next.some(Boolean) ? next.join('-').replace(/-+$/, '') : '')
    if (i < 2 && (digits.length >= MAX[i] || /[-ー－\s]$/.test(raw))) refs[i + 1].current?.focus()
  }
  const back = (i, e) => { if (e.key === 'Backspace' && !e.currentTarget.value && i > 0) { e.preventDefault(); refs[i - 1].current?.focus() } }
  const box = { ...inputStyle, textAlign: 'center', padding: '8px 4px' }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1.2fr', alignItems: 'center', gap: 4 }}>
      {[0, 1, 2].map(i => [
        i > 0 && <span key={'d' + i} style={{ color: '#94A3B8' }}>－</span>,
        <input key={i} ref={refs[i]} style={box} inputMode="numeric" maxLength={MAX[i]} value={parts[i]} aria-label={`${label || '電話'} ${i + 1}`}
          onChange={e => upd(i, e.target.value)} onKeyDown={e => back(i, e)} />,
      ])}
    </div>
  )
}

// 資材の料金：紙は「数量 枚 ¥金額 ｜ 数量 枚 ¥金額」の2組
function FeeCBlock({ list, amt, ext, onAmt, onExt, subtotal }) {
  const box = { width: '100%', ...feeInput }
  const num = (label, cap, value, on) => (
    <div>
      <div className="cap">{cap}</div>
      <input type="number" min={0} inputMode="numeric" aria-label={`${label} ${cap}`} value={value ?? ''}
        onChange={e => on(e.target.value)} style={box} />
    </div>
  )
  return (
    <div className="fee-card fee-wide">
      <h4>資材の料金 (C)　<span style={{ fontWeight: 400, color: '#64748B' }}>数量と金額を2組まで</span></h4>
      <div className="body">
        <div className="feec-row feec-head"><span /><span>数量①</span><span>金額①</span><span>数量②</span><span>金額②</span></div>
        {list.map(f => {
          const x = ext?.[f.key] || {}
          return (
            <div className="feec-row" key={f.key}>
              <div className="lab">{f.label}</div>
              {num(f.label, '数量①', x.q1, v => onExt(f.key, 'q1', v))}
              {num(f.label, '金額①', amt?.[f.key], v => onAmt(f.key, v))}
              {num(f.label, '数量②', x.q2, v => onExt(f.key, 'q2', v))}
              {num(f.label, '金額②', x.a2, v => onExt(f.key, 'a2', v))}
            </div>
          )
        })}
        <div className="fee-sub"><span>小計 (C)</span><span>{yen(subtotal)}</span></div>
      </div>
    </div>
  )
}

function FeeBlock({ title, list, obj, onChange, subtotal }) {
  return (
    <div className="fee-card">
      <h4>{title}</h4>
      <div className="body">
        {list.map(f => (
          <div className="fee-row" key={f.key}>
            <div className="lab">{f.label}</div>
            <div className="amt">
              <span>¥</span>
              <input type="number" min={0} inputMode="numeric" aria-label={f.label} value={obj?.[f.key] ?? ''}
                onChange={e => onChange(f.key, e.target.value)} style={feeInput} />
            </div>
          </div>
        ))}
        <div className="fee-sub"><span>小計</span><span>{yen(subtotal)}</span></div>
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
