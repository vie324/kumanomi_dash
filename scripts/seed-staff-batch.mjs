// ============================================================
// エステ各店 スタッフ一括登録スクリプト
//   - Supabase Auth ユーザー作成（メール確認済み）
//   - public.members 行を作成（店舗の業態・部門を継承）
//   - 既存ユーザーはパスワード再設定（再実行で安全）
//   - 最後にログインID/仮パスワード一覧を出力（コピペで配布用）
//
// 実行: node scripts/seed-staff-batch.mjs
// 必要な環境変数(.env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomInt } from "node:crypto";

// .env.local を最小限ロード
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* .env.local 無くても環境変数があればOK */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。");
  process.exit(1);
}
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL_DOMAIN = "kumanomi-esthe.jp";

// 店舗ID（stores.id）ごとの登録スタッフ。emailLocal はログインID用の英字。
const STAFF = [
  // 大宮店
  { storeId: "omiya", name: "野田 夢", emailLocal: "omiya-noda" },
  { storeId: "omiya", name: "小池 富裕美", emailLocal: "omiya-koike" },
  { storeId: "omiya", name: "児玉 実弥美", emailLocal: "omiya-kodama" },
  { storeId: "omiya", name: "川﨑 望", emailLocal: "omiya-kawasaki" },
  { storeId: "omiya", name: "遠藤 愛蘭", emailLocal: "omiya-endo" },
  // 川越店
  { storeId: "kawagoe", name: "瀧本 恵子", emailLocal: "kawagoe-takimoto" },
  { storeId: "kawagoe", name: "小山 世夏", emailLocal: "kawagoe-koyama" },
  // 上尾店
  { storeId: "ageo", name: "三橋 美幸", emailLocal: "ageo-mitsuhashi" },
  { storeId: "ageo", name: "廣瀬 夏菜", emailLocal: "ageo-hirose" },
  // 銀座店
  { storeId: "ginza", name: "鈴木 美咲樹", emailLocal: "ginza-suzuki" },
  { storeId: "ginza", name: "吉田 遥奈", emailLocal: "ginza-yoshida" },
  { storeId: "ginza", name: "蔵内 加蓮", emailLocal: "ginza-kurauchi" },
  { storeId: "ginza", name: "福永 菜緒", emailLocal: "ginza-fukunaga" },
  // 越谷店
  { storeId: "koshigaya", name: "増渕 香澄", emailLocal: "koshigaya-masubuchi" },
  { storeId: "koshigaya", name: "穂苅 芽依", emailLocal: "koshigaya-hokari" },
  { storeId: "koshigaya", name: "竹内 香織", emailLocal: "koshigaya-takeuchi" },
  { storeId: "koshigaya", name: "済田 初実", emailLocal: "koshigaya-saida" },
  // 熊谷店
  { storeId: "kumagaya", name: "台 桃音", emailLocal: "kumagaya-dai" },
  { storeId: "kumagaya", name: "依田 麻里", emailLocal: "kumagaya-yoda" },
];

// 読みやすい仮パスワードを生成（紛らわしい文字を除外）
function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[randomInt(chars.length)];
  return s + "!";
}

async function findUserByEmail(email) {
  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

async function ensureStaff(s) {
  const email = `${s.emailLocal}@${EMAIL_DOMAIN}`.toLowerCase();
  const password = genPassword();

  // 店舗の業態・部門
  const { data: store, error: storeErr } = await supabase
    .from("stores")
    .select("genre, department_id")
    .eq("id", s.storeId)
    .maybeSingle();
  if (storeErr) throw storeErr;
  if (!store) throw new Error(`店舗が見つかりません: ${s.storeId}（先にマイグレーションを実行してください）`);

  // Auth ユーザー（作成 or パスワード再設定）
  let user = await findUserByEmail(email);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: s.name, store_id: s.storeId },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { name: s.name, store_id: s.storeId },
    });
    if (error) throw error;
  }

  // members 行
  const { error: memberErr } = await supabase.from("members").upsert(
    {
      auth_user_id: user.id,
      store_id: s.storeId,
      name: s.name,
      email,
      role: "staff",
      scope: "store",
      genre: store.genre,
      department_id: store.department_id,
      active: true,
    },
    { onConflict: "auth_user_id" }
  );
  if (memberErr) throw memberErr;

  return { ...s, email, password };
}

const STORE_LABELS = {
  omiya: "大宮店", ginza: "銀座店", koshigaya: "越谷店",
  kawagoe: "川越店", kumagaya: "熊谷店", ageo: "上尾店",
};

async function main() {
  const results = [];
  for (const s of STAFF) {
    try {
      const r = await ensureStaff(s);
      results.push(r);
      console.log(`✓ ${s.name}（${STORE_LABELS[s.storeId] || s.storeId}）`);
    } catch (e) {
      console.error(`✗ ${s.name}: ${e.message || e}`);
    }
  }

  // 配布用の一覧を出力
  console.log("\n\n================== 配布用ログイン情報 ==================\n");
  let currentStore = "";
  for (const r of results) {
    const label = STORE_LABELS[r.storeId] || r.storeId;
    if (label !== currentStore) {
      currentStore = label;
      console.log(`\n【${label}】`);
    }
    console.log(`${r.name}`);
    console.log(`  ID : ${r.email}`);
    console.log(`  PW : ${r.password}`);
  }
  console.log("\n========================================================");
  console.log("※ 仮パスワードです。初回ログイン後の変更を案内してください。");
}

main().catch((e) => {
  console.error("一括登録に失敗:", e.message || e);
  process.exit(1);
});
