-- ============================================================
-- 業態(整体/エステ) + 5エステ店舗 + 媒体の業態/単価対応  Phase 2.0
-- ============================================================
-- ・店舗とメンバーに業態(genre: 'seitai'整体 / 'esthe'エステ)を追加
-- ・エステ5店舗(大宮/銀座/越谷/川越/熊谷)を追加。成増は整体に設定
-- ・媒体マスタに genre と unit_price(単価入力を求める)を追加し、
--   エステ向け媒体を投入（店舗限定含む）
-- ・契約メモに amount(単価/売上額)を追加
-- 実行方法: Supabase Dashboard → SQL Editor に貼り付けて実行
-- ============================================================

-- ------------------------------------------------------------
-- 店舗・メンバーに業態
-- ------------------------------------------------------------
alter table public.stores
  add column if not exists genre text not null default 'seitai'
    check (genre in ('seitai','esthe'));

alter table public.members
  add column if not exists genre text not null default 'seitai'
    check (genre in ('seitai','esthe'));

-- 成増店は整体（既定のままだが明示）
update public.stores set genre = 'seitai' where id = 'narimasu';

-- エステ5店舗を追加
insert into public.stores (id, name, genre, monthly_target_revenue, daily_target_new, daily_target_contract, active)
values
  ('omiya',     '大宮店',  'esthe', 0, 0, 0, true),
  ('ginza',     '銀座店',  'esthe', 0, 0, 0, true),
  ('koshigaya', '越谷店',  'esthe', 0, 0, 0, true),
  ('kawagoe',   '川越店',  'esthe', 0, 0, 0, true),
  ('kumagaya',  '熊谷店',  'esthe', 0, 0, 0, true)
on conflict (id) do update set name = excluded.name, genre = excluded.genre, active = true;

-- ------------------------------------------------------------
-- 媒体マスタ: 業態 と 単価入力フラグ
-- ------------------------------------------------------------
alter table public.media_channels
  add column if not exists genre text check (genre in ('seitai','esthe')), -- null = 全業態
  add column if not exists unit_price boolean not null default false;       -- true = 日報で金額入力

-- 既存(成増/整体)の媒体は genre を seitai に寄せる（store_id が narimasu のもの）
update public.media_channels set genre = 'seitai'
where store_id = 'narimasu' and genre is null;

-- エステ向け媒体（genre='esthe'）。全エステ共通は store_id = null。
-- 店舗限定は store_id を指定。重複は (genre,store_id,name) で回避。
insert into public.media_channels (store_id, genre, name, sort_order, active, unit_price)
select v.store_id, 'esthe', v.name, v.ord, true, v.unit_price
from (values
  (null::text, 'HPB',          1,  false),
  (null::text, 'イーパーク',    2,  false),
  (null::text, 'HP',           3,  false),
  (null::text, '整骨院紹介',    4,  false),
  (null::text, 'お客様紹介',    5,  false),
  (null::text, 'ヴァンヴェール', 6,  true),   -- 単価入力
  (null::text, 'meta',         7,  false),
  (null::text, 'AURA配信',     8,  false),
  (null::text, 'インバウンド',  9,  false),
  (null::text, '仙豆から紹介',  10, false),
  ('ginza',    '美容鍼',       11, false),   -- 銀座のみ
  ('omiya',    'BUPURA',       12, false),   -- 大宮のみ
  ('omiya',    'バスト',        13, false)    -- 大宮のみ
) as v(store_id, name, ord, unit_price)
where not exists (
  select 1 from public.media_channels mc
  where mc.genre = 'esthe'
    and mc.name = v.name
    and (mc.store_id is not distinct from v.store_id)
);

-- ------------------------------------------------------------
-- 契約メモに金額（単価媒体や売上額の記録用）
-- ------------------------------------------------------------
alter table public.contract_memos
  add column if not exists amount numeric;
