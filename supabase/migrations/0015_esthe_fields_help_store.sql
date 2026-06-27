-- ============================================================
-- エステ日報の追加項目 / ヘルプ先売上計上 / メニュー回数  Phase 2.5
-- ============================================================
-- ① エステ日報に 物販売上・新規物販売上・継続契約・その他 を追加
-- ② daily_reports.store_id を「勤務店舗」として扱い、ヘルプ先に計上できるよう
--    RLS の書き込みポリシーを「自分の日報なら勤務店舗を問わず可」に緩和
-- ③ 契約メモに menu_sessions（回数）を追加（金額は既存 amount を使用）
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
--   ※ 0007_rls_enforcement.sql / 0013_contract_menu_link.sql 実行済みが前提
-- ============================================================

-- ① 日報の追加項目（エステ用。整体では未使用＝0/空のまま）
alter table public.daily_reports
  add column if not exists product_sales      numeric not null default 0,  -- 物販売上(円)
  add column if not exists new_product_sales  numeric not null default 0,  -- 新規の物販売上(円)
  add column if not exists renewal_contracts  integer not null default 0,  -- 継続契約(件)
  add column if not exists other_amount       numeric not null default 0,  -- その他(円)
  add column if not exists other_note         text;                        -- その他メモ

-- ③ 契約メモに回数（メニューの回数・選択/手入力）
alter table public.contract_memos
  add column if not exists menu_sessions integer;

-- ② 書き込みは「自分の日報」なら勤務店舗を問わず許可（ヘルプ先計上のため）。
--    読み取りは従来どおりスコープ（can_daily）で制限。
alter table public.daily_reports enable row level security;
drop policy if exists "daily_reports_write" on public.daily_reports;
create policy "daily_reports_write" on public.daily_reports
  for all to authenticated
  using (
    member_id = public.cm_id()
    or (public.has_perm('daily_reports','edit') and public.can_daily(store_id, member_id))
  )
  with check (
    member_id = public.cm_id()
    or (public.has_perm('daily_reports','edit') and public.can_daily(store_id, member_id))
  );

alter table public.contract_memos enable row level security;
drop policy if exists "contract_memos_write" on public.contract_memos;
create policy "contract_memos_write" on public.contract_memos
  for all to authenticated
  using (
    member_id = public.cm_id()
    or (public.has_perm('daily_reports','edit') and public.can_daily(store_id, member_id))
  )
  with check (
    member_id = public.cm_id()
    or (public.has_perm('daily_reports','edit') and public.can_daily(store_id, member_id))
  );
