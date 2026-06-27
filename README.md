# くまのみ整体院 経営ダッシュボード

整体院グループの総合ダッシュボード。**Next.js (App Router) + Supabase + Vercel** 構成へ移行中。

現在は **Phase 1: 成増店トライアル**（日報入力・売上/成績追跡・契約メモ・AIフィードバック）を実装しています。

- 旧ダッシュボード（単一HTML / GASバックエンド）は `legacy/index.html` に退避しています。移行計画は [`MIGRATION.md`](./MIGRATION.md)、旧コードのエラー見直し結果は [`REVIEW.md`](./REVIEW.md) を参照。

---

## 技術構成

| 項目 | 内容 |
| --- | --- |
| フロント / API | Next.js 14 (App Router, TypeScript) |
| DB / 認証 | Supabase (Postgres + Auth + RLS) |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| ホスティング | Vercel |
| グラフ | Recharts |

---

## セットアップ

### 1. 依存関係

```bash
npm install
```

### 2. 環境変数

`.env.example` をコピーして `.env.local` を作成し、値を設定します。

```bash
cp .env.example .env.local
```

| 変数 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key（公開可・RLSで保護） |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key（**サーバー専用・非公開**） |
| `ANTHROPIC_API_KEY` | Claude APIキー |
| `ANTHROPIC_MODEL` | 任意。既定 `claude-sonnet-4-6` |
| `SEED_DEFAULT_PASSWORD` | シード用の初期パスワード |

### 3. データベース初期化

Supabase Dashboard → **SQL Editor** で以下を順に実行します。

1. `supabase/migrations/0001_init.sql` … テーブル / ビュー / RLS
2. `supabase/migrations/0002_report_redesign.sql` … 日報項目リニューアル（次回予約数・2回目予約数・契約内容・振り返り/明日の行動）
3. `supabase/migrations/0003_cashbook.sql` … 出納帳（cashbook_entries テーブル + RLS）
4. `supabase/migrations/0004_attendance.sql` … 勤怠（attendance_records テーブル + stores に lat/lng 追加 + RLS）
5. `supabase/migrations/0005_members_tickets.sql` … 会員・回数券（customers / ticket_plans / customer_tickets / ticket_usages + RLS + 既定プラン）
6. `supabase/migrations/0006_rbac.sql` … 権限基盤（departments / members.scope・department_id / member_store_access / role_permissions + 既定マトリクス）
7. `supabase/migrations/0007_rls_enforcement.sql` … RLS強化（役割・スコープ・担当店舗に基づくポリシーへ置換）
8. `supabase/migrations/0008_media_channels.sql` … 媒体（集客チャネル）マスタ + 既定媒体 + RLS
9. `supabase/migrations/0009_add_epark_channel.sql` … 媒体に EPARK 追加
10. `supabase/migrations/0010_genre_stores_media.sql` … 業態(整体/エステ) + エステ5店舗(大宮/銀座/越谷/川越/熊谷) + 媒体の業態/単価対応 + 契約メモに金額
11. `supabase/migrations/0011_menu_plans.sql` … メニュー・料金表マスタ(menu_plans) + RLS
12. `supabase/migrations/0012_departments_by_genre.sql` … 整体部門/エステ部門を作成し店舗・メンバーを業態で割当
13. `supabase/migrations/0013_contract_menu_link.sql` … 契約メモに料金表メニュー連携(menu_plan_id/menu_label)
14. `supabase/migrations/0014_add_ageo_store.sql` … 上尾店（エステ部門）を追加
15. `supabase/migrations/0015_esthe_fields_help_store.sql` … エステ日報の追加項目(物販/継続/その他) + 契約メモ回数 + ヘルプ先計上のためRLS書き込み緩和
16. `supabase/seed_menu.sql` … エステ料金表データ（回数券/サブスク/脱毛/大宮/銀座/越谷）
16. （任意）`supabase/seed.sql` … 成増店レコード

### 4. メンバー（5名）の作成

Auth ユーザーと `members` 行をまとめて作成します。

```bash
npm run seed:members
```

作成されるアカウント（初期パスワードは `SEED_DEFAULT_PASSWORD`）:

| 氏名 | メール |
| --- | --- |
| 日野碧人 | hino@kumanomi-narimasu.jp |
| 宮本渚朗 | miyamoto@kumanomi-narimasu.jp |
| 大野愛夏 | ohno@kumanomi-narimasu.jp |
| 永井諒 | nagai@kumanomi-narimasu.jp |
| 高山大志 | takayama@kumanomi-narimasu.jp |

> メールアドレスはダミーです。実際の運用に合わせて `scripts/seed-members.mjs` の `MEMBERS` を編集するか、Supabase Dashboard で変更してください。

### 5. ローカル起動

```bash
npm run dev
# http://localhost:3000
```

### 6. Vercel デプロイ

1. Vercel に本リポジトリをインポート（フレームワークは自動で Next.js を検出）
2. 上記の環境変数を Vercel のプロジェクト設定に登録
3. デプロイ

`GET /api/health` で環境変数の設定状況を確認できます。

