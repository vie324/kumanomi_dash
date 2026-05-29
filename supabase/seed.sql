-- ============================================================
-- 成増店トライアル 初期データ
-- ============================================================
-- 注意: メンバーの auth.users への紐付け(auth_user_id)は
--       scripts/seed-members.mjs で自動作成・更新します。
--       このSQLは店舗と「未連携メンバー行」を用意するだけでもOKですが、
--       seed-members.mjs を使えば members も自動投入されるため通常は不要です。
-- ============================================================

-- 店舗（成増駅前院）
insert into public.stores (id, name, monthly_target_revenue, daily_target_new, daily_target_contract, active)
values ('narimasu', '成増駅前院', 3000000, 3, 2, true)
on conflict (id) do update set
  name = excluded.name,
  active = true;

-- メンバーは scripts/seed-members.mjs で投入してください:
--   npm run seed:members
