"use client";

import { useMemo, useState, useTransition } from "react";
import { addMenuPlan, deleteMenuPlan, updateMenuPlan } from "@/app/admin/actions";
import type { Genre, MenuPlan } from "@/lib/types";

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? null : n;
}

export default function MenuPlanEditor({
  plans,
  genre,
  storeId,
}: {
  plans: MenuPlan[];
  genre: Genre;
  storeId: string;
}) {
  const [rows, setRows] = useState<MenuPlan[]>(plans);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sections = useMemo(() => {
    const o: string[] = [];
    for (const p of rows) if (!o.includes(p.section)) o.push(p.section);
    return o;
  }, [rows]);
  const [tab, setTab] = useState<string>(sections[0] || "");
  const activeTab = sections.includes(tab) ? tab : sections[0] || "";

  const tabRows = rows.filter((r) => r.section === activeTab);

  function patchLocal(id: string, patch: Partial<MenuPlan>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  type PlanPatch = Omit<Parameters<typeof updateMenuPlan>[0], "id">;
  function commit(id: string, patch: PlanPatch) {
    setError(null);
    startTransition(async () => {
      try {
        await updateMenuPlan({ id, ...patch });
      } catch (e) {
        setError(e instanceof Error ? e.message : "更新に失敗しました");
      }
    });
  }

  function remove(id: string) {
    if (!confirm("この行を削除しますか？")) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteMenuPlan(id);
        setRows((prev) => prev.filter((r) => r.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "削除に失敗しました");
      }
    });
  }

  // 追加フォーム
  const [form, setForm] = useState({ group: "", variant: "", label: "", sessions: "", price: "", unit: "", note: "" });
  function add() {
    setError(null);
    startTransition(async () => {
      try {
        await addMenuPlan({
          genre,
          storeId: activeTab.includes("店のみ") ? storeId : null,
          section: activeTab,
          groupName: form.group,
          variant: form.variant || null,
          label: form.label || null,
          sessions: num(form.sessions),
          price: num(form.price),
          unitPrice: num(form.unit),
          note: form.note || null,
        });
        setForm({ group: "", variant: "", label: "", sessions: "", price: "", unit: "", note: "" });
        // サーバー再取得は revalidate 任せ。ローカルにも仮追加。
        location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "追加に失敗しました");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* section タブ */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-100">
        {sections.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-semibold border-b-2 ${
              s === activeTab ? "border-sise-500 text-sise-600" : "border-transparent text-slate-500"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-600 font-semibold">{error}</p>}

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-400 bg-slate-50/60 border-b border-slate-100">
              <th className="py-2 px-2 font-semibold">グループ</th>
              <th className="py-2 px-2 font-semibold">区分</th>
              <th className="py-2 px-2 font-semibold">ラベル</th>
              <th className="py-2 px-2 font-semibold w-16">回数</th>
              <th className="py-2 px-2 font-semibold w-24">金額</th>
              <th className="py-2 px-2 font-semibold w-24">1回</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {tabRows.map((r) => (
              <tr key={r.id} className={`border-b border-slate-50 ${r.active ? "" : "opacity-50"}`}>
                <td className="py-1 px-2 text-[11px] text-slate-500">{r.group_name}</td>
                <td className="py-1 px-1">
                  <input className="field-input !py-1 !px-1.5 text-xs w-20" defaultValue={r.variant ?? ""}
                    onBlur={(e) => commit(r.id, { variant: e.target.value || null })} />
                </td>
                <td className="py-1 px-1">
                  <input className="field-input !py-1 !px-1.5 text-xs w-28" defaultValue={r.label ?? ""}
                    onBlur={(e) => commit(r.id, { label: e.target.value || null })} />
                </td>
                <td className="py-1 px-1">
                  <input className="field-input !py-1 !px-1.5 text-xs w-14 text-center" defaultValue={r.sessions ?? ""}
                    onBlur={(e) => commit(r.id, { sessions: num(e.target.value) })} />
                </td>
                <td className="py-1 px-1">
                  <input className="field-input !py-1 !px-1.5 text-xs w-24 text-right" defaultValue={r.price ?? ""}
                    onBlur={(e) => commit(r.id, { price: num(e.target.value) })} />
                </td>
                <td className="py-1 px-1">
                  <input className="field-input !py-1 !px-1.5 text-xs w-24 text-right" defaultValue={r.unit_price ?? ""}
                    onBlur={(e) => commit(r.id, { unit_price: num(e.target.value) })} />
                </td>
                <td className="py-1 px-1 text-right whitespace-nowrap">
                  <button className="text-[11px] text-slate-400 hover:text-slate-700 px-1"
                    onClick={() => { patchLocal(r.id, { active: !r.active }); commit(r.id, { active: !r.active }); }}>
                    {r.active ? "表示" : "非表示"}
                  </button>
                  <button className="text-[11px] text-rose-400 hover:text-rose-600 px-1" onClick={() => remove(r.id)}>削除</button>
                </td>
              </tr>
            ))}
            {tabRows.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-400 text-sm">この区分に項目がありません。</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 追加 */}
      <div className="glass-card p-4">
        <p className="text-sm font-bold text-slate-800 mb-2">「{activeTab}」に行を追加</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <input className="field-input !py-2 text-sm" placeholder="グループ名*" value={form.group} onChange={(e) => setForm((p) => ({ ...p, group: e.target.value }))} />
          <input className="field-input !py-2 text-sm" placeholder="区分(60分等)" value={form.variant} onChange={(e) => setForm((p) => ({ ...p, variant: e.target.value }))} />
          <input className="field-input !py-2 text-sm" placeholder="ラベル(4回等)" value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} />
          <input className="field-input !py-2 text-sm" placeholder="回数" value={form.sessions} onChange={(e) => setForm((p) => ({ ...p, sessions: e.target.value }))} />
          <input className="field-input !py-2 text-sm" placeholder="金額" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} />
          <input className="field-input !py-2 text-sm" placeholder="1回あたり" value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} />
          <input className="field-input !py-2 text-sm md:col-span-2" placeholder="補足" value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} />
        </div>
        <div className="flex justify-end mt-3">
          <button className="btn-primary !py-2" onClick={add} disabled={pending || !form.group.trim()}>追加</button>
        </div>
      </div>
    </div>
  );
}
