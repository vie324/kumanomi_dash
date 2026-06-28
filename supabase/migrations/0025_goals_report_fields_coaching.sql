-- ============================================================
-- 日報の追加売上項目 / スタッフ個人目標 / 店舗責任者向けAIコーチング  Phase 3.0
-- ============================================================
-- ① 日報に「継続売上」「新規体験金額」を追加（個人売上合計の自動計算に使用）
-- ② スタッフ個人目標（新規売上・新規契約率・物販・既存売上）を 店舗×月 で保持
-- ③ 店舗責任者がスタッフごとに受け取るAI教育フィードバックの保存先
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
--   ※ 0007_rls_enforcement.sql / 0015_esthe_fields_help_store.sql 実行済みが前提
-- ============================================================

-- ------------------------------------------------------------
-- ① 日報の追加売上項目（エステ用。整体では未使用＝0のまま）
-- ------------------------------------------------------------
alter table public.daily_reports
  add column if not exists renewal_sales    numeric not null default 0,  -- 継続売上(円)
  add column if not exists new_trial_amount numeric not null default 0;  -- 新規の体験金額(円)

-- ------------------------------------------------------------
-- ② スタッフ個人目標（店舗×月）
-- ------------------------------------------------------------
create table if not exists public.staff_goals (
  id                       uuid primary key default gen_random_uuid(),
  member_id                uuid not null references public.members(id) on delete cascade,
  store_id                 text not null references public.stores(id),
  month                    text not null,                      -- 'YYYY-MM'
  new_sales_target         numeric not null default 0,         -- 新規売上目標(円)
  new_contract_rate_target numeric not null default 0,         -- 新規契約率目標(%)
  product_target           numeric not null default 0,         -- 物販目標(円)
  existing_sales_target    numeric not null default 0,         -- 既存売上目標(円)
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (member_id, store_id, month)
);
create index if not exists staff_goals_lookup_idx
  on public.staff_goals(store_id, month, member_id);

drop trigger if exists trg_staff_goals_updated_at on public.staff_goals;
create trigger trg_staff_goals_updated_at
  before update on public.staff_goals
  for each row execute function public.set_updated_at();

-- RLS: 閲覧は日報の可視範囲（スタッフは自分・責任者は担当店舗）。
--      直接の書込は manage 権限者のみ。店長等は service role 経由の管理画面で設定する。
alter table public.staff_goals enable row level security;
drop policy if exists "staff_goals_select" on public.staff_goals;
create policy "staff_goals_select" on public.staff_goals
  for select to authenticated
  using (public.has_perm('daily_reports','view') and public.can_daily(store_id, member_id));
drop policy if exists "staff_goals_write" on public.staff_goals;
create policy "staff_goals_write" on public.staff_goals
  for all to authenticated
  using (public.has_perm('daily_reports','manage') and public.can_store(store_id))
  with check (public.has_perm('daily_reports','manage') and public.can_store(store_id));

-- ------------------------------------------------------------
-- ③ 店舗責任者向け スタッフAIコーチング（店舗×月×スタッフ）
-- ------------------------------------------------------------
create table if not exists public.staff_coaching (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  store_id    text not null references public.stores(id),
  month       text not null,                      -- 'YYYY-MM'
  model       text,
  strengths   text,                               -- 強み・良い点
  issues      text,                               -- 課題
  coaching    text,                               -- 店舗責任者向けの指導アドバイス
  raw         jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (member_id, store_id, month)
);
create index if not exists staff_coaching_lookup_idx
  on public.staff_coaching(store_id, month, member_id);

drop trigger if exists trg_staff_coaching_updated_at on public.staff_coaching;
create trigger trg_staff_coaching_updated_at
  before update on public.staff_coaching
  for each row execute function public.set_updated_at();

-- RLS: 閲覧はスタッフ管理を閲覧できる責任者のみ（本人スタッフには見せない）。
--      書込は service role（サーバー経由）のみ。
alter table public.staff_coaching enable row level security;
drop policy if exists "staff_coaching_select" on public.staff_coaching;
create policy "staff_coaching_select" on public.staff_coaching
  for select to authenticated
  using (public.has_perm('staff_admin','view') and public.can_store(store_id));
