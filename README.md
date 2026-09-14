# transportfukuoka — 引越し業者向け 業務管理システム

一括査定サイト（ズバット・引越し侍・価格.com）に届いたリードを自動で取り込み、
架電・追客・成約・見積書・配車までを1画面で管理する社内システム。

- 本番: https://transportfukuoka.vercel.app
- 構成: React 18 + Vite（SPA）／ Vercel Functions（`api/`）／ Upstash Redis（REST）
- リードの取り込みは **Chrome拡張** が各サイトの管理画面を巡回して行う（後述）

---

## 動かす

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ を生成
npm run preview    # ビルド結果を確認
```

ログインは **ID と パスワードが同じ文字列**（クライアント側だけの簡易認証）。

| ID | 用途 |
|---|---|
| `a` | デモ（サーバに繋がない。ダミーデータ） |
| `b` | 本番データ |
| `z` | 紹介用デモ（デバッグタブ非表示・架空データ） |

`npm run dev` では `api/` は動きません（Viteは静的配信のみ）。APIを含めて確認したい場合は
本番URLを見るか、`tests/` の擬似サーバを使ってください。

**必要なもの**: Node 22 以上（本番のVercelは Node 24.x）。

---

## ディレクトリ

```
src/                  画面（React）
  App.jsx             タブの切替とログイン状態
  tabs/               各タブの中身
  components/         詳細モーダル・配車ボード・サイドバー等
  lib/                共通ロジック（広告費計算・並び替え・CSV・メール定型文ほか）
  styles/global.css   全画面のCSS（1ファイルにまとめている）
