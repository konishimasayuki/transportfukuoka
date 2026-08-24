// フィールド定義とマスターデータ。
// key は既存CRM（src/tabs/Estimate.jsx）の家財キーと揃えてあり、
// 稼働中サイトからの流し込みにそのまま使える。

// 家財表（原本の並び。名称・点数は原本＝Excel で確認済み）
// pt: null は「/」表示（ピアノ等）、'' は空欄（TVブラ等）
export const KAZAI_COLS = [
  [ // 列1 タンス・棚類
    ['youdansu_A','洋ダンス','A',59],['youdansu_B','〃','B',45],['youdansu_C','〃','C',35],['youdansu_U','〃','U',80],
    ['wadansu_A','和ダンス','A',41],['wadansu_B','〃','B',34],['wadansu_U','〃','U',50],
    ['seiri_A','整理ダンス','A',35],['seiri_B','〃','B',26],['seiri_U','〃','U',50],
    ['baby_A','ベビーダンス','A',34],['baby_B','〃','B',18],
    ['blazer','ブレザーダンス','',39],['locker','ロッカーダンス','',18],
    ['shokki_A','食器棚','A',53],['shokki_B','〃','B',39],['shokki_C','〃','C',27],
    ['hondana_A','本　棚','A',34],['hondana_B','〃','B',27],['hondana_U','〃','U',65],
    ['metalrack','メタルラック','',20],['livingboard','リビングボード','',50],['sideboard','サイドボード','',22],
  ],
  [ // 列2 家具・寝具類
    ['tvboard','テレビボード','',62],['ousetsu','応接セット','',85],['writedesk','ライティングデスク','',25],
    ['tsukue_U','机','U',22],['tsukue_B','〃','B',18],['oshiire','押入ダンス','',12],
    ['bed_S','ベッド','S',40],['bed_SW','〃','SW',46],['bed_W','〃','W',54],
    ['babybed','ベビーベッド','',9],['bed2','2段ベッド','',41],
    ['sofa3','ソファー3人用','',46],['sofa2','〃 2人用','',31],['sofa1','〃 1人用','',20],
    ['dresser','ドレッサー','',14],['sugatami','姿　見','',4],
    ['getabako_T','下駄箱 縦','',18],['getabako_Y','〃　横','',13],
    ['denwadai','電　話　台','',5],['tvdai','テレビ台','',4],['sukima','すき間家具','',6],
    ['lowboard','ローボード','',14],['chest','チェスト','',16],
  ],
  [ // 列3 家電・キッチン類
    ['table_wy','和・洋テーブル','',9],['fridge_6A','冷蔵庫6ドアA','',31],['fridge_4B','〃　4ドアB','',27],
    ['fridge_3C','〃　3ドアC','',24],['fridge_2D','〃　2ドアD','',18],['fridge_miniE','〃　ミニE','',6],
    ['minicompo','ミニコンポ','',2],['aircon_S','エアコンS','',6],['aircon_W','〃　W','',2],
    ['washer_drum','洗濯機ドラム','',15],['washer_full','洗濯機全自動','',13],['dryer','乾　燥　機','',8],
    ['tv_brown','TVブラ（ ）','',''],['tv_thin','TV薄型（ ）','',''],
    ['video','ビ　デ　オ','',0.5],['pc','パソコン','',10],['range','レ　ン　ジ','',2],['rangedai','レンジ台','',12],
    ['gascon','ガスコンロ','',1.5],['kitchen_c','キッチンカウンター','',16],
    ['shokutaku_A','食卓セットA','',57],['shokutaku_B','〃　B','',38],['wagon','ワ　ゴ　ン','',6],
  ],
  [ // 列4 生活用品・その他
    ['onpuuki','温 風 機','',2],['souji','掃 除 機','',1.5],['senpuuki','扇 風 機','',1],['mishin','ミ シ ン','',1],
    ['kotatsu','こ た つ','',9],['futonbukuro','ふ と ん 袋','',12],['zabuton','座ぶとんケース','',5],
    ['ishou','衣裳ケース','',3],['jutan','ジュータン','',8],['ningyou','人形ケース','',5],['gogatsu','五月人形','',10],
    ['minibike','ミニバイク','',38],['jitensha','自 転 車','',28],['sanrinsha','三 輪 車','',3],
    ['piano_U','ピアノU','',null],['piano_G','〃　G','',null],['electone_A','エレクトーンA','',null],['electone_B','〃　B','',24],
    ['kinko','金庫(高さ40cmまで)','',3],['shoumei','照 明 器 具','',1.5],['gaku','額','',1],['colorbox','カラーボックス','',5],
  ],
  [ // 列5 仏壇ほか
    ['butsudan_A','御 仏 壇 A','',35],['butsudan_B','〃　B','',23],['butsudan_C','〃　C','',10],
    ['kanyou','観 葉 植 物','',7],['monooki_A','物 置 A','',28],['monooki_B','〃　B','',16],['monohoshi','物 干 台','',10],
    ['pipehanger','パイプハンガー','',8],['fancycase','ファンシーケース','',2.5],['hangerbox','ハンガーボックス','',7],
    ['dan_small','ダンボール 小','',1.5],['dan_mid','〃　中','',2.5],['dan_wa','〃　和','',2.5],
  ],
]

