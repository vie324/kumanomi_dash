# GAS → Supabase 移行計画

旧ダッシュボード（`legacy/index.html`）は、ブラウザ内Babelで動く単一HTMLのReactアプリで、バックエンドが
**Google Apps Script (GAS)** と **`/api/square` プロキシ** に分かれていました。

本プロジェクトでは、これを **Next.js + Supabase + Vercel** に一本化します。本ドキュメントは段階移行の計画です。

---

## 現状のバックエンド依存（旧アプリ）

| 機能 | 現在の保存先 | 備考 |
| --- | --- | --- |
| 日報 | GAS（Googleフォーム→スプレッドシート） | **読み取りのみ**。入力はGoogleフォーム |
| スタッフ管理 | GAS `type=staff` | パスワードが平文（REVIEW.md #5） |
| 店舗管理 | GAS `type=storeManage` | |
| 勤怠 | GAS `type=attendance` | |
| LINEチャット | GAS `type=lineConfig/lineThreads/lineMessages` | |
| 会員・サブスク・カタログ | `/api/square` プロキシ（Vercel想定） | プロキシ関数は旧リポジトリに未収録 |
| 出納帳・カウンセリング・会員利用 | ブラウザ `localStorage` | 端末依存・共有不可 |

> ⚠️ 旧アプリにはライブのGASデプロイURLがクライアントソースに直書きされています（REVIEW.md #4）。移行完了後はGASデプロイを失効・ローテーションしてください。

---

## フェーズ計画

### ✅ Phase 1 — 成増店トライアル（本PRで実装）

- Supabase スキーマ新設: `stores` / `members` / `daily_reports` / `contract_memos` / `ai_feedback`
- Supabase Auth によるログイン（5名）＋ RLS
- **日報入力**（売上・チャネル別新規/契約・既存施術・業務チェック・契約メモ・所感）
- **売上/成績ダッシュボード**（月間目標進捗・新規/契約・メンバー別・推移）
- **AIフィードバック**（Claude）: 課題の原因分析と改善アクションを自動生成

### Phase 2 — スタッフ・店舗マスタの移行

- `members` / `stores` を正式マスタとして拡張（権限ロール、ログイン情報）
- 旧 GAS `staff` / `storeManage` を廃止
- パスワードは Supabase Auth に集約（平文管理の撤廃）

### Phase 3 — 勤怠の移行

- `attendance` テーブル新設（打刻・GPS・月次履歴）
- GAS `attendance` エンドポイントを廃止

### Phase 4 — 会計・カウンセリング・会員利用の移行（localStorage 廃止）

- `cashbook_entries` / `counseling` / `member_usage` テーブル新設
- 端末ローカル保存をやめ、Supabase に集約

### Phase 5 — Square 連携の移行

- `/api/square/*` を Next.js Route Handler として正式実装（環境変数 `SQUARE_ACCESS_TOKEN` 等）
- 必要に応じて Square データを Supabase にキャッシュ/同期

### Phase 6 — LINE チャットの移行

- `line_config` / `line_threads` / `line_messages` テーブル新設
- LINE Webhook を Vercel Route Handler 化、GAS ブリッジを廃止

### Phase 7 — GAS 全廃

- すべての GAS エンドポイント依存を撤去
- GAS デプロイの失効・キーローテーション
- 旧 `legacy/index.html` をアーカイブ

---

## RLS 強化（多店舗展開時）

Phase 1 では「認証済みユーザーは対象テーブルを読み書き可」という緩いポリシーです。
多店舗・多ロール運用に移行する際は、`members.store_id` と `auth.uid()` を突き合わせ、
**自店舗のデータのみ** に制限してください。例:

```sql
create policy "daily_reports_own_store" on public.daily_reports
  for all to authenticated
  using (
    store_id in (
      select store_id from public.members where auth_user_id = auth.uid()
    )
  )
  with check (
    store_id in (
      select store_id from public.members where auth_user_id = auth.uid()
    )
  );
```