api/                  Vercel Functions。`_` 始まりはURLにならない内部モジュール
public/estimate-form/ 御見積書のA4帳票（原本を実測して再構築したHTML）
extension/            リード監視のChrome拡張（3サイトを巡回）
extension-notify/     新着通知だけのChrome拡張（CRMを開かなくても通知）
formcheck/            帳票の実測比較ツール（デプロイ対象外）
tests/                api/ と extension/ の実コードを動かす検証
docs/                 調査記録
```

---

## 画面

| タブ | 内容 |
|---|---|
| ダッシュボード | 当月の売上・成約件数・問い合わせ数・広告費 |
| 売上管理 | 月別の売上と広告費、粗利 |
| 広告費 | リード件数からの反響課金の自動算出（日別・サイト別） |
| リード管理 | 取り込んだリードの一覧・詳細・ステータス変更 |
| 成約管理 | 成約案件の管理。売上登録日カレンダーで日別の成約額を確認 |
| 追客 | 「要追客」のリードと成約をまとめた一覧 |
| 見積り管理 | リード管理をステータス「見積り」で絞った表示 |
| エアコン依頼 / 段ボール配達 | 成約管理を用途別に絞った表示 |
| 見積書 | A4帳票の作成・編集・印刷（`public/estimate-form/`） |
| 配車ボード | 日別の車両×案件の割当 |
| 設定 | 担当者・メール定型文・会社情報 |
| デバッグ / デバッグ依頼 | 開発用（`hideDev` のユーザーには出ない） |

**現在使っていないタブ**: 架電機能・月カレンダー。`src/App.jsx` の `OFF_TABS` で塞いでいる。
コードは残してあるので、配列から外せば戻る。

---

## API

`api/*.js` が1ファイル1エンドポイント。`_` 始まりは共通モジュール。

| エンドポイント | 用途 |
|---|---|
| `inbound` | リードの取得・登録・更新・削除。拡張からの取り込み先 |
| `contracts` | 成約 |
| `estimate` | 見積書 |
| `schedule` | 予定（月カレンダー） |
| `dispatch` | 車両・乗務員の設定 |
| `expenses` | 経費（広告費） |
| `staff` | 担当者 |
| `mail` | お客様へのメール送信と定型文 |
| `broadcast` | 社内お知らせ（新着通知に混ぜて配信） |
| `status` | 巡回拡張の生存ステータス |
| `push` | Web Push の購読 |
| `call` / `voice` / `voice-inbound` / `usage` | Twilio 架電（現在停止中） |
| `debug` / `debugreq` | 開発用 |

内部モジュール: `_kvstore`（Redis＋楽観ロック）／`_mailer`（SMTP・Resend）／
`_push`（Web Push）／`_twilio`／`_konichat`

### 注意：`/api/*` に認証はありません

URLを知っていれば誰でも読み書きできます。画面のログインはクライアント側だけの見た目上のものです。
社外に公開しない前提で運用してください。

---

## データ

Upstash Redis に **JSON配列を1キー1テーブルで丸ごと** 保存しています。

| キー | 中身 |
|---|---|
| `transportfukuoka:leads` | リード全件（＋ `:ver` は楽観ロック用のバージョン） |
| `transportfukuoka:leads:meta` | 新着通知用の軽量サマリ（直近10件＋総件数） |
| `transportfukuoka:contracts` | 成約（＋ `:ver`） |
| `transportfukuoka:estimates` | 見積書 |
| `transportfukuoka:schedule` | 予定 |
| `transportfukuoka:expenses` | 経費 |
| `transportfukuoka:staff` | 担当者 |
| `transportfukuoka:dispatch` | 車両・乗務員 |
| `transportfukuoka:broadcasts` | 社内お知らせ |
| `transportfukuoka:mailtemplate` | メール定型文 |
| `transportfukuoka:statusmap` | 巡回の生存ステータス（`:status` は旧キー） |
| `transportfukuoka:pushsubs` | Web Push の購読 |

**書き込みは必ず `api/_kvstore.js` の `mutate()` を通してください。**
「読む→加工→丸ごと書き戻す」方式のため、素で `GET`→`SET` すると同時書き込みで
リードが消えます。`mutate()` はバージョン番号による楽観ロック（CAS）で防いでいます。

保存データが壊れている場合、`_kvstore` は **空配列として扱わずエラーにします**。
1件の取り込み失敗で済ませ、全件消失を防ぐためです。ここは変えないでください。

---

## 外部サービス

| サービス | 用途 |
|---|---|
| Vercel | ホスティング（フロント＋API） |
| Upstash Redis | データ保存 |
| Resend または SMTP | お客様へのメール送信 |
| Twilio | 架電（現在停止中） |
| Google Maps | 配車ボードの経路表示（キーは画面から設定） |

巡回先: `hikkoshi-kanri.zba.jp`（ズバット）／`hikkosizamurai.com`（引越し侍）／
`ssl.kakaku.com`（価格.com）

---

## 環境変数

Vercel の Environment Variables に設定します。**値はこのリポジトリに置かないでください。**

### 必須

| 変数名 | 用途 |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Redis 接続先 |
| `UPSTASH_REDIS_REST_TOKEN` | Redis トークン |

### メール送信（使うなら。SMTPとResendはどちらか一方でよい）

| 変数名 | 用途 |
|---|---|
| `MAIL_FROM` | 差出人（例 `会社名 <info@example.com>`） |
| `MAIL_REPLY_TO` / `MAIL_BCC` | 任意 |
| `RESEND_API_KEY` | Resend を使う場合 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` / `SMTP_REQUIRE_TLS` | SMTP を使う場合 |

両方入っている場合は SMTP が優先されます。

### Web Push（未設定＝無効。設定すると新着を押し込みで通知できる）

`VAPID_PUBLIC` / `VAPID_PRIVATE` / `VAPID_SUBJECT`

鍵は `npx web-push generate-vapid-keys` で生成します。

### Twilio 架電（現在停止中）

`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` / `TWILIO_AUTOCALL` /
`CALLER_ID` / `CALL_MESSAGE` / `CALL_VOICEMAIL_MESSAGE` / `INBOUND_GREETING` /
`OFFICE_PHONE` / `PUBLIC_BASE_URL`

### その他

`KONICHAT_INGEST_URL` / `KONICHAT_INGEST_SECRET`

---

## デプロイ

`main` に push すると Vercel が自動でデプロイします（`vercel.json` は無く既定設定）。

**Chrome拡張はデプロイに含まれません。** `extension/` `extension-notify/` を変更したら、
巡回PCで拡張を入れ直す必要があります（`chrome://extensions` → 再読み込み）。

---

## Chrome拡張

### `extension/` — リード監視（v0.47.0）

3サイトの管理画面を開いたタブで巡回し、新着リードを `/api/inbound` へ送ります。

- 巡回間隔: 7〜24時は12〜23秒（サイトごと）、深夜は120秒に減速
- 間隔にはランダムな揺らぎを入れ、連続エラー時は指数的に待つ（**BAN対策。詰めないこと**）
- セッション切れ時は保存した資格情報で自動再ログイン（誤パスワードで即停止・失敗の上限2回。夜22〜6時は再ログインを休止し、朝に上限をリセット）
- 巡回のたびに `/api/status` へ生存ステータスを送る

### `extension-notify/` — 新着通知（v1.0.2）

`/api/inbound?recent=5` を約12秒ごとに見て、新着があればOS通知を出します。
CRMを開いていなくても、Chromeが動いていれば通知が届きます。

---

## テストと検証

```bash
node tests/run-all.mjs        # api/ と extension/ の実コードを動かす（Redisはメモリ模倣）
```

現状 **151 PASS / 0 FAIL**。同時書き込みでの取りこぼし、重複リードでのメモ保護、
データ破損時の全件消失防止などを見ています。詳細は `tests/README.md`。

帳票（見積書）の実測比較は `formcheck/`（Python + Playwright、デプロイ対象外）。
使い方は `public/estimate-form/README.md`。

---

## 触るときの注意

- **`api/_kvstore.js` の `mutate()` を経由せずにデータを書かない**（同時書き込みでリードが消える）
- **巡回の間隔を短くしない**（アカウント停止の恐れ。現在の値がぎりぎり）
- **`api/*` は無認証**。新しいエンドポイントを足すときも同じ前提になる
- 架電機能・月カレンダーは `OFF_TABS` で塞いでいる。消してはいない
- リードは約3,900件（2026-09時点）で全件 約5MB。件数が増えると一覧の読み込みが重くなる

---

## 関連ドキュメント

- `tests/README.md` — テストの中身
- `public/estimate-form/README.md` — 御見積書帳票の構成と計測環境
- `docs/caller-id-service-comparison.md` — 発信者番号表示サービスの比較調査（2026-06）
