-- ============================================================
-- 勤怠管理  Phase 1.3
-- ============================================================
-- 出退勤打刻・GPS位置記録・月次履歴
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- ============================================================

-- 店舗に座標を追加（GPSの距離判定用・任意）
alter table public.stores
  add column if not exists lat numeric,
  add column if not exists lng numeric;

create table if not exists public.attendance_records (
  id            uuid primary key default gen_random_uuid(),
  store_id      text not null references public.stores(id),
  member_id     uuid not null references public.members(id) on delete cascade,
  work_date     date not null default (now() at time zone 'Asia/Tokyo')::date,
  clock_in_at   timestamptz,
  clock_out_at  timestamptz,
  clock_in_lat  numeric,
  clock_in_lng  numeric,
  clock_out_lat numeric,
  clock_out_lng numeric,
  method        text not null default 'manual', -- 'gps' | 'manual'
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists attendance_member_date_idx on public.attendance_records(member_id, work_date desc);
create index if not exists attendance_store_date_idx on public.attendance_records(store_id, work_date desc);

drop trigger if exists trg_attendance_updated_at on public.attendance_records;
create trigger trg_attendance_updated_at
  before update on public.attendance_records
  for each row execute function public.set_updated_at();

-- RLS: 認証済みは全操作可（Phase1方針）
alter table public.attendance_records enable row level security;
drop policy if exists "attendance_all_auth" on public.attendance_records;
create policy "attendance_all_auth" on public.attendance_records
  for all to authenticated using (true) with check (true);
