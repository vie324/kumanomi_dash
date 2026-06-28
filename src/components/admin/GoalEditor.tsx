"use client";

import { useState, useTransition } from "react";
import { setStaffGoal, setStoreTargets } from "@/app/admin/actions";
import type { Store } from "@/lib/types";

type GoalRow = {
  memberId: string;
  name: string;
  newSalesTarget: number;
  newContractRateTarget: number;
  productTarget: number;
  existingSalesTarget: number;
};

function NumCell({
  value,
  onChange,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        className="field-input !py-1.5 text-right tabular-nums w-full"
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">{suffix}</span>}
    </div>
  );
}

export default function GoalEditor({
  store,
  month,
  initialRows,
}: {
  store: Store;
  month: string;
  initialRows: GoalRow[];
}) {
  const [rows, setRows] = useState<GoalRow[]>(initialRows);
  const [storeTargets, setStoreTargetsState] = useState({
    monthlyTargetRevenue: store.monthly_target_revenue || 0,
    dailyTargetNew: store.daily_target_new || 0,
    dailyTargetContract: store.daily_target_contract || 0,
  });
  const [savedMember, setSavedMember] = useState<string | null>(null);
  const [storeSaved, setStoreSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function patchRow(id: string, patch: Partial<GoalRow>) {
    setRows((prev) => prev.map((r) => (r.memberId === id ? { ...r, ...patch } : r)));
  }

  function saveRow(r: GoalRow) {
    setError(null);
    setSavedMember(null);
    startTransition(async () => {
      try {
        await setStaffGoal({
          memberId: r.memberId,
          storeId: store.id,
          month,
          newSalesTarget: r.newSalesTarget,
          newContractRateTarget: r.newContractRateTarget,
          productTarget: r.productTarget,
          existingSalesTarget: r.existingSalesTarget,
        });
        setSavedMember(r.memberId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  }

  function saveStore() {
    setError(null);
    setStoreSaved(false);
    startTransition(async () => {
      try {
        await setStoreTargets({ storeId: store.id, ...storeTargets });
        setStoreSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  }

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-rose-600 font-semibold">{error}</p>}

      {/* 店舗の月間目標 */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3">店舗の月間目標（{store.name}）</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
          <label className="block">
            <span className="field-label">月間売上目標（円）</span>
            <NumCell
              value={storeTargets.monthlyTargetRevenue}
              onChange={(n) => setStoreTargetsState((s) => ({ ...s, monthlyTargetRevenue: n }))}
            />
          </label>
          <label className="block">
            <span className="field-label">1日 新規目標（人）</span>
            <NumCell
              value={storeTargets.dailyTargetNew}
              onChange={(n) => setStoreTargetsState((s) => ({ ...s, dailyTargetNew: n }))}
            />
          </label>
          <label className="block">
            <span className="field-label">1日 契約目標（件）</span>
            <NumCell
              value={storeTargets.dailyTargetContract}
              onChange={(n) => setStoreTargetsState((s) => ({ ...s, dailyTargetContract: n }))}
            />
          </label>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button className="btn-primary !py-2" onClick={saveStore} disabled={pending}>
            店舗目標を保存
          </button>
          {storeSaved && <span className="text-xs text-emerald-600 font-semibold">保存しました</span>}
        </div>
      </section>

      {/* スタッフ個人目標 */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-1">スタッフ個人目標</h2>
        <p className="text-[11px] text-slate-400 mb-3">新規売上・新規契約率・物販・既存売上の今月の目標を入力してください。</p>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">この店舗に在籍スタッフがいません。</p>
        ) : (
          <div className="space-y-3">
            {/* 見出し（デスクトップ） */}
            <div className="hidden md:grid grid-cols-[8rem_repeat(4,1fr)_5rem] gap-2 text-[11px] font-semibold text-slate-400 px-1">
              <span>スタッフ</span>
              <span className="text-right">新規売上(円)</span>
              <span className="text-right">新規契約率(%)</span>
              <span className="text-right">物販(円)</span>
              <span className="text-right">既存売上(円)</span>
              <span />
            </div>
            {rows.map((r) => (
              <div
                key={r.memberId}
                className="grid grid-cols-2 md:grid-cols-[8rem_repeat(4,1fr)_5rem] gap-2 items-end rounded-xl border border-slate-100 p-2.5"
              >
                <span className="col-span-2 md:col-span-1 text-sm font-semibold text-slate-700 md:self-center">{r.name}</span>
                <label className="block md:hidden text-[10px] text-slate-400 font-semibold">新規売上(円)</label>
                <NumCell value={r.newSalesTarget} onChange={(n) => patchRow(r.memberId, { newSalesTarget: n })} />
                <label className="block md:hidden text-[10px] text-slate-400 font-semibold">新規契約率(%)</label>
                <NumCell value={r.newContractRateTarget} onChange={(n) => patchRow(r.memberId, { newContractRateTarget: n })} suffix="%" />
                <label className="block md:hidden text-[10px] text-slate-400 font-semibold">物販(円)</label>
                <NumCell value={r.productTarget} onChange={(n) => patchRow(r.memberId, { productTarget: n })} />
                <label className="block md:hidden text-[10px] text-slate-400 font-semibold">既存売上(円)</label>
                <NumCell value={r.existingSalesTarget} onChange={(n) => patchRow(r.memberId, { existingSalesTarget: n })} />
                <button
                  className="btn-ghost !py-1.5 !px-2 text-xs col-span-2 md:col-span-1"
                  onClick={() => saveRow(r)}
                  disabled={pending}
                >
                  {savedMember === r.memberId ? "✓ 済" : "保存"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
