"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// 部門（業態）切替: 全体 / 整骨 / 美容。複数業態が見えるユーザー向け。
const OPTIONS = [
  { value: "all", label: "全体" },
  { value: "seitai", label: "整骨" },
  { value: "esthe", label: "美容" },
];

export default function DeptFilter({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value === "all") sp.delete("dept");
    else sp.set("dept", value);
    // 部門を変えたら店舗フィルタはリセット
    sp.delete("store");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white overflow-hidden">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-2 text-sm font-semibold transition-colors ${
            current === o.value ? "bg-sise-500 text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
