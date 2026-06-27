-- ============================================================
-- 姿勢分析・施術レポートの保存と顧客履歴  Phase 2.9
-- ============================================================
-- これまで姿勢分析(/posture)と施術レポート(/report-card)は端末内のみで、
-- DBに残らず顧客の履歴として蓄積できなかった。
-- 保存用テーブルを追加し、顧客ごとの推移を追えるようにする。
-- 画像は保持せず、スコア・メニュー等の構造化データのみ（軽量・PII最小化）。
-- RLS: posture / report_card の view/edit 権限 + 店舗スコープ。
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行（0007 実行済み前提）
-- ============================================================

-- ---------- 姿勢分析の記録 ----------
create table if not exists public.posture_records (
  id            uuid primary key default gen_random_uuid(),
  store_id      text not null references public.stores(id),
  member_id     uuid references public.members(id) on delete set null,
  customer_id   uuid references public.customers(id) on delete set null,
  customer_name text,
  record_date   date not null default (now() at time zone 'Asia/Tokyo')::date,
  mode          text not null check (mode in ('front','side')),
  total_score   integer,
  items         jsonb,            -- PostureItem[]（label/value/score/detail）
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists posture_records_store_idx on public.posture_records(store_id, record_date desc);
create index if not exists posture_records_customer_idx on public.posture_records(customer_id, record_date desc);

-- ---------- 施術レポートの記録 ----------
create table if not exists public.treatment_reports (
  id            uuid primary key default gen_random_uuid(),
  store_id      text not null references public.stores(id),
  member_id     uuid references public.members(id) on delete set null,
  customer_id   uuid references public.customers(id) on delete set null,
  customer_name text,
  visit_date    date not null default (now() at time zone 'Asia/Tokyo')::date,
  genre         text,
  staff_name    text,
  menus         jsonb,            -- string[]
  scores        jsonb,            -- { key: number }
  avg_score     numeric,
  comment       text,
  care          jsonb,            -- string[]（選択したホームケア/ストレッチのkey）
  care_note     text,
  next_offer    text,
  next_expiry   date,
  created_at    timestamptz not null default now()
);
create index if not exists treatment_reports_store_idx on public.treatment_reports(store_id, visit_date desc);
create index if not exists treatment_reports_customer_idx on public.treatment_reports(customer_id, visit_date desc);

-- ---------- RLS ----------
alter table public.posture_records   enable row level security;
alter table public.treatment_reports enable row level security;

drop policy if exists "posture_records_select" on public.posture_records;
drop policy if exists "posture_records_write" on public.posture_records;
create policy "posture_records_select" on public.posture_records
  for select to authenticated
  using (public.has_perm('posture','view') and public.can_store(store_id));
create policy "posture_records_write" on public.posture_records
  for all to authenticated
  using (public.has_perm('posture','edit') and public.can_store(store_id))
  with check (public.has_perm('posture','edit') and public.can_store(store_id));

drop policy if exists "treatment_reports_select" on public.treatment_reports;
drop policy if exists "treatment_reports_write" on public.treatment_reports;
create policy "treatment_reports_select" on public.treatment_reports
  for select to authenticated
  using (public.has_perm('report_card','view') and public.can_store(store_id));
create policy "treatment_reports_write" on public.treatment_reports
  for all to authenticated
  using (public.has_perm('report_card','edit') and public.can_store(store_id))
  with check (public.has_perm('report_card','edit') and public.can_store(store_id));
