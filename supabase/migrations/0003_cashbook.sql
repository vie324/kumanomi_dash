-- ============================================================
-- 出納帳（会計）  Phase 1.2
-- ============================================================
-- 入金/出金の記帳、現金残高、レジ金チェック差異の記録
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- ============================================================

create table if not exists public.cashbook_entries (
  id             uuid primary key default gen_random_uuid(),
  store_id       text not null references public.stores(id),
  member_id      uuid references public.members(id) on delete set null, -- 記録者(任意)
  entry_date     date not null default (now() at time zone 'Asia/Tokyo')::date,
  type           text not null check (type in ('income','expense')),     -- 入金/出金
  category       text not null,                                          -- 施術売上 / 家賃 等
  amount         numeric not null default 0,
  payment_method text not null default 'CASH'
                   check (payment_method in ('CASH','QR','CARD','SQUARE','TRANSFER')),
  description    text,           -- 摘要・メモ
  customer_name  text,           -- 顧客名(入金時)
  treatment_count integer not null default 0, -- 施術回数(入金時)
  recorder       text,           -- 記録者名(自由入力)
  notes          text,
  is_cash_check  boolean not null default false, -- レジ金チェック差異の記録か
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists cashbook_store_date_idx on public.cashbook_entries(store_id, entry_date desc);

drop trigger if exists trg_cashbook_updated_at on public.cashbook_entries;
create trigger trg_cashbook_updated_at
  before update on public.cashbook_entries
  for each row execute function public.set_updated_at();

-- RLS: 認証済みは全操作可（Phase1方針）
alter table public.cashbook_entries enable row level security;
drop policy if exists "cashbook_all_auth" on public.cashbook_entries;
create policy "cashbook_all_auth" on public.cashbook_entries
  for all to authenticated using (true) with check (true);
