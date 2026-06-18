-- ============================================================
-- メニュー・料金表マスタ  Phase 2.1
-- ============================================================
-- 回数券 / サブスク / 脱毛 / 店舗限定 などの料金表を1テーブルで柔軟に保持。
-- 行=価格1パターン。section>group>variant でグルーピングして表示する。
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- ============================================================

create table if not exists public.menu_plans (
  id          uuid primary key default gen_random_uuid(),
  genre       text not null default 'esthe' check (genre in ('seitai','esthe')),
  store_id    text references public.stores(id), -- null = 業態内の全店舗共通
  section     text not null,            -- 回数券 / サブスク / 脱毛 / 店舗限定 など（タブ）
  group_name  text not null,            -- 例: Premium Body MENU / 全身脱毛(顔+VIO)
  variant     text,                     -- 例: 60分 / 90分（コース内の区分）
  label       text,                     -- 例: 4回 / 月1回コース / 都度
  sessions    integer,                  -- 回数（数値で扱える場合）
  price       numeric,                  -- 金額（コース合計 / 月額 など）
  unit_price  numeric,                  -- 1回あたり / 都度単価
  note        text,                     -- 補足
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists menu_plans_scope_idx on public.menu_plans(genre, store_id, section, sort_order);

drop trigger if exists trg_menu_plans_updated_at on public.menu_plans;
create trigger trg_menu_plans_updated_at
  before update on public.menu_plans
  for each row execute function public.set_updated_at();

-- RLS: 認証済みは閲覧可。編集は org_admin の edit 以上（管理者）。
alter table public.menu_plans enable row level security;
drop policy if exists "menu_plans_select_auth" on public.menu_plans;
create policy "menu_plans_select_auth" on public.menu_plans
  for select to authenticated using (true);
drop policy if exists "menu_plans_write" on public.menu_plans;
create policy "menu_plans_write" on public.menu_plans
  for all to authenticated
  using (public.has_perm('org_admin','edit'))
  with check (public.has_perm('org_admin','edit'));
