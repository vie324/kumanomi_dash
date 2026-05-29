-- ============================================================
-- くまのみ整体院 ダッシュボード  初期スキーマ
-- Phase 1: 成増店トライアル（日報入力・成績追跡・契約メモ・AIフィードバック）
-- ============================================================
-- 実行方法:
--   Supabase Dashboard → SQL Editor に貼り付けて実行
--   もしくは supabase CLI: supabase db push
-- ============================================================

-- gen_random_uuid() 用
create extension if not exists "pgcrypto";

-- updated_at 自動更新トリガー関数
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 店舗
-- ------------------------------------------------------------
create table if not exists public.stores (
  id                      text primary key,            -- 例: 'narimasu'
  name                    text not null,               -- 例: '成増駅前院'
  monthly_target_revenue  numeric default 0,           -- 月間売上目標(円)
  daily_target_new        integer default 0,           -- 1日あたり新規目標(人)
  daily_target_contract   integer default 0,           -- 1日あたり契約目標(人)
  active                  boolean not null default true,
  created_at              timestamptz not null default now()
);

-- ------------------------------------------------------------
-- メンバー（スタッフ）  auth.users と1:1で紐づける
-- ------------------------------------------------------------
create table if not exists public.members (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  store_id      text not null references public.stores(id),
  name          text not null,               -- 例: '日野碧人'
  email         text,
  role          text not null default 'staff', -- 'staff' | 'manager' | 'admin'
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists members_store_idx on public.members(store_id);
create index if not exists members_auth_idx on public.members(auth_user_id);

-- ------------------------------------------------------------
-- 日報
-- ------------------------------------------------------------
create table if not exists public.daily_reports (
  id                      uuid primary key default gen_random_uuid(),
  store_id                text not null references public.stores(id),
  member_id               uuid not null references public.members(id) on delete cascade,
  report_date             date not null default (now() at time zone 'Asia/Tokyo')::date,

  -- 売上・目標
  revenue                 numeric not null default 0,   -- 本日売上(円)
  target_revenue          numeric default 0,            -- 本日目標(円)

  -- チャネル別 新規/契約（旧ダッシュボードの項目を踏襲）
  hpb_new                 integer not null default 0,   -- ホットペッパービューティー
  hpb_contract            integer not null default 0,
  meta_new                integer not null default 0,   -- Meta広告
  meta_contract           integer not null default 0,
  referral_new            integer not null default 0,   -- 紹介
  referral_contract       integer not null default 0,
  discount_new            integer not null default 0,   -- 割引/その他
  discount_contract       integer not null default 0,

  existing_treatments     integer not null default 0,   -- 既存(リピート)施術数

  -- 業務チェック
  daily_tasks_completed   boolean not null default false,
  tomorrow_prep_completed boolean not null default false,

  -- 所感・振り返り（本人記入）
  note                    text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- 1メンバー1日1件
  unique (member_id, report_date)
);
create index if not exists daily_reports_store_date_idx on public.daily_reports(store_id, report_date desc);
create index if not exists daily_reports_member_date_idx on public.daily_reports(member_id, report_date desc);

drop trigger if exists trg_daily_reports_updated_at on public.daily_reports;
create trigger trg_daily_reports_updated_at
  before update on public.daily_reports
  for each row execute function public.set_updated_at();

-- 集計用ビュー: 新規合計・契約合計
create or replace view public.daily_report_totals as
select
  r.*,
  (r.hpb_new + r.meta_new + r.referral_new + r.discount_new)              as total_new,
  (r.hpb_contract + r.meta_contract + r.referral_contract + r.discount_contract) as total_contract
from public.daily_reports r;

-- ------------------------------------------------------------
-- 契約メモ（契約取れた/取れなかったお客様の記録）
-- ------------------------------------------------------------
create table if not exists public.contract_memos (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.daily_reports(id) on delete cascade,
  store_id      text not null references public.stores(id),
  member_id     uuid not null references public.members(id) on delete cascade,

  outcome       text not null check (outcome in ('won','lost')), -- won=契約 / lost=未契約
  channel       text,          -- 'hpb' | 'meta' | 'referral' | 'discount' | 'other'
  customer_name text,          -- お客様呼称(任意・最小限)
  customer_attr text,          -- 年代/性別/主訴など(任意)
  reason        text,          -- 取れた/取れなかった理由
  next_action   text,          -- 次回アクション/フォロー予定

  created_at    timestamptz not null default now()
);
create index if not exists contract_memos_report_idx on public.contract_memos(report_id);
create index if not exists contract_memos_store_idx on public.contract_memos(store_id, created_at desc);

-- ------------------------------------------------------------
-- AIフィードバック（日報1件に対して1件）
-- ------------------------------------------------------------
create table if not exists public.ai_feedback (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null unique references public.daily_reports(id) on delete cascade,
  model       text,
  summary     text,   -- 総評
  issues      text,   -- 課題・未達の原因分析
  advice      text,   -- 改善アクション
  encouragement text, -- 励まし/振り返りの観点
  raw         jsonb,  -- モデル生レスポンス
  created_at  timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ------------------------------------------------------------
-- Phase1(トライアル)方針:
--   認証済みユーザーは全テーブルを読み書き可能（小規模・単一店舗運用のため）。
--   匿名(anon)は一切アクセス不可。
--   ※ 多店舗展開時は store 単位の制限に強化すること（MIGRATION.md 参照）。
-- ============================================================
alter table public.stores         enable row level security;
alter table public.members        enable row level security;
alter table public.daily_reports  enable row level security;
alter table public.contract_memos enable row level security;
alter table public.ai_feedback    enable row level security;

-- stores: 認証済みは閲覧のみ（書き換えはサービスロール/管理者）
drop policy if exists "stores_select_auth" on public.stores;
create policy "stores_select_auth" on public.stores
  for select to authenticated using (true);

-- members: 認証済みは閲覧可
drop policy if exists "members_select_auth" on public.members;
create policy "members_select_auth" on public.members
  for select to authenticated using (true);

-- daily_reports: 認証済みは全操作可
drop policy if exists "daily_reports_all_auth" on public.daily_reports;
create policy "daily_reports_all_auth" on public.daily_reports
  for all to authenticated using (true) with check (true);

-- contract_memos: 認証済みは全操作可
drop policy if exists "contract_memos_all_auth" on public.contract_memos;
create policy "contract_memos_all_auth" on public.contract_memos
  for all to authenticated using (true) with check (true);

-- ai_feedback: 認証済みは閲覧可（書き込みはサーバー(service role)経由）
drop policy if exists "ai_feedback_select_auth" on public.ai_feedback;
create policy "ai_feedback_select_auth" on public.ai_feedback
  for select to authenticated using (true);
