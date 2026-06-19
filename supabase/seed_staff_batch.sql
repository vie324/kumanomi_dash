-- ============================================================
-- エステ各店 スタッフ一括登録（SQLのみ / Supabase SQL Editor 対応版）  19名
-- ============================================================
-- Supabase SQL Editor は文ごとに自動コミットするため一時テーブルが使えません。
-- そこで「メールアドレスをキー」に4つの独立した文で作成します。
-- 上から順に（① → ② → ③ → ④）実行してください。まとめて実行してもOKです。
--
-- 前提:
--   - 0014_add_ageo_store.sql 実行済み（上尾店=ageo が存在）
--   - pgcrypto（crypt/gen_salt）有効（0001で有効化済み）
-- 再実行は安全（既に存在する行はスキップ）。
-- ============================================================

-- ① auth.users を作成（メール確認済み・パスワードはハッシュ化）
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, confirmation_token, recovery_token,
  email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
  'authenticated', 'authenticated', v.email,
  crypt(v.password, gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('name', v.name, 'store_id', v.store_id),
  false, '', '', '', ''
from (values
  ('omiya',     '野田 夢',     'omiya-noda@kumanomi-esthe.jp',         'kuma-omiya01'),
  ('omiya',     '小池 富裕美', 'omiya-koike@kumanomi-esthe.jp',        'kuma-omiya02'),
  ('omiya',     '児玉 実弥美', 'omiya-kodama@kumanomi-esthe.jp',       'kuma-omiya03'),
  ('omiya',     '川﨑 望',     'omiya-kawasaki@kumanomi-esthe.jp',     'kuma-omiya04'),
  ('omiya',     '遠藤 愛蘭',   'omiya-endo@kumanomi-esthe.jp',         'kuma-omiya05'),
  ('kawagoe',   '瀧本 恵子',   'kawagoe-takimoto@kumanomi-esthe.jp',   'kuma-kawagoe01'),
  ('kawagoe',   '小山 世夏',   'kawagoe-koyama@kumanomi-esthe.jp',     'kuma-kawagoe02'),
  ('ageo',      '三橋 美幸',   'ageo-mitsuhashi@kumanomi-esthe.jp',    'kuma-ageo01'),
  ('ageo',      '廣瀬 夏菜',   'ageo-hirose@kumanomi-esthe.jp',        'kuma-ageo02'),
  ('ginza',     '鈴木 美咲樹', 'ginza-suzuki@kumanomi-esthe.jp',       'kuma-ginza01'),
  ('ginza',     '吉田 遥奈',   'ginza-yoshida@kumanomi-esthe.jp',      'kuma-ginza02'),
  ('ginza',     '蔵内 加蓮',   'ginza-kurauchi@kumanomi-esthe.jp',     'kuma-ginza03'),
  ('ginza',     '福永 菜緒',   'ginza-fukunaga@kumanomi-esthe.jp',     'kuma-ginza04'),
  ('koshigaya', '増渕 香澄',   'koshigaya-masubuchi@kumanomi-esthe.jp','kuma-koshigaya01'),
  ('koshigaya', '穂苅 芽依',   'koshigaya-hokari@kumanomi-esthe.jp',   'kuma-koshigaya02'),
  ('koshigaya', '竹内 香織',   'koshigaya-takeuchi@kumanomi-esthe.jp', 'kuma-koshigaya03'),
  ('koshigaya', '済田 初実',   'koshigaya-saida@kumanomi-esthe.jp',    'kuma-koshigaya04'),
  ('kumagaya',  '台 桃音',     'kumagaya-dai@kumanomi-esthe.jp',       'kuma-kumagaya01'),
  ('kumagaya',  '依田 麻里',   'kumagaya-yoda@kumanomi-esthe.jp',      'kuma-kumagaya02')
) as v(store_id, name, email, password)
where not exists (select 1 from auth.users u where lower(u.email) = lower(v.email));

-- ② auth.identities を作成（メールログインに必要）。esthe ドメインのうち未作成分。
insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email like '%@kumanomi-esthe.jp'
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );

-- ③ public.members を作成（店舗の業態・部門を継承）
insert into public.members (
  auth_user_id, store_id, name, email, role, scope, genre, department_id, active
)
select
  u.id, v.store_id, v.name, u.email, 'staff', 'store', st.genre, st.department_id, true
