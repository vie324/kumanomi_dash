-- ============================================================
-- 媒体（集客チャネル）マスタ  Phase 1.5
-- ============================================================
-- 日報の契約メモに「どの媒体から来たお客様か」を記録し、
-- 媒体一覧は管理画面(/admin/media)で編集できるようにする。
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- ============================================================

create table if not exists public.media_channels (
  id          uuid primary key default gen_random_uuid(),
  store_id    text references public.stores(id), -- null = 全店舗共通
  name        text not null,                     -- 例: ホットペッパー
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists media_channels_store_idx on public.media_channels(store_id, sort_order);

-- contract_memos.channel は 0001 で text 列として存在。
-- 旧コード互換のキー('hpb'等)ではなく、media_channels.name を保存する運用へ。
-- （列の追加は不要）

-- RLS
alter table public.media_channels enable row level security;

-- 閲覧: members を閲覧できる権限があれば（日報入力で使うため）認証済みは閲覧可
drop policy if exists "media_channels_select_auth" on public.media_channels;
create policy "media_channels_select_auth" on public.media_channels
  for select to authenticated using (true);

-- 書き込み: 媒体マスタの編集は staff_admin manage（管理者）に限定。
-- （管理画面はサーバーアクション=service role 経由でも動くが、多重防御として設定）
drop policy if exists "media_channels_write" on public.media_channels;
create policy "media_channels_write" on public.media_channels
  for all to authenticated
  using (public.has_perm('staff_admin','manage'))
  with check (public.has_perm('staff_admin','manage'));

-- 既定の媒体（成増店）。存在しなければ投入。
insert into public.media_channels (store_id, name, sort_order, active)
select 'narimasu', v.name, v.ord, true
from (values
  ('ホットペッパー', 1),
  ('Meta広告', 2),
  ('Google', 3),
  ('紹介', 4),
  ('チラシ', 5),
  ('看板・通りがかり', 6),
  ('EPARK', 7),
  ('その他', 99)
) as v(name, ord)
where not exists (select 1 from public.media_channels where store_id = 'narimasu');
