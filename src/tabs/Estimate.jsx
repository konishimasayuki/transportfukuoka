import { useState, useEffect, useMemo, Fragment } from 'react'
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
      { key: 'getabako',    name: '下駄箱',             size: '縦',   pt: 18 },
      { key: 'getabako_y',  name: '下駄箱',             size: '横',   pt: 13 },
      { key: 'denwadai',    name: '電話台',             size: '',     pt: 5 },
      { key: 'tvdai',       name: 'テレビ台',           size: '',     pt: 4 },
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
      { key: 'washer_drum',  name: '洗濯機ドラム',   size: '',      pt: 15 },
      { key: 'washer_full',  name: '洗濯機全自動',   size: '',      pt: 13 },
      { key: 'dryer',        name: '乾燥機',         size: '',      pt: 8 },
      { key: 'tv_brown',     name: 'TVプラ',         size: '( )',   pt: '' },
      { key: 'tv_thin',      name: 'TV薄型',         size: '( )',   pt: '' },
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
      { key: 'ishou',      name: '衣裳ケース',       size: '',        pt: 3 },
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
      { key: 'kinko',      name: '金庫',             size: '(高さ40cmまで)', pt: 3 },
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
const WORK_ITEMS = ['搬出/輸送/搬入', '荷造り/梱包', '家具梱包', '荷解き', '家具の配置',
  '不用品の処分', 'ペットの輸送', 'エアコン脱着', '窓吊り上下作業']

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
  { key: 'mtSmall',  label: '小', unit: '枚' },
  { key: 'mtMid',    label: '中', unit: '枚' },
  { key: 'mtWa',     label: '和', unit: '枚' },
  { key: 'tape',     label: 'ガムテープ', unit: 'ケ' },
  { key: 'futon',    label: 'ふとん袋', unit: '枚' },
  { key: 'hbox',     label: 'ハンガーボックス', unit: 'ケ' },
  { key: 'lightron', label: 'ライトロンクレープ紙', unit: '枚' },
  { key: 'aircap',   label: 'エアーキャップ', unit: '本' },
]
const FEE_D = [
  { key: 'aircon',     label: 'エアコン基本工事（外し・付け）' },
  { key: 'antenna',    label: 'アンテナ（脱・着）' },
  { key: 'tvWire',     label: 'テレビ配線' },
  { key: 'videoWire',  label: 'ビデオ・DVD配線' },
  { key: 'pianoFee',   label: 'ピアノ・エレクトーン料' },
  { key: 'carCarrier', label: 'カーキャリー' },
  { key: 'cleaning',   label: 'ハウスクリーニング' },
  { key: 'washer',     label: '洗濯機(付)（ドラム・全自動）' },
]

const GEAR_ITEMS = ['ロープ', 'ハシゴ', '工具', '台車', '養生資材']
const SECRET_ITEMS = ['車輌', '資材', '制服', '引越先']
const MEDIA_ITEMS = ['電波', 'net', 'HP', '不動産', '電話帳', '法人名', 'DM', '再利用', 'チラシ', '紹介']
const BIZ_ITEMS = ['引越', '片付け', 'リユース']

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
    requestDate: '',       // 依頼日（査定サイトに依頼が入った日時）
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
    // 紙の御見積書（会社控）にある項目
    spaceSize: '', workLoad: '', packOpenCar: '', helperCar: '',   // スペース／作業量／梱包・開梱／補助車輌
    moveFF: '', pianoFF: '',                                        // 引越 F→F ／ ピアノ・エレクトーン F→F
    billCompany: '', billAddress: '', billTel: '', billStaff: '',   // 請求先
    receiptName: '', storageUntil: '',                              // 領収書宛先名／保管（〜迄）
    matCount: {},                                                   // 資材の枚数（資材の料金Cの数量）
    reception1: '', reception2: '',                                 // 受付(1)(2)
    front: '',                                                      // フロント
    confirmDate: '', confirmer: '',                                 // 確認日・確認者
    matDay1: {}, matDay2: {}, matOnDay: {},                         // 荷造資材の配達日（／日・／日・作業当日）
    gear: {},                                                       // ロープ・ハシゴ・工具・台車・養生資材
    createDate: '', delivDate: '',                                  // 作成日・配達日
    secretFlags: {},                                                // シークレット（車輌・資材・制服・引越先）
    billClose: '', billPayday: '', billSend: '',                    // 日〆・日払い・請求書発送
    confirmVisit: '', cardNote: '',                                 // 確認（AM/PM 時）・カード（）
    media: {}, refName: '',                                         // 媒体（電波・net…）・ご紹介先
    bizType: {}, bizOther: '',                                      // 引越・片付け・リユース／その他
    // 成約管理由来の場合に元レコードを参照（重複表示防止に使う）
    contractId: '',
  }
}

// 数値ユーティリティ
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
// 料金欄（自由記述）から先頭の金額を取り出す。「89,000円 〜 150,000円」なら 89000。
const parseAmount = (t) => { const m = String(t || '').match(/[\d][\d,]*/); return m ? Number(m[0].replace(/,/g, '')) : 0 }
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

