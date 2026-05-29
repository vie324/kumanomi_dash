-- ============================================================
-- 権限基盤（RBAC）  Phase A
-- ============================================================
-- 役割(5種) × スコープ × 担当店舗 + 画面編集できる権限マトリクス
-- このマイグレーションはスキーマ追加のみ。既存のRLS(認証済みは全操作可)は
-- まだ変更しません（Phase D で本格的なRLSに置き換えます）。
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- ============================================================

-- ------------------------------------------------------------
-- 部門
-- ------------------------------------------------------------
create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- 店舗に部門を紐付け
alter table public.stores
  add column if not exists department_id uuid references public.departments(id);

-- ------------------------------------------------------------
-- members: 役割・スコープ
-- ------------------------------------------------------------
-- 役割: owner(全体管理者) / dept_manager(部門管理者) / manager(マネージャー)
--       / store_manager(店長) / staff(スタッフ)
-- スコープ: all / department / assigned / store / own
alter table public.members
  add column if not exists scope         text,
  add column if not exists department_id uuid references public.departments(id);

-- 既存 role 値（staff/manager/admin）を新体系へ寄せる
update public.members set role = 'owner'         where role = 'admin';
-- manager はそのまま manager として残す（スコープは assigned）

-- role の既定スコープを補完（未設定の行のみ）
update public.members set scope = case role
    when 'owner'         then 'all'
    when 'dept_manager'  then 'department'
    when 'manager'       then 'assigned'
    when 'store_manager' then 'store'
    else 'store'
  end
where scope is null;

-- ------------------------------------------------------------
-- マネージャーの担当店舗（多対多）
-- ------------------------------------------------------------
create table if not exists public.member_store_access (
  member_id  uuid not null references public.members(id) on delete cascade,
  store_id   text not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, store_id)
);

-- ------------------------------------------------------------
-- 権限マトリクス（画面で編集する）
-- ------------------------------------------------------------
-- resource: dashboard / daily_reports / cashbook / attendance /
--           members(会員回数券) / posture / report_card /
--           staff_admin(スタッフ権限管理) / org_admin(店舗部門設定)
-- level   : none < view < edit < manage
create table if not exists public.role_permissions (
  role       text not null,
  resource   text not null,
  level      text not null default 'none' check (level in ('none','view','edit','manage')),
  updated_at timestamptz not null default now(),
  primary key (role, resource)
);

drop trigger if exists trg_role_permissions_updated_at on public.role_permissions;
create trigger trg_role_permissions_updated_at
  before update on public.role_permissions
  for each row execute function public.set_updated_at();

-- 既定の権限マトリクス（たたき台）。存在しない (role,resource) のみ投入。
insert into public.role_permissions (role, resource, level)
select r.role, r.resource, r.level
from (values
  -- owner: 全機能 manage
  ('owner','dashboard','manage'),('owner','daily_reports','manage'),('owner','cashbook','manage'),
  ('owner','attendance','manage'),('owner','members','manage'),('owner','posture','manage'),
  ('owner','report_card','manage'),('owner','staff_admin','manage'),('owner','org_admin','manage'),
  -- dept_manager: 業務は manage、組織設定は edit
  ('dept_manager','dashboard','manage'),('dept_manager','daily_reports','manage'),('dept_manager','cashbook','manage'),
  ('dept_manager','attendance','manage'),('dept_manager','members','manage'),('dept_manager','posture','edit'),
  ('dept_manager','report_card','edit'),('dept_manager','staff_admin','manage'),('dept_manager','org_admin','edit'),
  -- manager: 担当店の業務 edit、スタッフ閲覧
  ('manager','dashboard','view'),('manager','daily_reports','edit'),('manager','cashbook','edit'),
  ('manager','attendance','edit'),('manager','members','edit'),('manager','posture','edit'),
  ('manager','report_card','edit'),('manager','staff_admin','view'),('manager','org_admin','none'),
  -- store_manager(店長): 自店の業務 edit
  ('store_manager','dashboard','view'),('store_manager','daily_reports','edit'),('store_manager','cashbook','edit'),
  ('store_manager','attendance','edit'),('store_manager','members','edit'),('store_manager','posture','edit'),
  ('store_manager','report_card','edit'),('store_manager','staff_admin','view'),('store_manager','org_admin','none'),
  -- staff: 自分の日報 edit、業務は閲覧/利用中心
  ('staff','dashboard','view'),('staff','daily_reports','edit'),('staff','cashbook','edit'),
  ('staff','attendance','edit'),('staff','members','view'),('staff','posture','edit'),
  ('staff','report_card','edit'),('staff','staff_admin','none'),('staff','org_admin','none')
) as r(role, resource, level)
where not exists (
  select 1 from public.role_permissions rp where rp.role = r.role and rp.resource = r.resource
);

-- ------------------------------------------------------------
-- RLS（Phase A は緩いまま：認証済みは閲覧可。編集はサービスロール/Phase B画面）
-- ------------------------------------------------------------
alter table public.departments        enable row level security;
alter table public.member_store_access enable row level security;
alter table public.role_permissions    enable row level security;

drop policy if exists "departments_select_auth" on public.departments;
create policy "departments_select_auth" on public.departments
  for select to authenticated using (true);

drop policy if exists "member_store_access_select_auth" on public.member_store_access;
create policy "member_store_access_select_auth" on public.member_store_access
  for select to authenticated using (true);

drop policy if exists "role_permissions_select_auth" on public.role_permissions;
create policy "role_permissions_select_auth" on public.role_permissions
  for select to authenticated using (true);

-- Phase A 時点では管理画面が未実装のため、編集は service role 経由を想定。
-- Phase B/D で authenticated 向けの編集ポリシー（owner/管理者限定）を追加します。
