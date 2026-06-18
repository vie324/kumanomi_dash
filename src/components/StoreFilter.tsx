"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Store } from "@/lib/types";

// 部門管理者/全体管理者など、複数店舗が見えるユーザー向けの店舗セレクタ。
// 選択すると ?store=<id> を付けて遷移する（"all" でスコープ内全店）。
export default function StoreFilter({
  stores,
  current,
}: {
  stores: Store[];
  current: string; // "all" または store id
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (stores.length <= 1) return null;

  function onChange(value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value === "all") sp.delete("store");
    else sp.set("store", value);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white/80 outline-none focus:border-sise-500"
      value={current}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="all">全店舗（部門内）</option>
      {stores.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}
