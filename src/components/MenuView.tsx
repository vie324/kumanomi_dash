"use client";

import { useMemo, useState } from "react";
import type { MenuPlan } from "@/lib/types";

function yen(n: number | null): string {
  if (n == null) return "—";
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

export default function MenuView({
  plans,
  storeName,
  canEdit,
}: {
  plans: MenuPlan[];
  storeName: string;
  canEdit: boolean;
}) {
  // section ごとにタブ化
  const sections = useMemo(() => {
    const order: string[] = [];
    for (const p of plans) if (!order.includes(p.section)) order.push(p.section);
    return order;
  }, [plans]);

  const [tab, setTab] = useState<string>(sections[0] || "");
  const activeTab = sections.includes(tab) ? tab : sections[0] || "";

  // 選択中 section を group ごとにまとめる
  const groups = useMemo(() => {
    const map = new Map<string, MenuPlan[]>();
    for (const p of plans) {
      if (p.section !== activeTab) continue;
      (map.get(p.group_name) || map.set(p.group_name, []).get(p.group_name)!).push(p);
    }
    return Array.from(map.entries());
  }, [plans, activeTab]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">料金表</h1>
          <p className="text-xs text-slate-500">{storeName}</p>
        </div>
        {canEdit && (
          <a href="/admin/menu" className="btn-ghost !py-2 text-xs">料金表を編集 →</a>
        )}
      </div>

      {plans.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-slate-400">
          料金表がまだ登録されていません{canEdit ? "。「料金表を編集」から追加できます。" : "。"}
        </div>
      ) : (
        <>
          {/* section タブ */}
          <div className="flex gap-1 overflow-x-auto border-b border-slate-100">
            {sections.map((s) => (
              <button
                key={s}
                onClick={() => setTab(s)}
                className={`whitespace-nowrap px-3 py-2 text-sm font-semibold border-b-2 transition-colors ${
                  s === activeTab
                    ? "border-sise-500 text-sise-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* group ごとのテーブル */}
          <div className="grid md:grid-cols-2 gap-4">
            {groups.map(([groupName, rows]) => {
              const showSessions = rows.some((r) => r.sessions != null);
              const showUnit = rows.some((r) => r.unit_price != null);
              return (
                <div key={groupName} className="glass-card p-4">
                  <h3 className="text-sm font-bold text-slate-800 mb-2">{groupName}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
                          <th className="py-1.5 pr-2 font-semibold">区分</th>
                          {showSessions && <th className="py-1.5 px-2 font-semibold text-center">回数</th>}
                          <th className="py-1.5 px-2 font-semibold text-right">金額</th>
                          {showUnit && <th className="py-1.5 px-2 font-semibold text-right">1回あたり</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} className="border-b border-slate-50">
                            <td className="py-1.5 pr-2 text-slate-700">
                              {[r.variant, r.label].filter(Boolean).join(" ") || "—"}
                              {r.note && <span className="block text-[10px] text-slate-400">{r.note}</span>}
                            </td>
                            {showSessions && (
                              <td className="py-1.5 px-2 text-center text-slate-500">{r.sessions ?? "—"}</td>
                            )}
                            <td className="py-1.5 px-2 text-right font-bold text-slate-800">{yen(r.price)}</td>
                            {showUnit && (
                              <td className="py-1.5 px-2 text-right text-slate-500">{yen(r.unit_price)}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
