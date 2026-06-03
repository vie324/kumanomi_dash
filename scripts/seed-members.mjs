// ============================================================
// 成増店メンバー シードスクリプト
//   - Supabase Auth ユーザー(5名)を作成
//   - public.members 行を作成し auth_user_id を紐付け
//
// 実行: npm run seed:members
// 必要な環境変数(.env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SEED_DEFAULT_PASSWORD (任意, 既定 'Kumanomi2026!')
// ============================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// .env.local を最小限ロード（dotenv非依存）
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* .env.local が無くても環境変数があればOK */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_DEFAULT_PASSWORD || "Kumanomi2026!";

if (!url || !serviceKey) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const STORE_ID = "narimasu";
const MEMBERS = [
  { name: "日野碧人", email: "hino@kumanomi-narimasu.jp" },
  { name: "宮本渚朗", email: "miyamoto@kumanomi-narimasu.jp" },
  { name: "大野愛夏", email: "ohno@kumanomi-narimasu.jp" },
  { name: "永井諒", email: "nagai@kumanomi-narimasu.jp" },
  { name: "高山大志", email: "takayama@kumanomi-narimasu.jp" },
  { name: "原田ふう花", email: "harada@kumanomi-narimasu.jp" },
  { name: "河邉実生", email: "kawabe@kumanomi-narimasu.jp" },
];

async function ensureStore() {
  const { error } = await supabase.from("stores").upsert(
    {
      id: STORE_ID,
      name: "成増駅前院",
      monthly_target_revenue: 3000000,
      daily_target_new: 3,
      daily_target_contract: 2,
      active: true,
    },
    { onConflict: "id" }
  );
  if (error) throw error;
  console.log("✓ 店舗(成増駅前院)を確認/作成しました");
}

async function findAuthUserByEmail(email) {
  // ページングして email 一致を探す（小規模前提）
  let page = 1;
  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

async function ensureMember(m) {
  // 1) Auth ユーザー
  let user = await findAuthUserByEmail(m.email);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: m.email,
      password,
      email_confirm: true,
      user_metadata: { name: m.name, store_id: STORE_ID },
    });
    if (error) throw error;
    user = data.user;
    console.log(`  + Authユーザー作成: ${m.name} <${m.email}>`);
  } else {
    // 既存ユーザーはパスワードを既定値に再設定し、メール確認済みにする
    // （手動作成や未確認状態でもログインできるようにする）
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { name: m.name, store_id: STORE_ID },
    });
    if (error) throw error;
    console.log(`  = Authユーザー更新(パスワード再設定/確認済み): ${m.name} <${m.email}>`);
  }

  // 2) members 行（auth_user_id で upsert）
  const { error } = await supabase.from("members").upsert(
    {
      auth_user_id: user.id,
      store_id: STORE_ID,
      name: m.name,
      email: m.email,
      role: "staff",
      active: true,
    },
    { onConflict: "auth_user_id" }
  );
  if (error) throw error;
  console.log(`  ✓ members 行を確認/作成: ${m.name}`);
}

async function main() {
  await ensureStore();
  for (const m of MEMBERS) {
    await ensureMember(m);
  }
  console.log("\n完了。初期パスワード:", password, "（初回ログイン後に変更を推奨）");
}

main().catch((e) => {
  console.error("シード失敗:", e.message || e);
  process.exit(1);
});
