-- ============================================================
-- エステ各店 スタッフ一括登録（SQLのみ）  19名
-- ============================================================
-- Supabase Dashboard → SQL Editor に貼り付けて実行。
-- auth.users / auth.identities / public.members をまとめて作成します。
--
-- 前提:
--   - 0014_add_ageo_store.sql 実行済み（上尾店=ageo が存在）
--   - pgcrypto 拡張（crypt/gen_salt）が有効（0001 で有効化済み）
--   - 既に同じメールのユーザーが居る場合はスキップします（重複作成しない）
--
-- 実行後、最下部の SELECT 結果（氏名 / ID / 仮パスワード）をコピーして配布。
-- ============================================================

begin;

-- 1) 登録対象を一時テーブルに用意（uid を先に確定させる）
create temp table _new_staff (
  uid       uuid not null default gen_random_uuid(),
  store_id  text not null,
  name      text not null,
  email     text not null,
  password  text not null
) on commit drop;

insert into _new_staff (store_id, name, email, password) values
  -- 大宮店
  ('omiya',     '野田 夢',       'omiya-noda@kumanomi-esthe.jp',     'kuma-omiya01'),
  ('omiya',     '小池 富裕美',   'omiya-koike@kumanomi-esthe.jp',    'kuma-omiya02'),
  ('omiya',     '児玉 実弥美',   'omiya-kodama@kumanomi-esthe.jp',   'kuma-omiya03'),
  ('omiya',     '川﨑 望',       'omiya-kawasaki@kumanomi-esthe.jp', 'kuma-omiya04'),
  ('omiya',     '遠藤 愛蘭',     'omiya-endo@kumanomi-esthe.jp',     'kuma-omiya05'),
  -- 川越店
  ('kawagoe',   '瀧本 恵子',     'kawagoe-takimoto@kumanomi-esthe.jp', 'kuma-kawagoe01'),
  ('kawagoe',   '小山 世夏',     'kawagoe-koyama@kumanomi-esthe.jp',   'kuma-kawagoe02'),
  -- 上尾店
  ('ageo',      '三橋 美幸',     'ageo-mitsuhashi@kumanomi-esthe.jp', 'kuma-ageo01'),
  ('ageo',      '廣瀬 夏菜',     'ageo-hirose@kumanomi-esthe.jp',     'kuma-ageo02'),
  -- 銀座店
  ('ginza',     '鈴木 美咲樹',   'ginza-suzuki@kumanomi-esthe.jp',    'kuma-ginza01'),
  ('ginza',     '吉田 遥奈',     'ginza-yoshida@kumanomi-esthe.jp',   'kuma-ginza02'),
  ('ginza',     '蔵内 加蓮',     'ginza-kurauchi@kumanomi-esthe.jp',  'kuma-ginza03'),
  ('ginza',     '福永 菜緒',     'ginza-fukunaga@kumanomi-esthe.jp',  'kuma-ginza04'),
  -- 越谷店
  ('koshigaya', '増渕 香澄',     'koshigaya-masubuchi@kumanomi-esthe.jp', 'kuma-koshigaya01'),
  ('koshigaya', '穂苅 芽依',     'koshigaya-hokari@kumanomi-esthe.jp',    'kuma-koshigaya02'),
  ('koshigaya', '竹内 香織',     'koshigaya-takeuchi@kumanomi-esthe.jp',  'kuma-koshigaya03'),
  ('koshigaya', '済田 初実',     'koshigaya-saida@kumanomi-esthe.jp',     'kuma-koshigaya04'),
  -- 熊谷店
  ('kumagaya',  '台 桃音',       'kumagaya-dai@kumanomi-esthe.jp',    'kuma-kumagaya01'),
  ('kumagaya',  '依田 麻里',     'kumagaya-yoda@kumanomi-esthe.jp',   'kuma-kumagaya02');

-- 既に存在するメールは除外（重複作成しない）
delete from _new_staff s
where exists (select 1 from auth.users u where lower(u.email) = lower(s.email));

-- 念のため: 店舗が存在しない行は除外（未マイグレーションの保険）
delete from _new_staff s
where not exists (select 1 from public.stores st where st.id = s.store_id);

-- 2) auth.users を作成
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, confirmation_token, recovery_token,
  email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  s.uid, 'authenticated', 'authenticated', s.email,
  crypt(s.password, gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('name', s.name, 'store_id', s.store_id),
  false, '', '', '', ''
from _new_staff s;

-- 3) auth.identities を作成（メールログインに必要）
insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), s.uid::text, s.uid,
  jsonb_build_object('sub', s.uid::text, 'email', s.email, 'email_verified', true),
  'email', now(), now(), now()
from _new_staff s;

-- 4) public.members を作成（店舗の業態・部門を継承）
insert into public.members (
  auth_user_id, store_id, name, email, role, scope, genre, department_id, active
)
select
  s.uid, s.store_id, s.name, s.email, 'staff', 'store',
  st.genre, st.department_id, true
from _new_staff s
join public.stores st on st.id = s.store_id;

-- 5) 配布用の一覧（このSELECT結果をコピーして配布）
--    ※ commit 前に出力（_new_staff は on commit drop のため）
select
  case s.store_id
    when 'omiya' then '大宮店' when 'ginza' then '銀座店' when 'koshigaya' then '越谷店'
    when 'kawagoe' then '川越店' when 'kumagaya' then '熊谷店' when 'ageo' then '上尾店'
    else s.store_id end as 店舗,
  s.name as 氏名,
  s.email as ログインID,
  s.password as 仮パスワード
from _new_staff s
order by s.store_id, s.name;

commit;
