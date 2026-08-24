# 御見積書 HTML/CSS 再構築フォーム

原本スキャン（`public/IMG_9280.jpeg`）を数値計測して HTML/CSS で再構築した、
入力・印刷・データ連携ができる実用フォーム。背景画像は使っていない。

## 構成
```
public/estimate-form/
├─ index.html          … 帳票本体（静的ブロック＋data-field入力欄）
├─ css/
│  ├─ reset.css        … 最小リセット
│  ├─ sheet.css        … A4キャンバス・座標変数・フォント
│  ├─ blocks.css       … ブロック別の実測座標（mm）
│  ├─ fields.css       … 入力欄（帳票の線と一体化）
│  └─ print.css        … A4印刷（縮小解除＋印刷ラスタライザ補正）
├─ js/
│  ├─ fields.js        … 家財・料金のマスターデータとフィールド一覧
│  ├─ form-data.js     … applyFormData / readFormData（外部データ連携）
│  └─ app.js           … 動的表の生成・計算・スマホ縮小・debugオーバーレイ
└─ fonts/              … 同梱フォント（IPAPGothicサブセット）＋ライセンス

formcheck/              … 実測比較環境（デプロイ対象外）
├─ normalize.py        … スキャンをA4 1654x2339pxへ正規化
├─ lines.py            … 罫線座標の抽出
├─ render.mjs          … 固定条件レンダリング（画面PNG＋印刷PDF）
├─ compare.py          … 5指標の実測（Geometry35/Edge30/SSIM20/Gray10/Raw5）
├─ compare_pdf.py      … 印刷PDFの実測
├─ geo_report.py       … 罫線誤差レポート
├─ validate.mjs        … スマホ／入力不動／計算の検証
└─ out/                … reference-normalized / overlay / diff / best / history
```

## 使い方
- 表示: `/estimate-form/index.html`（vite dev または Vercel 配信）
- データ流し込み:
  `window.estimateForm.applyFormData({ customerName: '…', kz_youdansu_A: 2, feeA_space: 30000 })`
- 回収: `window.estimateForm.readFormData()`
- 開発時の原本重ね合わせ: `?debug=overlay`
- 印刷: ブラウザ印刷で A4縦・余白なし・倍率100%・背景グラフィックON

## 計測条件（固定）
- 基準画像: スキャンを傾き補正(-0.0647°)し 1654×2339px(A4@200dpi) へ正規化
- レンダリング: Chromium / viewport 1000px / DPR2 / 同梱フォント
- 総合一致度 = Geometry 35% + Edge 30% + SSIM 20% + Grayscale 10% + RawPixel 5%
- ノイズ床（レイアウト完全一致でも残る差）: 総合 98.08%
  （スキャンの筆跡ゴースト・紙ムラ・JPEGノイズによる）

## 実測値（2026-08-24 時点のベスト）
- 画面: 総合 80.97%（Raw 91.0 / Gray 91.0 / SSIM 64.7 / Edge 85.8 / Geometry 81.0）
- 印刷PDF: 総合 78.86%
- 履歴: formcheck/out/history.jsonl

## 備考
- 登録番号（インボイス）は原本に印字がないため出していない。
  必要なら会社情報ブロック（index.html の .company）へ1行追加する。
- 社印（赤い印影)は再現しない方針。
