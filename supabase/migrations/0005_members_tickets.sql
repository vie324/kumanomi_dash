-- ============================================================
-- 会員・回数券管理  Phase 1.4
-- ============================================================
-- 会員(顧客)名簿 / 回数券プラン / 顧客の回数券 / セッション消化履歴
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- ============================================================

-- 会員(顧客)名簿
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  store_id    text not null references public.stores(id),
  name        text not null,
  phone       text,
  note        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists customers_store_idx on public.customers(store_id, name);

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- 回数券プラン（種類）
create table if not exists public.ticket_plans (
  id            uuid primary key default gen_random_uuid(),
  store_id      text not null references public.stores(id),
  name          text not null,                 -- 例: 10回券
  sessions      integer not null default 0,    -- 回数
  price         numeric not null default 0,    -- 価格(円)
  validity_days integer not null default 180,  -- 有効日数
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists ticket_plans_store_idx on public.ticket_plans(store_id);

-- 顧客の回数券（購入記録）
create table if not exists public.customer_tickets (
  id                 uuid primary key default gen_random_uuid(),
  store_id           text not null references public.stores(id),
  customer_id        uuid references public.customers(id) on delete set null,
  plan_id            uuid references public.ticket_plans(id) on delete set null,
  -- 購入時点のスナップショット（プラン改定の影響を受けない）
  customer_name      text not null,
  customer_phone     text,
  plan_name          text,
  total_sessions     integer not null default 0,
  remaining_sessions integer not null default 0,
  price              numeric not null default 0,
  purchase_date      date not null default (now() at time zone 'Asia/Tokyo')::date,
  expiration_date    date,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists customer_tickets_store_idx on public.customer_tickets(store_id, created_at desc);
create index if not exists customer_tickets_customer_idx on public.customer_tickets(customer_id);

drop trigger if exists trg_customer_tickets_updated_at on public.customer_tickets;
create trigger trg_customer_tickets_updated_at
  before update on public.customer_tickets
  for each row execute function public.set_updated_at();

-- セッション消化履歴
create table if not exists public.ticket_usages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.customer_tickets(id) on delete cascade,
  member_id  uuid references public.members(id) on delete set null, -- 消化を記録したスタッフ
  used_at    timestamptz not null default now(),
  note       text
);
create index if not exists ticket_usages_ticket_idx on public.ticket_usages(ticket_id, used_at desc);

-- RLS: 認証済みは全操作可（Phase1方針）
alter table public.customers        enable row level security;
alter table public.ticket_plans     enable row level security;
alter table public.customer_tickets enable row level security;
alter table public.ticket_usages    enable row level security;

drop policy if exists "customers_all_auth" on public.customers;
create policy "customers_all_auth" on public.customers
  for all to authenticated using (true) with check (true);

drop policy if exists "ticket_plans_all_auth" on public.ticket_plans;
create policy "ticket_plans_all_auth" on public.ticket_plans
  for all to authenticated using (true) with check (true);

drop policy if exists "customer_tickets_all_auth" on public.customer_tickets;
create policy "customer_tickets_all_auth" on public.customer_tickets
  for all to authenticated using (true) with check (true);

drop policy if exists "ticket_usages_all_auth" on public.ticket_usages;
create policy "ticket_usages_all_auth" on public.ticket_usages
  for all to authenticated using (true) with check (true);

-- 既定の回数券プラン（成増店）。存在チェックして無ければ投入。
insert into public.ticket_plans (store_id, name, sessions, price, validity_days, active)
select 'narimasu', v.name, v.sessions, v.price, v.validity_days, true
from (values
  ('5回券', 5, 45000, 90),
  ('10回券', 10, 80000, 180),
  ('20回券', 20, 140000, 365)
) as v(name, sessions, price, validity_days)
where not exists (select 1 from public.ticket_plans where store_id = 'narimasu');
