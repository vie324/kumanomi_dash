import { createClient } from "./supabase/server";
import type { Member } from "./types";

// 現在ログイン中のメンバー行を取得（auth.users → members）
export async function getCurrentMember(): Promise<Member | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("members")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return (data as Member) ?? null;
}
