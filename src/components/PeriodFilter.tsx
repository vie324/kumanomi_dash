"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { shiftMonth, formatMonthLabel, monthJST } from "@/lib/date";

// 集計期間（月）セレクタ。‹ 2026年6月 › で前後の月へ。今月以外のときは「今月」リセットを表示。
// 選択すると ?month=YYYY-MM を付けて遷移（今月のときはパラメータを外す）。
export default function PeriodFilter({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const thisMonth = monthJST();

  function go(month: string) {
    const sp = new URLSearchParams(params.toString());
    if (month === thisMonth) sp.delete("month");
    else sp.set("month", month);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const isFuture = current >= thisMonth;

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white/80 backdrop-blur px-1 py-0.5">
      <button
        className="px-2 py-1 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        onClick={() => go(shiftMonth(current, -1))}
        aria-label="前の月"
      >
        ‹
      </button>
      <span className="text-sm font-bold text-slate-700 min-w-[5.5rem] text-center tabular-nums">
        {formatMonthLabel(current)}
      </span>
      <button
        className="px-2 py-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        onClick={() => go(shiftMonth(current, 1))}
        disabled={isFuture}
        aria-label="次の月"
      >
        ›
      </button>
      {current !== thisMonth && (
        <button
          className="ml-0.5 px-2 py-1 rounded-lg text-[11px] font-semibold text-sise-600 hover:bg-sise-50 transition-colors"
          onClick={() => go(thisMonth)}
        >
          今月
        </button>
      )}
    </div>
  );
}