// 荷造資材（右端ブロックの上段行）
export const MATERIAL_ROWS = [
  ['mtSmall','小'],['mtMid','中'],['mtWa','和'],['tape','ガムテープ'],['futon','ふとん袋'],
  ['hbox','ハンガーボックス'],['lightron','ライトロンクレープ紙'],['aircap','エアーキャップ'],
]
export const GEAR_ITEMS = ['ロープ','ハシゴ','工　具','台　車','養生資材']

// 料金表
export const FEE_A = [
  ['space','ス ペ ー ス 料'],['work','作　業　料'],['distance','車 輌 距 離 料'],['road','ロードアクセス料'],
  ['floor','階 数 割 増'],['yokomochi','横 持 割 増'],['hojo','補 助 車 輌 料'],['piston','ピ ス ト ン 料'],[null,''],
]
export const FEE_B = [
  ['packSmall','小 物 梱 包 料'],['packFurni','家 具 梱 包 料'],['open','開　梱　料'],['storage','保　管　料'],
  ['deliver','配　達　料'],['disposal','不 用 品 引 取 料'],['mixed','混　載　料'],['lift','吊 り 上 下 料'],['twoPlace','二 ヶ 所 積 降 料'],
]
export const FEE_C = [
  ['mtSmall','小','枚'],['mtMid','中','枚'],['mtWa','和','枚'],['tape','ガムテープ','ケ'],['futon','ふとん袋','枚'],
  ['hbox','ハンガー|ボックス','ケ'],['lightron','ライトロン|クレープ紙','枚'],['aircap','エアー|キャップ','本'],
]
export const FEE_D = [
  ['aircon','エアコン基本工事','外し|付け'],['antenna','アンテナ（脱・着）',''],['tvWire','テ レ ビ 配 線',''],
  ['videoWire','ビデオ・DVD配線',''],['pianoFee','ピアノ・エレクトーン料',''],['carCarrier','カ ー キ ャ リ ー',''],
  ['cleaning','ハウスクリーニング',''],['washer','洗濯機付(ドラム・全自動)',''],[null,''],
]

// 単純テキスト系フィールドの一元管理（selector は index.html の data-field と一致）
export const fields = {}
for (const name of [
  'reception1','reception2',
  'moveMonth','moveDay','moveHour','packMonth','packDay','packHour',
  'deliverMonth','deliverDay','deliverHour','unpackMonth','unpackDay','unpackHour',
  'spaceSize','workLoad','packOpenCar',
  'moveFloorFrom','moveFloorTo','pianoFloorFrom','pianoFloorTo','distanceKm',
  'estimateDate','requestDate','estimatorName','frontNote',
  'customerFurigana','customerName',
  'currentFurigana','currentPostal','currentAddress','curTelHome','curTelWork','curTelMobile',
  'confirmDate','confirmerName',
  'destFurigana','destPostal','destAddress','dstTelHome','dstTelWork','dstTelMobile',
  'airconSepFrom','airconSepTo','airconWinFrom','airconWinTo','optionWork',
  'twoPlaceC','twoPlaceD','roadSC','roadMC','roadLC','roadSD','roadMD','roadLD','elevMC','elevMD',
  'promiseText','createDate','delivDate','storageUntil',
  'billName','billAddr','billConfirm','billTel','billStaff','billSend','billClose','billPay',
  'cardNote','receiptName','refName','bizOther',
]) fields[name] = { selector: `[data-field="${name}"]`, type: 'text' }
