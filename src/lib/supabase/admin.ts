import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// サーバー専用: service role キーで RLS をバイパス（AIフィードバック保存など）
// 絶対にクライアントへ import しないこと。
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