// 帳票と同じ並びの入力表で使うスタイル（枠線つきセルの中に入力欄を置く）
const fBd   = '1px solid #CBD5E1'
const fcell = { border: fBd, padding: 0, verticalAlign: 'middle' }
const flab  = { border: fBd, background: '#F4F6F8', fontWeight: 700, fontSize: 11, padding: '6px 8px', whiteSpace: 'nowrap', width: 104, color: '#334155' }
const fin   = { width: '100%', border: 'none', outline: 'none', padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', background: 'transparent', color: '#0F172A' }
const fband = (color) => ({ borderLeft: `4px solid ${color}` })
// 「ラベル｜値｜ラベル｜値」4列テーブル（左右の幅を固定して揃える）
const table4 = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }
const COLS4 = ['15%', '35%', '15%', '35%']
// 家財を1品目ずつ並べる小さな枠（品名＋数量＋外すボタン）
const kchip = { display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #E2E8F0', borderRadius: 6, background: '#F8FAFC', padding: '2px 4px 2px 8px' }
const kqty  = { width: 46, padding: '3px 4px', border: '1px solid #CBD5E1', borderRadius: 4, fontSize: 12, textAlign: 'center', fontFamily: 'inherit', outline: 'none' }
const kdel  = { border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }

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
    // 帳票レイアウト用の項目（空でない値だけ引き継ぐ＝見積書側の編集を消さない）
    ;['ageGender', 'job', 'email', 'persons', 'moveTime', 'priceText', 'requestDate',
      'fromType', 'fromFloor', 'fromElevator', 'fromLayout',
      'toType', 'toFloor', 'toElevator', 'toLayout'].forEach(k => { if (p[k]) f[k] = p[k] })
    // 依頼作業のチェック（リード詳細で付けたもの）を引き継ぐ
    if (p.works && typeof p.works === 'object' && !Array.isArray(p.works)) f.works = { ...p.works }
    // 備考は「備考・その他希望」に集約する（欄が2つあると入力先が分かれて紛らわしいため）。
    // ※上のループより後に置くこと。ループに request を含めると、ここでまとめた値が上書きされる。
    f.request = [p.request, p.memo].filter(Boolean).join(' / ')
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
      total: totals.saikei > 0 ? totals.saikei : parseAmount(form.priceText), // 料金(A〜D)を入力したらその再計、無ければ料金欄の金額
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
      // 帳票レイアウト用の項目（成約が持っているものだけ補完。見積書側での編集が優先）
      f.email = c.email || ''
      f.persons = c.persons ? `${c.persons}人` : ''
      f.fromZip = c.fromZip || f.fromZip
      f.toZip = c.toZip || f.toZip
      f.request = [c.request, c.memo].filter(Boolean).join(' / ')
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

      {/* ══ 紙の御見積書（会社控）と同じ並びの入力フォーム ══ */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body" style={{ padding: 14 }}>

          {/* 1. 日程／車輌／発送内容／見積情報（帳票の最上段） */}
          <div className="scroll-x">
            <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.95fr 1fr', gap: 8, minWidth: 760 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', ...fband('#9AA3AB') }}>
                <tbody>
                  {[['引越日', 'moveDate', 'moveAP'], ['お届日', 'deliverDate', 'deliverAP']].map(([lb, dk, ak]) => (
                    <tr key={dk}>
                      <td style={flab}>{lb}</td>
                      <td style={fcell}>
                        <div style={{ display: 'flex' }}>
                          <input type="date" style={{ ...fin, flex: 1 }} value={form[dk]} onChange={e => set(dk, e.target.value)} />
                          <select style={{ ...fin, width: 62, flex: 'none' }} value={form[ak]} onChange={e => set(ak, e.target.value)}><option>AM</option><option>PM</option></select>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={flab}>梱包日</td>
                    <td style={fcell}><input type="date" style={fin} value={form.packDate} onChange={e => set('packDate', e.target.value)} /></td>
                  </tr>
                  <tr>
                    <td style={flab}>開梱日</td>
                    <td style={fcell}><input type="date" style={fin} value={form.openDate} onChange={e => set('openDate', e.target.value)} /></td>
                  </tr>
                </tbody>
              </table>
              <table style={{ width: '100%', borderCollapse: 'collapse', ...fband('#9AA3AB') }}>
                <tbody>
                  <tr><td style={flab}>スペース</td><td style={fcell}><input style={fin} value={form.spaceSize} onChange={e => set('spaceSize', e.target.value)} /></td></tr>
                  <tr><td style={flab}>作業量</td><td style={fcell}><input style={fin} value={form.workLoad} onChange={e => set('workLoad', e.target.value)} /></td></tr>
                  <tr><td style={flab}>梱包・開梱</td><td style={fcell}><input style={fin} value={form.packOpenCar} onChange={e => set('packOpenCar', e.target.value)} /></td></tr>
                  <tr><td style={flab}>補助車輌</td><td style={fcell}><input style={fin} value={form.helperCar} onChange={e => set('helperCar', e.target.value)} placeholder="現・行" /></td></tr>
                  <tr>
                    <td style={flab}>距離</td>
                    <td style={fcell}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <input type="number" min={0} style={fin} value={form.distanceKm} onChange={e => set('distanceKm', e.target.value)} />
                        <span style={{ fontSize: 11, color: '#64748B', padding: '0 8px' }}>km</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', ...fband('#9AA3AB') }}>
                <colgroup><col style={{ width: '44%' }} /><col style={{ width: '56%' }} /></colgroup>
                <tbody>
                  <tr><td style={flab}>受付(1)</td><td style={fcell}><input style={fin} value={form.reception1} onChange={e => set('reception1', e.target.value)} /></td></tr>
                  <tr><td style={flab}>受付(2)</td><td style={fcell}><input style={fin} value={form.reception2} onChange={e => set('reception2', e.target.value)} /></td></tr>
                  <tr><td style={{ ...flab, whiteSpace: 'normal' }}>引越 F→F</td><td style={fcell}><input style={fin} value={form.moveFF} onChange={e => set('moveFF', e.target.value)} placeholder="例：2F → 3F" /></td></tr>
                  <tr><td style={{ ...flab, whiteSpace: 'normal' }}>ピアノ/U・G F→F</td><td style={fcell}><input style={fin} value={form.pianoFF} onChange={e => set('pianoFF', e.target.value)} /></td></tr>
                  <tr>
                    <td style={flab}>発送内容</td>
                    <td style={fcell}>
                      <select style={fin} value={form.sendType} onChange={e => set('sendType', e.target.value)}>{SEND_TYPES.map(t => <option key={t} value={t}>{t || '—'}</option>)}</select>
                    </td>
                  </tr>
                  <tr><td style={flab}>見積日</td><td style={fcell}><input type="date" style={fin} value={form.estimateDate} onChange={e => set('estimateDate', e.target.value)} /></td></tr>
                  <tr><td style={flab}>受付日</td><td style={fcell}><input style={fin} value={form.requestDate} onChange={e => set('requestDate', e.target.value)} /></td></tr>
                  <tr><td style={flab}>見積者氏名</td><td style={fcell}><input style={fin} value={form.estimator} onChange={e => set('estimator', e.target.value)} /></td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. お名前 */}
          <table style={{ ...table4, marginTop: 8, ...fband('#9AA3AB') }}>
            <colgroup>{COLS4.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <tbody>
              <tr>
                <td style={flab}>フリガナ</td>
                <td style={fcell}><input style={fin} value={form.kana} onChange={e => set('kana', e.target.value)} /></td>
                <td style={flab}>フロント</td>
                <td style={fcell}><input style={fin} value={form.front} onChange={e => set('front', e.target.value)} /></td>
              </tr>
              <tr>
                <td style={flab}>お名前</td>
                <td style={fcell} colSpan={3}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input style={fin} value={form.name} onChange={e => set('name', e.target.value)} />
                    <span style={{ fontSize: 12, color: '#334155', padding: '0 10px', fontWeight: 700 }}>様</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* 3. [A]現住所／[B]転居先 */}
          {[
            ['[A] 現住所', 'fromZip', 'fromAddress', 'fromTelMobile', 'fromTelHome', 'fromTelWork', 'from'],
            ['[B] 転居先', 'toZip', 'toAddress', 'toTelMobile', 'toTelHome', 'toTelWork', 'to'],
          ].map(([title, zipK, adK, mobK, homeK, workK, dir]) => (
            <table key={title} style={{ ...table4, marginTop: 8, ...fband('#F0A868') }}>
              <colgroup>{COLS4.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <tbody>
                <tr><td style={{ ...flab, background: '#FDF1E4' }} colSpan={4}>{title}</td></tr>
                <tr>
                  <td style={flab}>〒</td>
                  <td style={fcell}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <input style={fin} value={form[zipK]} onChange={e => set(zipK, e.target.value)} />
                      <button type="button" className="btn btn-outline btn-sm" style={{ margin: 3, whiteSpace: 'nowrap', fontSize: 10 }} onClick={() => lookupZip(dir)} disabled={zipBusy === dir}>{zipBusy === dir ? '…' : '住所から'}</button>
                    </div>
                  </td>
                  <td style={flab}>携帯電話</td>
                  <td style={fcell}><input style={fin} value={form[mobK]} onChange={e => set(mobK, e.target.value)} /></td>
                </tr>
                <tr>
                  <td style={flab}>住所</td>
                  <td style={fcell}><input style={fin} value={form[adK]} onChange={e => set(adK, e.target.value)} /></td>
                  <td style={flab}>自宅／勤務先</td>
                  <td style={fcell}>
                    <div style={{ display: 'flex' }}>
                      <input style={{ ...fin, borderRight: '1px solid #E2E8F0' }} value={form[homeK]} onChange={e => set(homeK, e.target.value)} placeholder="自宅" />
                      <input style={fin} value={form[workK]} onChange={e => set(workK, e.target.value)} placeholder="勤務先" />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          ))}

          {/* 確認日・確認者（紙では住所欄の右） */}
          <table style={{ ...table4, marginTop: 8, ...fband('#F0A868') }}>
            <colgroup>{COLS4.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <tbody>
              <tr>
                <td style={flab}>確認日</td>
                <td style={fcell}><input type="date" style={fin} value={form.confirmDate} onChange={e => set('confirmDate', e.target.value)} /></td>
                <td style={flab}>確認者</td>
                <td style={fcell}><input style={fin} value={form.confirmer} onChange={e => set('confirmer', e.target.value)} /></td>
              </tr>
            </tbody>
          </table>

          {/* 4. 作業内容の確認／ピアノ・エレクトーン／エアコン移設 */}
          <table style={{ ...table4, marginTop: 8, ...fband('#6BB8CC') }}>
            <colgroup>{COLS4.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <tbody>
              <tr>
                <td style={{ ...flab, background: '#E6F4F8' }} colSpan={2}>作業内容の確認</td>
                <td style={{ ...flab, background: '#E6F4F8' }} colSpan={2}>ピアノ/U・G エレクトーン・エアコン移設</td>
              </tr>
              <tr>
                <td style={flab}>小物梱包</td>
                <td style={fcell}><div style={{ padding: 4 }}><Seg choices={PERSON_CHOICES} value={form.packSmallBy} onChange={v => set('packSmallBy', v)} /></div></td>
                <td style={flab}>ピアノ・エレクトーン作業</td>
                <td style={fcell}><input style={fin} value={form.pianoWork} onChange={e => set('pianoWork', e.target.value)} placeholder="階段・エレベーター・窓出し 等" /></td>
              </tr>
              <tr>
                <td style={flab}>家具梱包</td>
                <td style={fcell}><div style={{ padding: 4 }}><Seg choices={PERSON_CHOICES} value={form.packFurniBy} onChange={v => set('packFurniBy', v)} /></div></td>
                <td style={flab}>エアコン セパレート（台）</td>
                <td style={fcell}><input type="number" min={0} style={fin} value={form.airconSep} onChange={e => set('airconSep', e.target.value)} /></td>
              </tr>
              <tr>
                <td style={flab}>開梱作業</td>
                <td style={fcell}><div style={{ padding: 4 }}><Seg choices={PERSON_CHOICES} value={form.packOpenBy} onChange={v => set('packOpenBy', v)} /></div></td>
                <td style={flab}>エアコン ウィンド（台）</td>
                <td style={fcell}><input type="number" min={0} style={fin} value={form.airconWindow} onChange={e => set('airconWindow', e.target.value)} /></td>
              </tr>
              <tr>
                <td style={flab}>オプション工事</td>
                <td style={fcell} colSpan={3}><input style={fin} value={form.optionWork} onChange={e => set('optionWork', e.target.value)} /></td>
              </tr>
            </tbody>
          </table>

          {/* 5. 作業状況 */}
          <table style={{ ...table4, marginTop: 8, ...fband('#6BB8CC') }}>
            <colgroup>{COLS4.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <tbody>
              <tr><td style={{ ...flab, background: '#E6F4F8' }} colSpan={4}>作業状況</td></tr>
              <tr>
                <td style={flab}>二ヶ所積み・降し</td>
                <td style={fcell}><input style={fin} value={form.twoPlace} onChange={e => set('twoPlace', e.target.value)} placeholder="[C]現地・[D]行先" /></td>
                <td style={flab}>道幅（横持ち作業）</td>
                <td style={fcell}><select style={fin} value={form.roadWidth} onChange={e => set('roadWidth', e.target.value)}>{ROAD_CHOICES.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select></td>
              </tr>
              <tr>
                <td style={flab}>エレベーター作業</td>
                <td style={fcell}><select style={fin} value={form.elevator} onChange={e => set('elevator', e.target.value)}>{YN.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select></td>
                <td style={flab}>窓吊り上下作業</td>
                <td style={fcell}><select style={fin} value={form.windowLift} onChange={e => set('windowLift', e.target.value)}>{YN.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select></td>
              </tr>
              <tr>
                <td style={flab}>機械作業</td>
                <td style={fcell}><select style={fin} value={form.machine} onChange={e => set('machine', e.target.value)}>{REQ_CHOICES.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select></td>
                <td style={flab}>依頼作業</td>
                <td style={fcell}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', padding: '4px 6px' }}>
                    {WORK_ITEMS.map(w => (
                      <label key={w} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={!!form.works?.[w]} onChange={e => set('works', { ...(form.works || {}), [w]: e.target.checked })} />
                        {w}
                      </label>
                    ))}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* 6. 家財（紙と同じ5列・全品目に数量を書き込む） */}
          <div style={{ marginTop: 8, border: '1px solid #CBD5E1', borderLeft: '4px solid #9AA3AB' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F4F6F8', padding: '6px 10px', borderBottom: '1px solid #CBD5E1' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>家財（数量を記入）</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#1E5FA8' }}>ポイント合計 {totals.points.toLocaleString('ja-JP')}</span>
            </div>
            <div className="scroll-x">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(178px, 1fr))', minWidth: 900 }}>
                {KAZAI_GROUPS.map((g, gi) => {
                  const gpts = g.items.reduce((sum, it) => sum + (it.pt ? num(form.items[it.key]) * it.pt : 0), 0)
                  return (
                    <div key={g.title} style={{ borderRight: gi < 4 ? '1px solid #E2E8F0' : 'none', display: 'flex', flexDirection: 'column' }}>
                      {g.items.map(it => {
                        const q = num(form.items[it.key])
                        return (
                          <div key={it.key} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #F1F5F9', background: q > 0 ? '#EFF6FF' : '#fff' }}>
                            <div style={{ flex: 1, minWidth: 0, fontSize: 10, padding: '2px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {it.name}{it.size ? ` ${it.size}` : ''}
                            </div>
                            <div style={{ width: 26, fontSize: 9, color: '#94A3B8', textAlign: 'right', flex: 'none' }}>{it.pt == null ? '/' : it.pt}</div>
                            <input type="number" min={0} inputMode="numeric" value={form.items[it.key] ?? ''}
                              onChange={e => setItemQty(it.key, e.target.value)}
                              style={{ width: 38, flex: 'none', margin: 1, padding: '2px 3px', border: '1px solid #E2E8F0', borderRadius: 4, fontSize: 11, textAlign: 'center', fontFamily: 'inherit', outline: 'none' }} />
                          </div>
                        )
                      })}
                      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', padding: '3px 6px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', fontSize: 10, fontWeight: 700 }}>
                        <span style={{ color: '#64748B' }}>小計</span><span>{gpts.toLocaleString('ja-JP')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 荷造資材（配達日・作業当日／工具類／作成日・配達日／保管・シークレット） */}
          <div style={{ marginTop: 8, border: '1px solid #CBD5E1', borderLeft: '4px solid #9AA3AB' }}>
            <div style={{ background: '#F4F6F8', padding: '6px 10px', borderBottom: '1px solid #CBD5E1', fontSize: 11, fontWeight: 700, color: '#334155' }}>荷造資材</div>
            <div className="scroll-x">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr>
                    <td style={flab}>品名</td>
                    <td style={{ ...flab, width: 120 }}>／日</td>
                    <td style={{ ...flab, width: 120 }}>／日</td>
                    <td style={{ ...flab, width: 80, textAlign: 'center' }}>作業当日</td>
                    <td style={flab}>工具・資材</td>
                  </tr>
                </thead>
                <tbody>
                  {FEE_C.map((f, i) => (
                    <tr key={f.key}>
                      <td style={{ ...fcell, padding: '4px 8px', fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>{f.label}</td>
                      <td style={fcell}><input style={fin} value={form.matDay1?.[f.key] ?? ''} onChange={e => set('matDay1', { ...(form.matDay1 || {}), [f.key]: e.target.value })} /></td>
                      <td style={fcell}><input style={fin} value={form.matDay2?.[f.key] ?? ''} onChange={e => set('matDay2', { ...(form.matDay2 || {}), [f.key]: e.target.value })} /></td>
                      <td style={{ ...fcell, textAlign: 'center' }}>
                        <input type="checkbox" checked={!!form.matOnDay?.[f.key]} onChange={e => set('matOnDay', { ...(form.matOnDay || {}), [f.key]: e.target.checked })} />
                      </td>
                      {i === 0 && (
                        <td style={{ ...fcell, verticalAlign: 'top' }} rowSpan={FEE_C.length}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8 }}>
                            {GEAR_ITEMS.map(g => (
                              <label key={g} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer' }}>
                                <input type="checkbox" checked={!!form.gear?.[g]} onChange={e => set('gear', { ...(form.gear || {}), [g]: e.target.checked })} />
                                {g}
                              </label>
                            ))}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  <tr>
                    <td style={flab}>作成日</td>
                    <td style={fcell}><input type="date" style={fin} value={form.createDate} onChange={e => set('createDate', e.target.value)} /></td>
                    <td style={flab}>配達日</td>
                    <td style={fcell} colSpan={2}><input type="date" style={fin} value={form.delivDate} onChange={e => set('delivDate', e.target.value)} /></td>
                  </tr>
                  <tr>
                    <td style={flab}>保管（迄）</td>
                    <td style={fcell}><input type="date" style={fin} value={form.storageUntil} onChange={e => set('storageUntil', e.target.value)} /></td>
                    <td style={flab}>シークレット</td>
                    <td style={fcell} colSpan={2}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', padding: '4px 8px' }}>
                        {SECRET_ITEMS.map(g => (
                          <label key={g} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!form.secretFlags?.[g]} onChange={e => set('secretFlags', { ...(form.secretFlags || {}), [g]: e.target.checked })} />
                            {g}
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 7. 請求先／お支払方法 */}
          <table style={{ ...table4, marginTop: 8, ...fband('#9AA3AB') }}>
            <colgroup>{COLS4.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <tbody>
              <tr>
                <td style={flab}>請求先 会社名</td>
                <td style={fcell}><input style={fin} value={form.billCompany} onChange={e => set('billCompany', e.target.value)} /></td>
                <td style={flab}>お支払方法</td>
                <td style={fcell}><select style={fin} value={form.payment} onChange={e => set('payment', e.target.value)}>{PAY_METHODS.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select></td>
              </tr>
              <tr>
                <td style={flab}>住所</td>
                <td style={fcell}><input style={fin} value={form.billAddress} onChange={e => set('billAddress', e.target.value)} /></td>
                <td style={flab}>領収書宛先名</td>
                <td style={fcell}><input style={fin} value={form.receiptName} onChange={e => set('receiptName', e.target.value)} /></td>
              </tr>
              <tr>
                <td style={flab}>電話</td>
                <td style={fcell}><input style={fin} value={form.billTel} onChange={e => set('billTel', e.target.value)} /></td>
                <td style={flab}>担当者</td>
                <td style={fcell}><input style={fin} value={form.billStaff} onChange={e => set('billStaff', e.target.value)} /></td>
              </tr>
              <tr>
                <td style={flab}>日〆／日払い</td>
                <td style={fcell}>
                  <div style={{ display: 'flex' }}>
                    <input style={{ ...fin, borderRight: '1px solid #E2E8F0' }} value={form.billClose} onChange={e => set('billClose', e.target.value)} placeholder="日〆" />
                    <input style={fin} value={form.billPayday} onChange={e => set('billPayday', e.target.value)} placeholder="日払い" />
                  </div>
                </td>
                <td style={flab}>請求書発送</td>
                <td style={fcell}><input style={fin} value={form.billSend} onChange={e => set('billSend', e.target.value)} /></td>
              </tr>
              <tr>
                <td style={flab}>確認</td>
                <td style={fcell}><input style={fin} value={form.confirmVisit} onChange={e => set('confirmVisit', e.target.value)} placeholder="／ AM・PM 時" /></td>
                <td style={flab}>カード（　）</td>
                <td style={fcell}><input style={fin} value={form.cardNote} onChange={e => set('cardNote', e.target.value)} /></td>
              </tr>
            </tbody>
          </table>

          {/* 8. お約束事項・備考 */}
          <table style={{ ...table4, marginTop: 8, ...fband('#9AA3AB') }}>
            <colgroup>{COLS4.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <tbody>
              <tr>
                <td style={flab}>お約束事項</td>
                <td style={fcell} colSpan={3}><textarea style={{ ...fin, minHeight: 52, resize: 'vertical' }} value={form.requestTo} onChange={e => set('requestTo', e.target.value)} placeholder="例：新居（〇〇町…）借家" /></td>
              </tr>
              <tr>
                <td style={flab}>備考・その他希望</td>
                <td style={fcell} colSpan={3}><textarea style={{ ...fin, minHeight: 40, resize: 'vertical' }} value={form.request} onChange={e => set('request', e.target.value)} /></td>
              </tr>
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4, lineHeight: 1.7 }}>
            注）電気製品の内部の故障は、外傷がない限り一切補償いたしかねますので、御了承ください。／貴重品、貴金属、現金等は必ずお客様の方で管理して下さい。／当日当社作業員が梱包した場合、梱包料として1ケースにつき1,500円頂く場合があります。
          </div>

          {/* 9. 料金（A〜D）＋合計 */}
          <div className="scroll-x" style={{ marginTop: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(238px, 1fr))', gap: 8, minWidth: 984 }}>
              <FeeBlock title="基本料金（A）" list={FEE_A} obj={form.feeA} onChange={(k, v) => setFee('feeA', k, v)} subtotal={totals.a} />
              <FeeBlock title="附帯料金（B）" list={FEE_B} obj={form.feeB} onChange={(k, v) => setFee('feeB', k, v)} subtotal={totals.b} />
              {/* 資材の料金（C）：紙のとおり数量と金額の両方を書ける */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ background: '#F1F5FB', padding: '7px 10px', fontSize: 11, fontWeight: 800, color: '#334155' }}>資材の料金（C）</div>
                <div style={{ padding: '6px 10px' }}>
                  {FEE_C.map(f => (
                    <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 0' }}>
                      <div style={{ flex: 1, minWidth: 40, fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.label}>{f.label}</div>
                      <input type="number" min={0} inputMode="numeric" value={form.matCount?.[f.key] ?? ''}
                        onChange={e => set('matCount', { ...(form.matCount || {}), [f.key]: e.target.value })}
                        style={{ ...feeInput, width: 44, flex: 'none' }} title={`数量（${f.unit}）`} />
                      <span style={{ fontSize: 10, color: '#94A3B8', width: 14 }}>{f.unit}</span>
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>¥</span>
                      <input type="number" min={0} inputMode="numeric" value={form.feeC?.[f.key] ?? ''}
                        onChange={e => setFee('feeC', f.key, e.target.value)}
                        style={{ ...feeInput, width: 66, flex: 'none' }} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', marginTop: 6, paddingTop: 6, fontSize: 12, fontWeight: 800 }}>
                    <span style={{ color: '#64748B' }}>小計（C）</span><span>{yen(totals.c)}</span>
                  </div>
                </div>
              </div>
              <FeeBlock title="その他の料金（D）" list={FEE_D} obj={form.feeD} onChange={(k, v) => setFee('feeD', k, v)} subtotal={totals.d} />
            </div>
          </div>

          {/* 合計（紙の右下と同じ並び：小計A〜D→合計→消費税→再計） */}
          <div style={{ marginTop: 8, border: '1px solid #CBD5E1', borderLeft: '4px solid #1E5FA8', background: '#F8FAFC', padding: '8px 12px' }}>
            <div className="scroll-x">
              <div style={{ display: 'flex', gap: 22, justifyContent: 'flex-end', alignItems: 'flex-end', minWidth: 720 }}>
                <TotalLine label="小計（A）" value={yen(totals.a)} />
                <TotalLine label="小計（B）" value={yen(totals.b)} />
                <TotalLine label="小計（C）" value={yen(totals.c)} />
                <TotalLine label="小計（D）" value={yen(totals.d)} />
                <TotalLine label="合計 (A)+(B)+(C)+(D)" value={yen(totals.goukei)} />
                <TotalLine label="消費税（10%）" value={yen(totals.tax)} />
                <TotalLine label="再計" value={yen(totals.saikei)} big />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'center', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '6px 10px' }}>
            お支払は、積込終了時にお願い致します。
          </div>

          {/* 媒体・ご紹介先・区分（紙の最下段） */}
          <table style={{ ...table4, marginTop: 8, ...fband('#9AA3AB') }}>
            <colgroup>{COLS4.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <tbody>
              <tr>
                <td style={flab}>媒体</td>
                <td style={fcell} colSpan={3}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', padding: '4px 8px' }}>
                    {MEDIA_ITEMS.map(m => (
                      <label key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={!!form.media?.[m]} onChange={e => set('media', { ...(form.media || {}), [m]: e.target.checked })} />
                        {m === '再利用' ? '再利用（回）' : m}
                      </label>
                    ))}
                  </div>
                </td>
              </tr>
              <tr>
                <td style={flab}>ご紹介先</td>
                <td style={fcell}><input style={fin} value={form.refName} onChange={e => set('refName', e.target.value)} /></td>
                <td style={flab}>区分</td>
                <td style={fcell}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', padding: '4px 8px', alignItems: 'center' }}>
                    {BIZ_ITEMS.map(m => (
                      <label key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!form.bizType?.[m]} onChange={e => set('bizType', { ...(form.bizType || {}), [m]: e.target.checked })} />
                        {m}
                      </label>
                    ))}
                    <input style={{ ...fin, width: 120, border: '1px solid #E2E8F0', borderRadius: 4, padding: '3px 6px' }} value={form.bizOther} onChange={e => set('bizOther', e.target.value)} placeholder="その他" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: 8, fontSize: 11, color: '#94A3B8' }}>
            ※ リード管理・追客の内容が自動で入り、ここで直した内容が優先されます。
          </div>
        </div>
      </div>


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
            <div style={{ flex: 1, fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.label}>{f.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>¥</span>
              <input type="number" min={0} inputMode="numeric" value={obj?.[f.key] ?? ''}
                onChange={e => onChange(f.key, e.target.value)}
                style={{ ...feeInput, width: 84, flex: 'none' }} />
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
  // 紙の御見積書（会社控）を再現した印刷レイアウト。
  // 空欄は空欄のまま印刷する（紙と同じく、書いていない欄は白）。
  const bd = '1px solid #333'
  // minWidth: 0 が肝。global.css の table { min-width: 500px } が印刷面にも効いてしまい、
  // グリッド列が 500px まで押し広げられて右側のブロック（発送内容・見積日・料金C/D等）が
  // 紙面の外へはみ出す。tableLayout: fixed と合わせて紙の枠幅を守る。
  // whiteSpace: normal が必須。global.css の td { white-space: nowrap } が効いたままだと
  // 注記や長い文が折り返されず、セルの右端で切れてしまう
  const pl = { border: bd, background: '#F2F2F2', fontWeight: 700, fontSize: 9, padding: '2px 4px', whiteSpace: 'normal' }
  const pc = { border: bd, fontSize: 10, padding: '2px 5px', overflow: 'hidden', whiteSpace: 'normal' }
  const tbl = { borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', minWidth: 0 }
  // 縦積みラベル（電話・確認者・作業状況など、紙の縦組みセルを再現）
  // writing-mode はテーブルセル内で文字が重なって描画されるため、<br/>で1文字ずつ積む
  const vert = { ...pl, textAlign: 'center', padding: '2px 0', lineHeight: 1.2, verticalAlign: 'middle' }
  // 未記入時に紙の下地（月 日 など）を薄く見せる
  const gy = { color: '#999' }
  // 選択肢：選ばれたものを丸で囲む（紙の「○で囲む」を再現）。tight は詰め表示（媒体行など）
  const Opt = ({ on, tight, children }) => (
    <span style={{ display: 'inline-block', padding: tight ? '0 1px' : '0 4px', margin: tight ? 0 : '0 1px', borderRadius: 9,
      border: on ? '1.6px solid #C2410C' : '1.6px solid transparent', fontWeight: on ? 800 : 400 }}>{children}</span>
  )
  const Chk = ({ on }) => <span style={{ fontWeight: 800 }}>{on ? '☑' : '☐'}</span>
  const gpts = (g) => g.items.reduce((sum, it) => sum + (it.pt ? num(form.items[it.key]) * it.pt : 0), 0)

  return (
    <div style={{ ...modalOverlay, alignItems: 'flex-start', overflow: 'auto', padding: 0 }}>
      <div style={{ width: '100%', minHeight: '100%', background: '#525659', padding: '16px 0' }}>
        <div className="no-print" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
          <button className="btn btn-outline" style={{ background: '#fff' }} onClick={onClose}>← 戻る</button>
          <button className="btn btn-primary" onClick={() => window.print()}>🖨 印刷 / PDF</button>
        </div>

        <div className="print-area" style={{ width: 880, maxWidth: '97%', margin: '0 auto', background: '#fff', padding: 18, color: '#111', fontFamily: "'Noto Sans JP', sans-serif" }}>

          {/* 見出し＋受付（紙と同じく受付(1)(2)は独立した2つの枠） */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 3, flex: 1 }}>御 見 積 書 <span style={{ fontSize: 14 }}>（会社控）</span></div>
            {[['受付(1)', form.reception1], ['受付(2)', form.reception2]].map(([lab, val]) => (
              <table key={lab} style={{ borderCollapse: 'collapse', width: 160, minWidth: 0, marginLeft: 18 }}>
                <tbody>
                  <tr><td style={{ ...pl, width: 46 }}>{lab}</td><td style={pc}>{val}</td></tr>
                </tbody>
              </table>
            ))}
          </div>

          {/* 最上段：紙と同じ5ブロック（日程2×2／スペース〜補助車輌／引越F・F〜距離／発送内容／見積日〜見積者氏名） */}
          <div style={{ display: 'grid', gridTemplateColumns: '236px 128px 104px 168px 1fr', gap: 3, marginTop: 4 }}>
            <table style={tbl}><tbody>
              <tr>
                <td style={{ ...pl, width: 40 }}>引越日</td>
                <td style={{ ...pc, fontSize: 8.5 }}>{form.moveDate ? `${form.moveDate} ${{ AM: 'AM', PM: 'PM' }[form.moveAP] || ''}` : <span style={gy}>月 日 AM・PM 時</span>}</td>
                <td style={{ ...pl, width: 40 }}>梱包日</td>
                <td style={{ ...pc, fontSize: 8.5 }}>{form.packDate || <span style={gy}>月 日 AM・PM 時</span>}</td>
              </tr>
              <tr>
                <td style={pl}>お届日</td>
                <td style={{ ...pc, fontSize: 8.5 }}>{form.deliverDate ? `${form.deliverDate} ${form.deliverAP || ''}` : <span style={gy}>月 日 AM・PM 時</span>}</td>
                <td style={pl}>開梱日</td>
                <td style={{ ...pc, fontSize: 8.5 }}>{form.openDate || <span style={gy}>月 日 AM・PM 時</span>}</td>
              </tr>
            </tbody></table>
            <table style={tbl}><tbody>
              <tr><td style={{ ...pl, width: 52, fontSize: 8 }}>スペース</td><td style={{ ...pc, fontSize: 8.5 }}>{form.spaceSize}</td></tr>
              <tr><td style={{ ...pl, fontSize: 8 }}>作業量</td><td style={{ ...pc, fontSize: 8.5 }}>{form.workLoad || <span style={gy}>〜</span>}</td></tr>
              <tr><td style={{ ...pl, fontSize: 8 }}>梱包・開梱</td><td style={{ ...pc, fontSize: 8.5 }}>{form.packOpenCar || <span style={gy}>／</span>}</td></tr>
              <tr><td style={{ ...pl, fontSize: 8 }}>補助車輌</td><td style={{ ...pc, fontSize: 8.5 }}>{['現', '行'].includes(form.helperCar) ? <><Opt on={form.helperCar === '現'}>現</Opt>・<Opt on={form.helperCar === '行'}>行</Opt></> : (form.helperCar || <span style={gy}>現 ・ 行</span>)}</td></tr>
            </tbody></table>
            <table style={tbl}><tbody>
              <tr><td style={{ ...pl, width: 52, fontSize: 8 }}>引 越</td><td style={{ ...pc, fontSize: 8.5 }}>{form.moveFF || <span style={gy}>F　F</span>}</td></tr>
              <tr><td style={{ ...pl, fontSize: 6.5, padding: '2px 2px' }}>ピアノ/U・G</td><td style={{ ...pc, fontSize: 8.5 }}>{form.pianoFF || <span style={gy}>F　F</span>}</td></tr>
              <tr><td style={{ ...pl, fontSize: 8 }}>距 離</td><td style={{ ...pc, fontSize: 8.5 }}>{form.distanceKm ? `${form.distanceKm} km` : <span style={gy}>km</span>}</td></tr>
            </tbody></table>
            <table style={tbl}><tbody>
              <tr><td style={{ ...pl, textAlign: 'center' }}>発 送 内 容</td></tr>
              <tr>
                <td style={{ ...pc, fontSize: 7.5, padding: '0 2px', textAlign: 'center' }}><Opt tight on={form.sendType === '直送一式'}>直送一式</Opt>・<Opt tight on={form.sendType === '直送長距離'}>直送・長距離</Opt></td>
              </tr>
              <tr>
                <td style={{ ...pc, fontSize: 7.5, padding: '0 2px', textAlign: 'center' }}><Opt tight on={form.sendType === '限定混載便'}>限定　混載便</Opt></td>
              </tr>
              <tr>
                <td style={{ ...pc, fontSize: 7.5, padding: '0 2px', textAlign: 'center' }}><Opt tight on={form.sendType === '積切'}>積切</Opt></td>
              </tr>
            </tbody></table>
            <table style={tbl}><tbody>
              <tr><td style={{ ...pl, width: 46 }}>見積日</td><td style={{ ...pc, fontSize: 8.5 }}>{form.estimateDate || <span style={gy}>年 月 日</span>}</td></tr>
              <tr><td style={pl}>受付日</td><td style={{ ...pc, fontSize: 8.5 }}>{form.requestDate || <span style={gy}>年 月 日</span>}</td></tr>
              <tr><td style={{ ...pl, fontSize: 7.5, lineHeight: 1.15 }}>見積者<br />氏 名</td><td style={{ ...pc, fontSize: 8.5 }}>{form.estimator}</td></tr>
            </tbody></table>
          </div>

          {/* お名前（紙と同じく右側に確認書の注記＋フロント欄） */}
          <table style={{ ...tbl, marginTop: 3 }}>
            <tbody>
              <tr>
                <td style={{ ...pl, width: 58, fontSize: 7 }}>フリガナ</td>
                <td style={{ ...pc, fontSize: 9 }}>{form.kana}</td>
                <td style={{ ...pc, width: 214, fontSize: 5.5, lineHeight: 1.3, color: '#333', padding: '1px 4px' }} rowSpan={2}>
                  ○裏面の「確認書」をお読み下さい。<br />
                  ○このお見積は、お客様のお荷物を、御指定日に御指定の場所へお運びするためのものです。お運びする方法（車輌・人数）は、おまかせ下さい。
                </td>
                {/* フロントは紙と同じく横書きラベル＋記入欄 */}
                <td style={{ ...pc, width: 74, padding: 0, verticalAlign: 'top' }} rowSpan={2}>
                  <div style={{ background: '#F2F2F2', borderBottom: '1px solid #999', fontWeight: 700, fontSize: 7.5, textAlign: 'center', padding: '1px 2px' }}>フロント</div>
                  <div style={{ fontSize: 9, padding: '2px 4px', minHeight: 16 }}>{form.front}</div>
                </td>
              </tr>
              <tr>
                <td style={pl}>お 名 前</td>
                <td style={{ ...pc, fontSize: 14, fontWeight: 800 }}>{form.name}<span style={{ float: 'right', fontSize: 11 }}>様</span></td>
              </tr>
            </tbody>
          </table>

          {/* [A]現住所／[B]転居先（紙と同じく 電話は縦書きラベル、[A]右端=確認日・[B]右端=確認者） */}
          {[
            ['[A]', '現住所', form.fromZip, form.fromAddress, form.fromTelHome, form.fromTelWork, form.fromTelMobile, true],
            ['[B]', '転居先', form.toZip, form.toAddress, form.toTelHome, form.toTelWork, form.toTelMobile, false],
          ].map(([mark, title, zip, addr, home, work, mob, first]) => (
            <table key={mark} style={{ ...tbl, marginTop: 3 }}>
              <tbody>
                <tr>
                  <td style={{ ...pl, fontSize: 6.5, padding: '0 3px' }} colSpan={8}>フリガナ</td>
                </tr>
                <tr>
                  <td style={{ ...pl, width: 56, textAlign: 'center' }} rowSpan={3}>{mark}<br />{title}</td>
                  {/* 〒 を住所欄の上に重ねる（紙と同じ区画割り） */}
                  <td style={{ ...pc, padding: 0 }} rowSpan={3} colSpan={2}>
                    <div style={{ borderBottom: '1px solid #999', fontSize: 9, padding: '1px 5px', width: 130, borderRight: '1px solid #999' }}>〒 {zip || <span style={gy}>−</span>}</div>
                    <div style={{ fontSize: 10, padding: '3px 5px', minHeight: 34 }}>{addr}</div>
                  </td>
                  <td style={{ ...vert, width: 18, fontSize: 8 }} rowSpan={3}>電<br />話</td>
                  <td style={{ ...pl, width: 46 }}>自 宅</td>
                  <td style={{ ...pc, width: 104, fontSize: 9 }}>{home || <span style={gy}>− −</span>}</td>
                  {first
                    ? <td style={{ ...pl, width: 100, textAlign: 'center' }} colSpan={2}>確 認 日</td>
                    : <><td style={{ ...vert, width: 20, fontSize: 8 }} rowSpan={3}>確<br />認<br />者</td><td style={{ ...pc, width: 78 }} rowSpan={3}>{form.confirmer}</td></>}
                </tr>
                <tr>
                  <td style={pl}>勤務先</td>
                  <td style={{ ...pc, fontSize: 9 }}>{work || <span style={gy}>− −</span>}</td>
                  {first && <td style={{ ...pc, textAlign: 'center', fontSize: 9 }} colSpan={2} rowSpan={2}>{form.confirmDate || <span style={gy}>月 日（ ）</span>}</td>}
                </tr>
                <tr>
                  <td style={{ ...pl, fontSize: 7.5 }}>携帯電話</td>
                  <td style={{ ...pc, fontSize: 9 }}>{mob || <span style={gy}>− −</span>}</td>
                </tr>
              </tbody>
            </table>
          ))}

          {/* 作業内容の確認／ピアノ（左=現住所・右=届先住所）／エアコン移設（左=取外・右=取付）／オプション工事 */}
          {/* 1行目が colSpan なので固定レイアウトの列幅が決まらない。colgroup で明示する */}
          <table style={{ ...tbl, marginTop: 3 }}>
            <colgroup>
              {[54, 148, 104, 104, 118, 118, null].map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}
            </colgroup>
            <tbody>
              <tr>
                <td style={{ ...pl, textAlign: 'center' }} colSpan={2}>作 業 内 容 の 確 認</td>
                <td style={{ ...pl, textAlign: 'center', fontSize: 8 }} colSpan={2}>
                  ピアノ/U・G エレクトーン作業{form.pianoWork ? <span style={{ fontWeight: 400, fontSize: 7 }}>　{form.pianoWork}</span> : ''}
                </td>
                <td style={{ ...pl, textAlign: 'center', fontSize: 6.5 }} colSpan={2}>エアコン移設（パイプ延長・ガス補充等別途）くわしいことは係員までお問い合せ下さい</td>
                <td style={{ ...pl, textAlign: 'center' }}>オプション工事</td>
              </tr>
              <tr>
                <td style={{ ...pl, fontSize: 8 }}>小物梱包</td>
                <td style={pc}>{PERSON_CHOICES.map(c => <Opt key={c} on={form.packSmallBy === c}>{c}</Opt>)}<span style={{ fontSize: 8, color: '#555' }}>（ALL・Part）</span></td>
                <td style={{ ...pc, fontSize: 8 }}>現住所○　F</td>
                <td style={{ ...pc, fontSize: 8 }}>届先住所○　F</td>
                <td style={{ ...pc, fontSize: 8 }}>取外住所○</td>
                <td style={{ ...pc, fontSize: 8 }}>取付住所○</td>
                <td style={pc} rowSpan={3}>{form.optionWork}</td>
              </tr>
              <tr>
                <td style={{ ...pl, fontSize: 8 }}>家具梱包</td>
                <td style={pc}>{PERSON_CHOICES.map(c => <Opt key={c} on={form.packFurniBy === c}>{c}</Opt>)}<span style={{ fontSize: 8, color: '#555' }}>（D・E）➡</span></td>
                <td style={{ ...pc, fontSize: 8 }}>階段・エレベーター ➡</td>
                <td style={{ ...pc, fontSize: 8 }}>階段・エレベーター</td>
                <td style={{ ...pc, fontSize: 8 }}>セパレートS/W {form.airconSep}台 ➡</td>
                <td style={{ ...pc, fontSize: 8 }}>セパレートS/W {form.airconSep}台</td>
              </tr>
              <tr>
                <td style={{ ...pl, fontSize: 8 }}>開梱作業</td>
                <td style={pc}>{PERSON_CHOICES.map(c => <Opt key={c} on={form.packOpenBy === c}>{c}</Opt>)}<span style={{ fontSize: 8, color: '#555' }}>（ALL・Part）</span></td>
                <td style={{ ...pc, fontSize: 8 }}>窓出し・機械</td>
                <td style={{ ...pc, fontSize: 8 }}>窓出し・機械</td>
                <td style={{ ...pc, fontSize: 8 }}>ウィンドS/W {form.airconWindow}台</td>
                <td style={{ ...pc, fontSize: 8 }}>ウィンドS/W {form.airconWindow}台</td>
              </tr>
            </tbody>
          </table>

          {/* 作業状況（紙と同じ [C]現地／[D]行先 の2行。選択値は[C]行に○を付ける） */}
          <table style={{ ...tbl, marginTop: 3 }}>
            <colgroup>
              {[22, 46, null, 128, 100, 82, 76].map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}
            </colgroup>
            <tbody>
              <tr>
                <td style={{ ...vert, fontSize: 7.5, lineHeight: 1.1 }} rowSpan={3}>作<br />業<br />状<br />況</td>
                <td style={{ ...pl, textAlign: 'center' }} colSpan={2}>二 ヶ 所 積 み ・ 降 し</td>
                <td style={{ ...pl, textAlign: 'center', fontSize: 8 }}>道 幅（横持ち作業）</td>
                <td style={{ ...pl, textAlign: 'center', fontSize: 8 }}>エレベーター作業</td>
                <td style={{ ...pl, textAlign: 'center', fontSize: 8 }}>窓吊上下作業</td>
                <td style={{ ...pl, textAlign: 'center', fontSize: 8 }}>機械作業</td>
              </tr>
              <tr>
                <td style={{ ...pl, fontSize: 7.5, textAlign: 'center', lineHeight: 1.15 }}>[C]<br />現地</td>
                <td style={{ ...pc, fontSize: 9 }}>{form.twoPlace}</td>
                <td style={{ ...pc, fontSize: 8, textAlign: 'center', padding: '1px 2px' }}>{ROAD_CHOICES.filter(Boolean).map((c, i) => <Fragment key={c}>{i > 0 && '・'}<Opt on={form.roadWidth === c}>{c}(ᵐ)</Opt></Fragment>)}</td>
                <td style={{ ...pc, fontSize: 8, textAlign: 'center', padding: '1px 2px' }}><Opt on={form.elevator === '有'}>人乗(ᵐ)</Opt>・<Opt on={form.elevator === '無'}>無</Opt></td>
                <td style={{ ...pc, fontSize: 8, textAlign: 'center', padding: '1px 2px' }}><Opt on={form.windowLift === '有'}>F</Opt>・<Opt on={form.windowLift === '無'}>無</Opt></td>
                <td style={{ ...pc, fontSize: 8, textAlign: 'center', padding: '1px 2px' }}><Opt on={form.machine === '要'}>要</Opt>・<Opt on={form.machine === '不要'}>不要</Opt></td>
              </tr>
              <tr>
                <td style={{ ...pl, fontSize: 7.5, textAlign: 'center', lineHeight: 1.15 }}>[D]<br />行先</td>
                <td style={pc}></td>
                <td style={{ ...pc, fontSize: 8, textAlign: 'center' }}>S(ᵐ)・M(ᵐ)・L(ᵐ)</td>
                <td style={{ ...pc, fontSize: 8, textAlign: 'center' }}>人乗(ᵐ)・無</td>
                <td style={{ ...pc, fontSize: 8, textAlign: 'center' }}>F・無</td>
                <td style={{ ...pc, fontSize: 8, textAlign: 'center' }}>要・不要</td>
              </tr>
            </tbody>
          </table>

          {/* 家財（紙と同じ5列・全品目）＋右端に荷造資材の縦ブロック（紙と同じ6列構成） */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) 1.35fr', border: bd, marginTop: 3 }}>
            {KAZAI_GROUPS.map((g) => {
              // 紙と同じく、品目が少ない列は空行で埋めて小計を最下段に揃える
              const maxRows = Math.max(...KAZAI_GROUPS.map(x => x.items.length))
              return (
                <div key={g.title} style={{ borderRight: bd, display: 'flex', flexDirection: 'column' }}>
                  {g.items.map((it, i) => {
                    const q = num(form.items[it.key])
                    // 紙と同じく、同名が続く行は「〃」で表す
                    const dispName = i > 0 && g.items[i - 1].name === it.name ? '〃' : it.name
                    return (
                      <div key={it.key} style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #999' }}>
                        <div style={{ flex: 1, fontSize: 8, padding: '1px 3px', whiteSpace: 'nowrap', overflow: 'hidden' }}>{dispName === '〃' ? <span style={{ paddingLeft: 12 }}>〃</span> : dispName}{it.size ? ` ${it.size}` : ''}</div>
                        <div style={{ width: 20, fontSize: 7.5, color: '#555', textAlign: 'right', paddingRight: 2 }}>{it.pt == null ? '/' : it.pt}</div>
                        <div style={{ width: 20, borderLeft: '1px solid #999', fontSize: 9, fontWeight: 800, textAlign: 'center' }}>{q > 0 ? q : ''}</div>
                        <div style={{ width: 13, borderLeft: '1px solid #999' }}></div>
                      </div>
                    )
                  })}
                  {Array.from({ length: maxRows - g.items.length }, (_, i) => (
                    <div key={`fill-${i}`} style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #999' }}>
                      <div style={{ flex: 1, fontSize: 8, padding: '1px 3px' }}>&nbsp;</div>
                      <div style={{ width: 20 }}></div>
                      <div style={{ width: 20, borderLeft: '1px solid #999' }}></div>
                      <div style={{ width: 13, borderLeft: '1px solid #999' }}></div>
                    </div>
                  ))}
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, fontWeight: 800, padding: '1px 4px', background: '#F2F2F2' }}>
                    <span>小 計</span><span>{gpts(g).toLocaleString('ja-JP')}</span>
                  </div>
                </div>
              )
            })}
            {/* 6列目：荷造資材（レンタル日×2＋作業当日）→作成日・配達日・工具類→ポイント合計→保管→シークレット */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ ...pl, border: 'none', borderBottom: '1px solid #999', textAlign: 'center' }}>荷 造 資 材</div>
              <table style={{ ...tbl, tableLayout: 'fixed' }}>
                <colgroup><col /><col style={{ width: 26 }} /><col style={{ width: 26 }} /><col style={{ width: 30 }} /></colgroup>
                <tbody>
                  <tr>
                    <td style={{ ...pc, border: 'none', borderBottom: '1px solid #999' }}></td>
                    <td style={{ ...pl, border: 'none', borderBottom: '1px solid #999', borderLeft: '1px solid #999', fontSize: 6.5, textAlign: 'center' }}>／日</td>
                    <td style={{ ...pl, border: 'none', borderBottom: '1px solid #999', borderLeft: '1px solid #999', fontSize: 6.5, textAlign: 'center' }}>／日</td>
                    <td style={{ ...pl, border: 'none', borderBottom: '1px solid #999', borderLeft: '1px solid #999', fontSize: 6, textAlign: 'center', padding: '2px 0' }}>作業当日</td>
                  </tr>
                  {FEE_C.map(f => (
                    <tr key={f.key}>
                      <td style={{ ...pc, border: 'none', borderBottom: '1px solid #999', fontSize: 6.8, whiteSpace: 'nowrap', padding: '1px 3px' }}>{f.label}</td>
                      <td style={{ ...pc, border: 'none', borderBottom: '1px solid #999', borderLeft: '1px solid #999', fontSize: 8, textAlign: 'center', padding: '1px 1px' }}>{form.matDay1?.[f.key]}</td>
                      <td style={{ ...pc, border: 'none', borderBottom: '1px solid #999', borderLeft: '1px solid #999', fontSize: 8, textAlign: 'center', padding: '1px 1px' }}>{form.matDay2?.[f.key]}</td>
                      <td style={{ ...pc, border: 'none', borderBottom: '1px solid #999', borderLeft: '1px solid #999', fontSize: 8, textAlign: 'center', padding: '1px 1px' }}>{form.matOnDay?.[f.key]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table style={{ ...tbl, tableLayout: 'fixed' }}>
                <colgroup><col style={{ width: 40 }} /><col /><col style={{ width: 46 }} /></colgroup>
                <tbody>
                  <tr>
                    <td style={{ ...pl, border: 'none', borderBottom: '1px solid #999', fontSize: 7 }}>作成日</td>
                    <td style={{ ...pc, border: 'none', borderBottom: '1px solid #999', fontSize: 8 }}>{form.createDate}</td>
                    <td style={{ ...pc, border: 'none', borderBottom: '1px solid #999', borderLeft: '1px solid #999', fontSize: 7, padding: '1px 2px' }}><Opt on={!!form.gear?.['ロープ']}>ロープ</Opt></td>
                  </tr>
                  <tr>
                    <td style={{ ...pl, border: 'none', borderBottom: '1px solid #999', fontSize: 7 }}>配達日</td>
                    <td style={{ ...pc, border: 'none', borderBottom: '1px solid #999', fontSize: 8 }}>{form.delivDate}</td>
                    <td style={{ ...pc, border: 'none', borderBottom: '1px solid #999', borderLeft: '1px solid #999', fontSize: 7, padding: '1px 2px' }}><Opt on={!!form.gear?.['ハシゴ']}>ハシゴ</Opt></td>
                  </tr>
                  <tr>
                    <td style={{ ...pl, border: 'none', borderBottom: '1px solid #999', fontSize: 7 }} rowSpan={3}>ポイント<br />合 計</td>
                    <td style={{ ...pc, border: 'none', borderBottom: '1px solid #999', fontWeight: 900, fontSize: 12, textAlign: 'center', verticalAlign: 'middle' }} rowSpan={3}>{totals.points > 0 ? totals.points.toLocaleString('ja-JP') : ''}</td>
                    <td style={{ ...pc, border: 'none', borderBottom: '1px solid #999', borderLeft: '1px solid #999', fontSize: 7, padding: '1px 2px' }}><Opt on={!!form.gear?.['工具']}>工具</Opt></td>
                  </tr>
                  <tr>
                    <td style={{ ...pc, border: 'none', borderBottom: '1px solid #999', borderLeft: '1px solid #999', fontSize: 7, padding: '1px 2px' }}><Opt on={!!form.gear?.['台車']}>台車</Opt></td>
                  </tr>
                  <tr>
                    <td style={{ ...pc, border: 'none', borderBottom: '1px solid #999', borderLeft: '1px solid #999', fontSize: 7, padding: '1px 2px' }}><Opt on={!!form.gear?.['養生資材']}>養生資材</Opt></td>
                  </tr>
                  <tr>
                    <td style={{ ...pl, border: 'none', borderBottom: '1px solid #999', fontSize: 7 }}>保 管</td>
                    <td style={{ ...pc, border: 'none', borderBottom: '1px solid #999', fontSize: 8 }} colSpan={2}>{form.storageUntil ? `${form.storageUntil} 迄` : <span style={gy}>年 月 日迄</span>}</td>
                  </tr>
                  <tr>
                    <td style={{ ...pl, border: 'none', fontSize: 5.5, padding: '2px 1px' }}>シークレット</td>
                    <td style={{ ...pc, border: 'none', fontSize: 6.5, padding: '1px 2px' }} colSpan={2}>{SECRET_ITEMS.map((g, i) => <Fragment key={g}>{i > 0 && '・'}<Opt tight on={!!form.secretFlags?.[g]}>{g}</Opt></Fragment>)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 下段：紙と同じ2カラム。左＝請求先・お約束事項・料金A/B/C、右＝お支払方法〜再計のサイドバー */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 216px', gap: 3, marginTop: 3 }}>
            <div>
              {/* 請求先 */}
              <table style={tbl}>
                <colgroup>
                  {[86, null, 40, 96, 26].map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}
                </colgroup>
                <tbody>
                  <tr>
                    <td style={{ ...pl, fontSize: 8 }}>請求先 会社名</td>
                    <td style={pc}>{form.billCompany}</td>
                    <td style={{ ...pl, fontSize: 8 }}>確 認</td>
                    <td style={{ ...pc, fontSize: 8.5 }}>{form.confirmVisit || <span style={gy}>／ AM・PM 時</span>}</td>
                    <td style={{ ...pc, fontSize: 8.5, textAlign: 'center' }}>様</td>
                  </tr>
                  <tr>
                    <td style={{ ...pl, fontSize: 8 }}>住 所</td>
                    <td style={pc} colSpan={4}>{form.billAddress}</td>
                  </tr>
                </tbody>
              </table>
              <table style={tbl}>
                <colgroup>
                  {[120, 32, null, 44, 96, 56, 60].map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}
                </colgroup>
                <tbody>
                  <tr>
                    <td style={{ ...pc, fontSize: 8.5, borderTop: 'none' }}>{(form.billClose || form.billPayday) ? `${form.billClose ? `${form.billClose} 日〆` : ''}　${form.billPayday ? `${form.billPayday} 日払い` : ''}` : <span style={gy}>／ 日〆　／ 日払い</span>}</td>
                    <td style={{ ...pl, borderTop: 'none' }}>電話</td>
                    <td style={{ ...pc, fontSize: 9, borderTop: 'none' }}>{form.billTel || <span style={gy}>− −</span>}</td>
                    <td style={{ ...pl, borderTop: 'none' }}>担当者</td>
                    <td style={{ ...pc, fontSize: 9, borderTop: 'none' }}>{form.billStaff}{form.billStaff ? '　様' : <span style={gy}>　様</span>}</td>
                    <td style={{ ...pl, fontSize: 7.5, borderTop: 'none' }}>請求書発送</td>
                    <td style={{ ...pc, fontSize: 8.5, borderTop: 'none' }}>{form.billSend || <span style={gy}>／</span>}</td>
                  </tr>
                </tbody>
              </table>

              {/* お約束事項＋注意書き＋黒帯（縦ラベルは紙と同じく注意書きの行まで跨ぐ） */}
              <div style={{ border: bd, borderTop: 'none', display: 'flex' }}>
                <div style={{ ...pl, border: 'none', borderRight: bd, width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 8.5, lineHeight: 1.5 }}>
                  お<br />約<br />束<br />事<br />項
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ minHeight: 52, fontSize: 10, padding: '4px 6px', whiteSpace: 'pre-wrap' }}>
                    {form.requestTo}
                    {form.request ? `${form.requestTo ? '\n' : ''}${form.request}` : ''}
                  </div>
                  <div style={{ borderTop: bd, display: 'flex', alignItems: 'stretch' }}>
                    <div style={{ flex: 1, fontSize: 7, color: '#333', padding: '3px 6px', lineHeight: 1.55 }}>
                      注）電気製品の内部の故障は、外傷がない限り一切補償いたしかねますので、御了承ください。<br />
                      注）貴重品、貴金属、現金等は必ずお客様の方で管理して下さい。<br />
                      注）当日当社作業員が梱包した場合、梱包料として1ケースにつき1,500円頂く場合があります。<br />
                      注）裏面の注意事項をよくお読み下さい。
                    </div>
                    <div style={{ width: 232, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#fff', fontWeight: 800, fontSize: 10.5, padding: '4px 8px', textAlign: 'center' }}>
                      お支払は、積込終了時にお願い致します。
                    </div>
                  </div>
                </div>
              </div>

              {/* 料金（A・B・C） */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 3, marginTop: 3 }}>
                <table style={tbl}><tbody>
                  <tr><td style={{ ...pl, textAlign: 'center' }} colSpan={2}>基 本 料 金</td></tr>
                  {FEE_A.map(f => (
                    <tr key={f.key}><td style={{ ...pl, fontWeight: 400, fontSize: 8 }}>{f.label}</td><td style={{ ...pc, textAlign: 'right', fontSize: 9 }}>{num(form.feeA?.[f.key]) > 0 ? `¥ ${num(form.feeA[f.key]).toLocaleString('ja-JP')}` : <span style={gy}>¥</span>}</td></tr>
                  ))}
                  <tr><td style={{ ...pl, fontWeight: 400, fontSize: 8 }}></td><td style={{ ...pc, textAlign: 'right', fontSize: 9 }}><span style={gy}>¥</span></td></tr>
                  <tr><td style={pl}>小 計（A）</td><td style={{ ...pc, textAlign: 'right', fontWeight: 800, fontSize: 9 }}>{totals.a > 0 ? `¥ ${totals.a.toLocaleString('ja-JP')}` : <span style={gy}>¥</span>}</td></tr>
                </tbody></table>
                <table style={tbl}><tbody>
                  <tr><td style={{ ...pl, textAlign: 'center' }} colSpan={2}>附 帯 料 金</td></tr>
                  {FEE_B.map(f => (
                    <tr key={f.key}><td style={{ ...pl, fontWeight: 400, fontSize: 8 }}>{f.label}</td><td style={{ ...pc, textAlign: 'right', fontSize: 9 }}>{num(form.feeB?.[f.key]) > 0 ? `¥ ${num(form.feeB[f.key]).toLocaleString('ja-JP')}` : <span style={gy}>¥</span>}</td></tr>
                  ))}
                  <tr><td style={pl}>小 計（B）</td><td style={{ ...pc, textAlign: 'right', fontWeight: 800, fontSize: 9 }}>{totals.b > 0 ? `¥ ${totals.b.toLocaleString('ja-JP')}` : <span style={gy}>¥</span>}</td></tr>
                </tbody></table>
                <table style={tbl}>
                  <colgroup>
                    {[null, 18, 52, 18, 52].map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}
                  </colgroup>
                  <tbody>
                    <tr><td style={{ ...pl, textAlign: 'center' }} colSpan={5}>資 材 の 料 金</td></tr>
                    {FEE_C.map(f => (
                      <tr key={f.key}>
                        <td style={{ ...pl, fontWeight: 400, fontSize: 7 }}>{f.label}</td>
                        <td style={{ ...pc, fontSize: 7, textAlign: 'center', padding: '1px 1px' }}>{num(form.matCount?.[f.key]) > 0 ? `${form.matCount[f.key]}${f.unit}` : <span style={gy}>{f.unit}</span>}</td>
                        <td style={{ ...pc, textAlign: 'right', fontSize: 8.5, padding: '1px 3px' }}>{num(form.feeC?.[f.key]) > 0 ? `¥ ${num(form.feeC[f.key]).toLocaleString('ja-JP')}` : <span style={gy}>¥</span>}</td>
                        <td style={{ ...pc, fontSize: 7, textAlign: 'center', padding: '1px 1px' }}><span style={gy}>{f.unit}</span></td>
                        <td style={{ ...pc, textAlign: 'right', fontSize: 8.5, padding: '1px 3px' }}><span style={gy}>¥</span></td>
                      </tr>
                    ))}
                    <tr><td style={pl} colSpan={3}>小 計（C）</td><td style={{ ...pc, textAlign: 'right', fontWeight: 800, fontSize: 9 }} colSpan={2}>{totals.c > 0 ? `¥ ${totals.c.toLocaleString('ja-JP')}` : <span style={gy}>¥</span>}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 右サイドバー：お支払方法〜再計（紙の右端の縦並び） */}
            <table style={tbl}><tbody>
              <tr><td style={{ ...pl, textAlign: 'center' }} colSpan={2}>お 支 払 方 法</td></tr>
              <tr>
                <td style={{ ...pc, textAlign: 'center', fontSize: 9.5, padding: '3px 2px' }} colSpan={2}>
                  {['現金', '前受金', '会社請求'].map((c, i) => <Fragment key={c}>{i > 0 && ' ・ '}<Opt on={form.payment === c}>{c}</Opt></Fragment>)}
                </td>
              </tr>
              <tr>
                <td style={{ ...pc, fontSize: 9 }} colSpan={2}><Opt on={form.payment === 'カード'}>カード</Opt>（{form.cardNote}）</td>
              </tr>
              <tr>
                <td style={{ ...pl, fontSize: 7.5, width: 76 }}>領収書宛先名</td>
                <td style={{ ...pc, fontSize: 8.5 }}>{form.receiptName}</td>
              </tr>
              <tr><td style={{ ...pl, textAlign: 'center' }} colSpan={2}>そ の 他 の 料 金</td></tr>
              {FEE_D.map(f => (
                <tr key={f.key}><td style={{ ...pl, fontWeight: 400, fontSize: 7.5 }}>{f.label}</td><td style={{ ...pc, textAlign: 'right', fontSize: 8.5, width: 74 }}>{num(form.feeD?.[f.key]) > 0 ? `¥ ${num(form.feeD[f.key]).toLocaleString('ja-JP')}` : <span style={gy}>¥</span>}</td></tr>
              ))}
              <tr><td style={pl}>小 計（D）</td><td style={{ ...pc, textAlign: 'right', fontWeight: 800, fontSize: 9 }}>{totals.d > 0 ? `¥ ${totals.d.toLocaleString('ja-JP')}` : <span style={gy}>¥</span>}</td></tr>
              <tr>
                <td style={{ ...pl, fontSize: 8, lineHeight: 1.3 }} rowSpan={2}>合 計<br />(A)+(B)+(C)+(D)</td>
                <td style={{ ...pc, textAlign: 'right', fontWeight: 800, fontSize: 9.5 }}>{totals.goukei > 0 ? `¥ ${totals.goukei.toLocaleString('ja-JP')}` : <span style={gy}>¥</span>}</td>
              </tr>
              <tr><td style={{ ...pc, textAlign: 'right', fontSize: 9 }}><span style={gy}>¥</span></td></tr>
              <tr><td style={pl}>総 合 計</td><td style={{ ...pc, textAlign: 'right', fontSize: 9 }}><span style={gy}>¥</span></td></tr>
              <tr><td style={pl}>消 費 税</td><td style={{ ...pc, textAlign: 'right', fontSize: 9 }}>{totals.tax > 0 ? `¥ ${totals.tax.toLocaleString('ja-JP')}` : <span style={gy}>¥</span>}</td></tr>
              <tr><td style={{ ...pl, fontSize: 11 }}>再 計</td><td style={{ ...pc, textAlign: 'right', fontWeight: 900, fontSize: 12 }}>{totals.saikei > 0 ? `¥${totals.saikei.toLocaleString('ja-JP')}` : <span style={gy}>¥</span>}</td></tr>
            </tbody></table>
          </div>

          {/* 最下段：媒体・紹介先／会社情報／区分（紙と同じ・区切りの1行と3セル並び） */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.1fr 0.75fr', gap: 3, marginTop: 3 }}>
            <table style={tbl}><tbody>
              <tr>
                <td style={{ ...pc, fontSize: 6.5, padding: '2px 2px', whiteSpace: 'nowrap' }}>
                  {MEDIA_ITEMS.map((m, i) => <Fragment key={m}>{i > 0 && '・'}<Opt tight on={!!form.media?.[m]}>{m === '再利用' ? '再利用 回' : m}</Opt></Fragment>)}
                </td>
              </tr>
              <tr>
                <td style={{ ...pc, height: 34, verticalAlign: 'top' }}><span style={{ fontSize: 8, fontWeight: 700, color: '#333' }}>ご紹介先</span>　{form.refName}</td>
              </tr>
            </tbody></table>
            <div style={{ border: bd, textAlign: 'center', fontSize: 8.5, lineHeight: 1.5, padding: 3 }}>
              <div style={{ fontSize: 12, fontWeight: 900 }}>{COMPANY.name}</div>
              <div>{COMPANY.zip} {COMPANY.address}</div>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>☎ {COMPANY.tel}</div>
              <div>FAX {COMPANY.fax}　登録番号 {COMPANY.regNo}</div>
            </div>
            <table style={tbl}><tbody>
              <tr>
                {BIZ_ITEMS.map(m => (
                  <td key={m} style={{ ...pc, textAlign: 'center', fontSize: 9.5, padding: '4px 2px' }}><Opt on={!!form.bizType?.[m]}>{m}</Opt></td>
                ))}
              </tr>
              <tr>
                <td style={{ ...pc, height: 30, verticalAlign: 'top' }} colSpan={3}><span style={{ fontSize: 8, color: '#555' }}>その他</span>　{form.bizOther}</td>
              </tr>
            </tbody></table>
          </div>
        </div>
      </div>
    </div>
  )
}