---

## 主な画面

| パス | 内容 |
| --- | --- |
| `/login` | ログイン |
| `/` | 今月のダッシュボード（売上目標進捗・新規/契約・メンバー別成績・推移グラフ） |
| `/reports/new` | 日報入力（売上 / 施術数(既存)→次回予約数 / 新規数→2回目予約数 / 新規のお客様ごとの契約記録(回数券・定額)・理由 / 今日の振り返り / 明日の行動）＋AIフィードバック |
| `/reports` | 日報一覧 |
| `/cashbook` | 出納帳（入金/出金の記帳・現金残高・レジ金チェック・月間/カテゴリ別集計） |
| `/attendance` | 勤怠管理（出退勤打刻・GPS位置確認・月次履歴/勤務時間集計） |
| `/posture` | 姿勢分析（カメラ＋MediaPipe Poseで正面/側面のスコア算出・Before/After比較・画像保存） |
| `/report-card` | 施術レポート（カード型レポート作成・PNG書き出し） |
| `/members` | 会員・回数券管理（会員名簿・回数券プラン・回数券の発行/消化・KPI） |
| `/concierge` | 診断・提案（エステ専用：お悩み診断→おすすめメニュー/プラン・SPECIAL） |
| `/menu` | 料金表（業態・店舗に応じた回数券/サブスク/脱毛/店舗限定メニューを参照） |

> ## ブランド表示（業態別）
> ログイン中メンバーの業態でヘッダーのブランド名・ロゴが切り替わります。エステ＝**Premium Body Balance**、整体＝**くまのみ整体院**。
> ロゴ画像は `public/logo-pbb.png`（エステ）/ `public/logo-kumanomi.png`（整体）に配置（背景透過PNG推奨）。未配置でもブランド名テキストで表示されます（詳細は `public/README.md`）。
| `/admin/members` | 権限管理：スタッフの追加・削除、役割・データ範囲・担当店舗の割当（staff_admin=管理 のみ） |
| `/admin/roles` | 権限管理：役割×機能の権限マトリクス編集（なし/閲覧/編集/管理） |
| `/admin/media` | 媒体（集客チャネル）設定：日報の契約メモで選べる媒体の追加/有効無効/削除 |
| `/admin/menu` | 料金表の編集：金額・回数・区分の編集/追加/削除（org_admin=編集 のみ） |

> ## 権限管理（RBAC）について
>
> 役割は **全体管理者(owner) / 部門管理者(dept_manager) / マネージャー(manager) / 店長(store_manager) / スタッフ(staff)** の5種。
> 役割×機能の操作レベル（なし/閲覧/編集/管理）は `/admin/roles` で、各スタッフの役割・データ範囲・担当店舗は `/admin/members` で設定します（`staff_admin` を「管理」できる役割のみアクセス可）。
>
> **初回は管理者(owner)を1名指定してください**（シードの5名は既定で `staff`）。Supabase SQL Editor で:
> ```sql
> update public.members set role = 'owner', scope = 'all' where email = 'hino@kumanomi-narimasu.jp';
> -- ↑ 管理者にしたいメンバーのメールに置き換え
> ```
> Phase A〜D まで実装済み。アプリ層（ナビ・ページ・スコープ）に加え、**Supabase の RLS でDBレベルでも権限・スコープを強制**します（`0007_rls_enforcement.sql`）。役割・スコープ（全社/部門/担当店舗/自店/自分）に基づき、閲覧は `view` 以上、書き込みは `edit` 以上、スタッフの日報は自分のもののみ。管理操作はサーバー側（service role）経由で実行されます。

### スタッフの一括登録

エステ各店のスタッフをまとめて作成し、配布用のログインID/仮パスワード一覧を出力します。

**方法A（推奨・SQLのみ）**: Supabase Dashboard → SQL Editor で
`supabase/seed_staff_batch.sql` を実行。`auth.users`/`auth.identities`/`members`
を一括作成し、最後のSELECTで「氏名 / ログインID / 仮パスワード」を出力します。
その結果をコピーして配布できます（重複メールはスキップ）。

**方法B（ローカル実行）**: `npm run seed:staff`（`scripts/seed-staff-batch.mjs`）。
`SUPABASE_SERVICE_ROLE_KEY` が必要。既存ユーザーは仮パスワードを再設定します。

いずれも初回ログイン後のパスワード変更を案内してください。

### 日報入力 → AIフィードバックの流れ

1. 売上・施術数（既存のみ）と次回予約数・新規数と2回目予約数を入力
2. 新規のお客様ごとに、契約の有無・内容（回数券 4/8/16/32 または 定額 月2/4/6/8）と、取れた／取れなかった理由を記録
3. 今日の振り返り・明日の行動を記入
4. **「保存してAIフィードバック」** を押すと、Claude が
   - 総評 / 目標未達の原因分析 / 明日からの改善アクション / 振り返り
   を生成し、`ai_feedback` テーブルに保存して表示します。

---

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド |
| `npm run typecheck` | 型チェック |
| `npm run seed:members` | 成増店メンバーのシード |