from (values
  ('omiya',     '野田 夢',     'omiya-noda@kumanomi-esthe.jp'),
  ('omiya',     '小池 富裕美', 'omiya-koike@kumanomi-esthe.jp'),
  ('omiya',     '児玉 実弥美', 'omiya-kodama@kumanomi-esthe.jp'),
  ('omiya',     '川﨑 望',     'omiya-kawasaki@kumanomi-esthe.jp'),
  ('omiya',     '遠藤 愛蘭',   'omiya-endo@kumanomi-esthe.jp'),
  ('kawagoe',   '瀧本 恵子',   'kawagoe-takimoto@kumanomi-esthe.jp'),
  ('kawagoe',   '小山 世夏',   'kawagoe-koyama@kumanomi-esthe.jp'),
  ('ageo',      '三橋 美幸',   'ageo-mitsuhashi@kumanomi-esthe.jp'),
  ('ageo',      '廣瀬 夏菜',   'ageo-hirose@kumanomi-esthe.jp'),
  ('ginza',     '鈴木 美咲樹', 'ginza-suzuki@kumanomi-esthe.jp'),
  ('ginza',     '吉田 遥奈',   'ginza-yoshida@kumanomi-esthe.jp'),
  ('ginza',     '蔵内 加蓮',   'ginza-kurauchi@kumanomi-esthe.jp'),
  ('ginza',     '福永 菜緒',   'ginza-fukunaga@kumanomi-esthe.jp'),
  ('koshigaya', '増渕 香澄',   'koshigaya-masubuchi@kumanomi-esthe.jp'),
  ('koshigaya', '穂苅 芽依',   'koshigaya-hokari@kumanomi-esthe.jp'),
  ('koshigaya', '竹内 香織',   'koshigaya-takeuchi@kumanomi-esthe.jp'),
  ('koshigaya', '済田 初実',   'koshigaya-saida@kumanomi-esthe.jp'),
  ('kumagaya',  '台 桃音',     'kumagaya-dai@kumanomi-esthe.jp'),
  ('kumagaya',  '依田 麻里',   'kumagaya-yoda@kumanomi-esthe.jp')
) as v(store_id, name, email)
join auth.users u on lower(u.email) = lower(v.email)
join public.stores st on st.id = v.store_id
where not exists (select 1 from public.members m where m.auth_user_id = u.id);

-- ④ 配布用の一覧（この結果をコピーして配布）
select
  case v.store_id
    when 'omiya' then '大宮店' when 'ginza' then '銀座店' when 'koshigaya' then '越谷店'
    when 'kawagoe' then '川越店' when 'kumagaya' then '熊谷店' when 'ageo' then '上尾店'
    else v.store_id end as 店舗,
  v.name as 氏名,
  v.email as "ログインID",
  v.password as "仮パスワード"
from (values
  ('omiya',     '野田 夢',     'omiya-noda@kumanomi-esthe.jp',         'kuma-omiya01'),
  ('omiya',     '小池 富裕美', 'omiya-koike@kumanomi-esthe.jp',        'kuma-omiya02'),
  ('omiya',     '児玉 実弥美', 'omiya-kodama@kumanomi-esthe.jp',       'kuma-omiya03'),
  ('omiya',     '川﨑 望',     'omiya-kawasaki@kumanomi-esthe.jp',     'kuma-omiya04'),
  ('omiya',     '遠藤 愛蘭',   'omiya-endo@kumanomi-esthe.jp',         'kuma-omiya05'),
  ('kawagoe',   '瀧本 恵子',   'kawagoe-takimoto@kumanomi-esthe.jp',   'kuma-kawagoe01'),
  ('kawagoe',   '小山 世夏',   'kawagoe-koyama@kumanomi-esthe.jp',     'kuma-kawagoe02'),
  ('ageo',      '三橋 美幸',   'ageo-mitsuhashi@kumanomi-esthe.jp',    'kuma-ageo01'),
  ('ageo',      '廣瀬 夏菜',   'ageo-hirose@kumanomi-esthe.jp',        'kuma-ageo02'),
  ('ginza',     '鈴木 美咲樹', 'ginza-suzuki@kumanomi-esthe.jp',       'kuma-ginza01'),
  ('ginza',     '吉田 遥奈',   'ginza-yoshida@kumanomi-esthe.jp',      'kuma-ginza02'),
  ('ginza',     '蔵内 加蓮',   'ginza-kurauchi@kumanomi-esthe.jp',     'kuma-ginza03'),
  ('ginza',     '福永 菜緒',   'ginza-fukunaga@kumanomi-esthe.jp',     'kuma-ginza04'),
  ('koshigaya', '増渕 香澄',   'koshigaya-masubuchi@kumanomi-esthe.jp','kuma-koshigaya01'),
  ('koshigaya', '穂苅 芽依',   'koshigaya-hokari@kumanomi-esthe.jp',   'kuma-koshigaya02'),
  ('koshigaya', '竹内 香織',   'koshigaya-takeuchi@kumanomi-esthe.jp', 'kuma-koshigaya03'),
  ('koshigaya', '済田 初実',   'koshigaya-saida@kumanomi-esthe.jp',    'kuma-koshigaya04'),
  ('kumagaya',  '台 桃音',     'kumagaya-dai@kumanomi-esthe.jp',       'kuma-kumagaya01'),
  ('kumagaya',  '依田 麻里',   'kumagaya-yoda@kumanomi-esthe.jp',      'kuma-kumagaya02')
) as v(store_id, name, email, password)
order by v.store_id, v.name;
