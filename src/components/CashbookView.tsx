"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  paymentMethodLabel,
  type CashbookEntry,
  type CashEntryType,
  type Member,
  type PaymentMethod,
  type Store,
} from "@/lib/types";

function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}
function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function monthJST(): string {
  return todayJST().slice(0, 7);
}

type FormState = {
  entry_date: string;
  type: CashEntryType;
  category: string;
  amount: string;
  payment_method: PaymentMethod;
  customer_name: string;
  treatment_count: string;
  recorder: string;
  description: string;
};

function emptyForm(date: string, recorder: string): FormState {
  return {
    entry_date: date,
    type: "income",
    category: "施術売上",
    amount: "",
    payment_method: "CASH",
    customer_name: "",
    treatment_count: "1",
    recorder,
    description: "",
  };
}

export default function CashbookView({
  member,
  store,
  initialEntries,
  canEdit = true,
}: {
  member: Member;
  store: Store | null;
  initialEntries: CashbookEntry[];
  canEdit?: boolean;
}) {
  const supabase = createClient();
  const [entries, setEntries] = useState<CashbookEntry[]>(initialEntries);
  const [viewMonth, setViewMonth] = useState(monthJST());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(todayJST(), member.name));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCashCheck, setShowCashCheck] = useState(false);
  const [cashCheckAmount, setCashCheckAmount] = useState("");

  // 現金残高（全期間）
  const cashBalance = useMemo(() => {
    const cashIn = entries
      .filter((e) => e.type === "income" && e.payment_method === "CASH")
      .reduce((s, e) => s + Number(e.amount), 0);
    const cashOut = entries
      .filter((e) => e.type === "expense" && e.payment_method === "CASH")
      .reduce((s, e) => s + Number(e.amount), 0);
    return cashIn - cashOut;
  }, [entries]);

  // 当月エントリ
  const monthEntries = useMemo(
    () =>
      entries
        .filter((e) => e.entry_date.startsWith(viewMonth))
        .sort(
          (a, b) =>
            b.entry_date.localeCompare(a.entry_date) ||
            (b.created_at || "").localeCompare(a.created_at || "")
        ),
    [entries, viewMonth]
  );

  // 日別グループ
  const dailyGroups = useMemo(() => {
    const groups: Record<string, CashbookEntry[]> = {};
    monthEntries.forEach((e) => {
      (groups[e.entry_date] ||= []).push(e);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [monthEntries]);

  // 月間集計
  const summary = useMemo(() => {
    const income = monthEntries.filter((e) => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
    const expense = monthEntries.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
    const cashIn = monthEntries
      .filter((e) => e.type === "income" && e.payment_method === "CASH")
      .reduce((s, e) => s + Number(e.amount), 0);
    const cashOut = monthEntries
      .filter((e) => e.type === "expense" && e.payment_method === "CASH")
      .reduce((s, e) => s + Number(e.amount), 0);
    const treatments = monthEntries.reduce((s, e) => s + (e.treatment_count || 0), 0);
    const byCategory: Record<string, number> = {};
    monthEntries.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount);
    });
    return { income, expense, cashIn, cashOut, treatments, byCategory };
  }, [monthEntries]);

  function resetForm() {
    setForm(emptyForm(todayJST(), member.name));
    setEditingId(null);
  }

  function changeMonth(delta: number) {
    const d = new Date(viewMonth + "-01T00:00:00");
    d.setMonth(d.getMonth() + delta);
    setViewMonth(d.toISOString().slice(0, 7));
  }

  function startEdit(e: CashbookEntry) {
    setForm({
      entry_date: e.entry_date,
      type: e.type,
      category: e.category,
      amount: String(e.amount),
      payment_method: e.payment_method,
      customer_name: e.customer_name || "",
      treatment_count: String(e.treatment_count || 0),
      recorder: e.recorder || "",
      description: e.description || "",
    });
    setEditingId(e.id);
    setShowForm(true);
    setError(null);
  }

  async function handleSubmit() {
    const amount = parseInt(form.amount, 10);
    if (!amount || amount <= 0) {
      setError("金額を入力してください。");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      store_id: member.store_id,
      member_id: member.id,
      entry_date: form.entry_date,
      type: form.type,
      category: form.category,
      amount,
      payment_method: form.payment_method,
      description: form.description || null,
      customer_name: form.type === "income" ? form.customer_name || null : null,
      treatment_count: form.type === "income" ? parseInt(form.treatment_count, 10) || 0 : 0,
      recorder: form.recorder || null,
    };
    try {
      if (editingId) {
        const { data, error } = await supabase
          .from("cashbook_entries")
          .update(payload)
          .eq("id", editingId)
          .select()
          .single();
        if (error) throw error;
        setEntries((prev) => prev.map((e) => (e.id === editingId ? (data as CashbookEntry) : e)));
      } else {
        const { data, error } = await supabase
          .from("cashbook_entries")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setEntries((prev) => [data as CashbookEntry, ...prev]);
      }
      resetForm();
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("この記録を削除しますか？")) return;
    const { error } = await supabase.from("cashbook_entries").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleCashCheck() {
    const actual = parseInt(cashCheckAmount, 10) || 0;
    const diff = actual - cashBalance;
    if (diff === 0) {
      setShowCashCheck(false);
      setCashCheckAmount("");
      return;
    }
    const payload = {
      store_id: member.store_id,
      member_id: member.id,
      entry_date: todayJST(),
      type: (diff > 0 ? "income" : "expense") as CashEntryType,
      category: diff > 0 ? "その他収入" : "その他経費",
      amount: Math.abs(diff),
      payment_method: "CASH" as PaymentMethod,
      description: `レジ金チェック差異 実残高:${yen(actual)} / 理論:${yen(cashBalance)}`,
      recorder: "レジ金チェック",
      is_cash_check: true,
    };
    setSaving(true);
    const { data, error } = await supabase.from("cashbook_entries").insert(payload).select().single();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEntries((prev) => [data as CashbookEntry, ...prev]);
    setShowCashCheck(false);
    setCashCheckAmount("");
  }

  const categories = form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const cashCheckDiff = cashCheckAmount ? (parseInt(cashCheckAmount, 10) || 0) - cashBalance : null;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">出納帳</h1>
          <p className="text-xs text-slate-500">{store?.name}</p>
        </div>
        {canEdit && (
          <button
            className="btn-primary !py-2"
            onClick={() => {
              resetForm();
              setShowForm((v) => !v);
            }}
          >
            ＋ 記帳する
          </button>
        )}
      </div>

      {/* 現金残高 */}
      <div className="rounded-2xl p-5 border-2 border-sise-200 bg-gradient-to-br from-sise-50 to-white">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-sise-600">現金残高</span>
          {canEdit && (
            <button
              className="text-[11px] bg-sise-100 text-sise-700 px-2.5 py-1 rounded-lg font-semibold hover:bg-sise-200 transition-colors"
              onClick={() => {
                setShowCashCheck(true);
                setCashCheckAmount("");
              }}
            >
              レジ金チェック
            </button>
          )}
        </div>
        <p className="text-3xl font-extrabold text-slate-800">{yen(cashBalance)}</p>
        <div className="flex gap-4 mt-2 text-xs">
          <span className="text-sise-600">月入金(現金): <strong>{yen(summary.cashIn)}</strong></span>
          <span className="text-red-500">月出金(現金): <strong>{yen(summary.cashOut)}</strong></span>
        </div>
      </div>

      {/* レジ金チェック */}
      {showCashCheck && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/40 p-5">
          <h3 className="font-bold text-slate-800 mb-1">レジ金チェック</h3>
          <p className="text-xs text-slate-500 mb-3">レジの実際の現金を数えて入力してください。理論残高と照合し、差異を記録します。</p>
          <div className="flex items-end gap-3 flex-wrap">
            <label className="block flex-1 min-w-[160px]">
              <span className="field-label">実際のレジ金額（円）</span>
              <input
                type="number"
                inputMode="numeric"
                className="field-input text-lg font-bold"
                value={cashCheckAmount}
                onChange={(e) => setCashCheckAmount(e.target.value)}
                placeholder="例: 50000"
                autoFocus
              />
            </label>
            <div className="text-center pb-1">
              <p className="text-[11px] text-slate-400">理論残高</p>
              <p className="text-lg font-extrabold text-slate-700">{yen(cashBalance)}</p>
            </div>
          </div>
          {cashCheckDiff !== null && (
            <div className="mt-3 p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">差異:</span>
              <span
                className={`text-lg font-extrabold ${
                  cashCheckDiff === 0 ? "text-emerald-600" : cashCheckDiff > 0 ? "text-blue-600" : "text-red-600"
                }`}
              >
                {cashCheckDiff === 0 ? "一致" : (cashCheckDiff > 0 ? "+" : "") + yen(cashCheckDiff)}
              </span>
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-ghost !py-2" onClick={() => { setShowCashCheck(false); setCashCheckAmount(""); }}>
              キャンセル
            </button>
            <button className="btn-primary !py-2 !bg-amber-500 hover:!bg-amber-600" onClick={handleCashCheck} disabled={!cashCheckAmount || saving}>
              {cashCheckDiff === 0 ? "閉じる" : "差異を記録"}
            </button>
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4">
          <p className="text-[11px] text-slate-500 mb-1">月間入金</p>
          <p className="text-xl font-extrabold text-sise-600">{yen(summary.income)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[11px] text-slate-500 mb-1">月間出金</p>
          <p className="text-xl font-extrabold text-red-500">{yen(summary.expense)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[11px] text-slate-500 mb-1">月間収支</p>
          <p className={`text-xl font-extrabold ${summary.income - summary.expense >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {yen(summary.income - summary.expense)}
          </p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[11px] text-slate-500 mb-1">施術回数</p>
          <p className="text-xl font-extrabold text-blue-600">{summary.treatments}</p>
        </div>
      </div>

      {/* 記帳フォーム */}
      {showForm && (
        <div className="glass-card p-5">
          <h3 className="font-bold text-slate-800 mb-4">{editingId ? "記録を編集" : "新しい記録を追加"}</h3>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setForm((p) => ({ ...p, type: "income", category: "施術売上" }))}
              className={`flex-1 py-2.5 rounded-xl border-2 font-semibold text-sm transition-colors ${
                form.type === "income" ? "bg-sise-50 border-sise-400 text-sise-700" : "bg-white border-slate-200 text-slate-500"
              }`}
            >
              入金
            </button>
            <button
              onClick={() => setForm((p) => ({ ...p, type: "expense", category: "消耗品" }))}
              className={`flex-1 py-2.5 rounded-xl border-2 font-semibold text-sm transition-colors ${
                form.type === "expense" ? "bg-red-50 border-red-400 text-red-700" : "bg-white border-slate-200 text-slate-500"
              }`}
            >
              出金
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="block">
              <span className="field-label">日付 *</span>
              <input type="date" max={todayJST()} className="field-input" value={form.entry_date}
                onChange={(e) => setForm((p) => ({ ...p, entry_date: e.target.value }))} />
            </label>
            <label className="block">
              <span className="field-label">カテゴリ *</span>
              <select className="field-input" value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="field-label">金額（円） *</span>
              <input type="number" inputMode="numeric" min={0} className="field-input" placeholder="0" value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
            </label>
            <label className="block">
              <span className="field-label">支払方法</span>
              <select className="field-input" value={form.payment_method}
                onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value as PaymentMethod }))}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="field-label">記録者</span>
              <input type="text" className="field-input" placeholder="スタッフ名" value={form.recorder}
                onChange={(e) => setForm((p) => ({ ...p, recorder: e.target.value }))} />
            </label>
            {form.type === "income" && (
              <>
                <label className="block">
                  <span className="field-label">顧客名</span>
                  <input type="text" className="field-input" placeholder="顧客名" value={form.customer_name}
                    onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="field-label">施術回数</span>
                  <input type="number" min={0} className="field-input" value={form.treatment_count}
                    onChange={(e) => setForm((p) => ({ ...p, treatment_count: e.target.value }))} />
                </label>
              </>
            )}
            <label className="block md:col-span-2 lg:col-span-3">
              <span className="field-label">摘要・メモ</span>
              <input type="text" className="field-input" placeholder="内容を入力..." value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </label>
          </div>

          {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}

          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-ghost !py-2" onClick={() => { setShowForm(false); resetForm(); }}>キャンセル</button>
            <button className="btn-primary !py-2" onClick={handleSubmit} disabled={saving}>
              {saving ? "保存中…" : editingId ? "更新" : "記録する"}
            </button>
          </div>
        </div>
      )}

      {/* 月ナビ + 一覧 */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <button className="p-2 rounded-xl hover:bg-sise-50 text-slate-500" onClick={() => changeMonth(-1)}>‹</button>
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-800">
              {new Date(viewMonth + "-01T00:00:00").toLocaleDateString("ja-JP", { year: "numeric", month: "long" })}
            </h2>
            <p className="text-xs text-slate-400">{monthEntries.length}件の記録</p>
          </div>
          <button className="p-2 rounded-xl hover:bg-sise-50 text-slate-500" onClick={() => changeMonth(1)}>›</button>
        </div>

        {dailyGroups.length === 0 && (
          <div className="text-center py-10 text-slate-400">
            <p className="text-sm font-medium">この月の記録がありません</p>
            <p className="text-xs mt-1">「記帳する」から追加できます</p>
          </div>
        )}

        <div className="space-y-4">
          {dailyGroups.map(([date, dayEntries]) => {
            const dIn = dayEntries.filter((e) => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
            const dOut = dayEntries.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
            const dTreat = dayEntries.reduce((s, e) => s + (e.treatment_count || 0), 0);
            const label = new Date(date + "T00:00:00").toLocaleDateString("ja-JP", {
              month: "short",
              day: "numeric",
              weekday: "short",
            });
            return (
              <div key={date}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-700">{label}</span>
                    {dTreat > 0 && (
                      <span className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold">施術 {dTreat}回</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {dIn > 0 && <span className="font-bold text-sise-600">+{yen(dIn)}</span>}
                    {dOut > 0 && <span className="font-bold text-red-500">-{yen(dOut)}</span>}
                  </div>
                </div>
                <div className="space-y-1">
                  {dayEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center p-2.5 rounded-xl border border-slate-100 hover:border-sise-200 bg-white/60 group transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800 truncate">{entry.category}</span>
                          {entry.customer_name && (
                            <span className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium truncate">{entry.customer_name}</span>
                          )}
                          {entry.treatment_count > 0 && (
                            <span className="text-[11px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-semibold">{entry.treatment_count}回</span>
                          )}
                        </div>
                        {(entry.description || entry.recorder) && (
                          <div className="flex items-center gap-2 mt-0.5">
                            {entry.description && <p className="text-[11px] text-slate-400 truncate">{entry.description}</p>}
                            {entry.recorder && <span className="text-[10px] text-slate-300 shrink-0">by {entry.recorder}</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 ml-2 shrink-0">
                        <span className={`text-sm font-bold ${entry.type === "income" ? "text-sise-700" : "text-red-600"}`}>
                          {entry.type === "income" ? "+" : "-"}{yen(Number(entry.amount))}
                        </span>
                        <span
                          className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${
                            entry.payment_method === "QR"
                              ? "bg-blue-50 text-blue-600"
                              : entry.payment_method === "CARD" || entry.payment_method === "SQUARE"
                              ? "bg-purple-50 text-purple-600"
                              : entry.payment_method === "TRANSFER"
                              ? "bg-indigo-50 text-indigo-600"
                              : "bg-amber-50 text-amber-600"
                          }`}
                        >
                          {paymentMethodLabel(entry.payment_method)}
                        </span>
                        {canEdit && (
                          <div className="md:opacity-0 md:group-hover:opacity-100 flex gap-0.5 transition-opacity">
                            <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" onClick={() => startEdit(entry)}>編集</button>
                            <button className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400" onClick={() => handleDelete(entry.id)}>削除</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* カテゴリ別集計 */}
      {monthEntries.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="font-bold text-slate-800 mb-3">カテゴリ別集計</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-sise-600 mb-2">入金</p>
              <div className="space-y-1.5">
                {Object.entries(summary.byCategory)
                  .filter(([c]) => INCOME_CATEGORIES.includes(c))
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amount]) => (
                    <div key={cat} className="flex items-center justify-between p-2 bg-sise-50/40 rounded-lg">
                      <span className="text-xs font-medium text-slate-700">{cat}</span>
                      <span className="text-xs font-bold text-sise-700">{yen(amount)}</span>
                    </div>
                  ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-red-500 mb-2">出金</p>
              <div className="space-y-1.5">
                {Object.entries(summary.byCategory)
                  .filter(([c]) => EXPENSE_CATEGORIES.includes(c))
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amount]) => (
                    <div key={cat} className="flex items-center justify-between p-2 bg-red-50/40 rounded-lg">
                      <span className="text-xs font-medium text-slate-700">{cat}</span>
                      <span className="text-xs font-bold text-red-600">{yen(amount)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
