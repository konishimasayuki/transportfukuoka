// 車両フリートの初期値（配車ボードと設定の「トラック設定」で共有）。
// 実データは /api/dispatch の _fleet に保存され、これはその未設定時のデフォルト。
export const DEFAULT_FLEET = [
  { key: 'v1', id: '831', cls: '2t', crew: '田中 / 佐藤', n: 2 },
  { key: 'v2', id: '712', cls: '2tロング', crew: '山本 / 中村', n: 2 },
  { key: 'v3', id: '405', cls: '3t', crew: '高橋班', n: 3 },
  { key: 'v4', id: '218', cls: '4t', crew: '伊藤班', n: 3 },
  { key: 'v5', id: '109', cls: '軽', crew: '小林', n: 1 },
]

// 車両クラスの選択肢（トラック設定・配車ボードの車両モーダルで共通利用）。
export const TRUCK_CLASSES = ['軽', '2t', '2tロング', '3t', '4t', '外注枠']
