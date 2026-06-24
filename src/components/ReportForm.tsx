"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  SUBSCRIPTION_PLANS,
  TICKET_PLANS,
  type ContractType,
  type MediaChannel,
  type Member,
  type MenuPlan,
  type Store,
} from "@/lib/types";
import AiFeedbackCard, { type FeedbackData } from "./AiFeedbackCard";

type MemoDraft = {
  outcome: "won" | "lost";
  channel: string;
  amount: string; // 単価媒体のときの金額（円）
  contract_type: ContractType | null;
  contract_plan: number | null;
  menu_plan_id: string; // エステ: 契約したメニュー
  customer_name: string;
  customer_attr: string;
  reason: string;
};

function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const emptyMemo = (outcome: "won" | "lost"): MemoDraft => ({
  outcome,
  channel: "",
  amount: "",
  contract_type: outcome === "won" ? "ticket" : null,
  contract_plan: outcome === "won" ? TICKET_PLANS[0] : null,
  menu_plan_id: "",
  customer_name: "",
  customer_attr: "",
  reason: "",
});

function NumberField({
  label,
  value,
  onChange,
  color = "slate",
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  color?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className={`block text-[11px] font-semibold text-${color}-500 mb-1`}>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        className="field-input text-center !py-2"
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
      {hint && <span className="block text-[10px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

export default function ReportForm({
  member,
  store,
  channels,
  menuPlans = [],
}: {
  member: Member;
  store: Store | null;
  channels: MediaChannel[];
  menuPlans?: MenuPlan[];
}) {
  const supabase = createClient();
  const isEsthe = member.genre === "esthe";

  const [reportDate, setReportDate] = useState(todayJST());
  const [revenue, setRevenue] = useState(0);
  const [existingTreatments, setExistingTreatments] = useState(0);
  const [nextReservations, setNextReservations] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [secondVisit, setSecondVisit] = useState(0);
  const [reflection, setReflection] = useState("");
  const [tomorrowAction, setTomorrowAction] = useState("");
  const [memos, setMemos] = useState<MemoDraft[]>([]);

  const [reportId, setReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const resetForm = useCallback(() => {
    setReportId(null);
    setRevenue(0);
    setExistingTreatments(0);
    setNextReservations(0);
    setNewCount(0);
    setSecondVisit(0);
    setReflection("");
    setTomorrowAction("");
    setMemos([]);
  }, []);

  const loadExisting = useCallback(
    async (date: string) => {
      setLoading(true);
      setFeedback(null);
      setMessage(null);
      setError(null);
      const { data: report } = await supabase
        .from("daily_reports")
        .select("*")
        .eq("member_id", member.id)
        .eq("report_date", date)
        .maybeSingle();

      if (report) {
        setReportId(report.id);
        setRevenue(Number(report.revenue) || 0);
        setExistingTreatments(report.existing_treatments || 0);
        setNextReservations(report.next_reservations || 0);
        setNewCount(report.new_count || 0);
        setSecondVisit(report.second_visit_reservations || 0);
        setReflection(report.reflection || "");
        setTomorrowAction(report.tomorrow_action || "");

        const { data: memoRows } = await supabase
          .from("contract_memos")
          .select("*")
          .eq("report_id", report.id)
          .order("created_at", { ascending: true });
        setMemos(
          (memoRows || []).map((m) => ({
            outcome: m.outcome,
            channel: m.channel || "",
            amount: m.amount != null ? String(m.amount) : "",
            contract_type: m.contract_type ?? (m.outcome === "won" ? "ticket" : null),
            contract_plan: m.contract_plan ?? (m.outcome === "won" ? TICKET_PLANS[0] : null),
            menu_plan_id: m.menu_plan_id || "",
            customer_name: m.customer_name || "",
            customer_attr: m.customer_attr || "",
            reason: m.reason || "",
          }))
        );

        const { data: fb } = await supabase
          .from("ai_feedback")
          .select("*")
          .eq("report_id", report.id)
          .maybeSingle();
        if (fb) setFeedback(fb as FeedbackData);
      } else {
        resetForm();
      }
      setLoading(false);
    },
    [member.id, supabase, resetForm]
  );

  useEffect(() => {
    loadExisting(reportDate);
  }, [reportDate, loadExisting]);

  const updateMemo = (i: number, patch: Partial<MemoDraft>) =>
    setMemos((p) => p.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const removeMemo = (i: number) => setMemos((p) => p.filter((_, idx) => idx !== i));

  function setContractType(i: number, t: ContractType) {
    const firstPlan = t === "ticket" ? TICKET_PLANS[0] : SUBSCRIPTION_PLANS[0];
    updateMemo(i, { contract_type: t, contract_plan: firstPlan });
  }

  async function handleSave(generateAi: boolean) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        store_id: member.store_id,
        member_id: member.id,
        report_date: reportDate,
        revenue,
        existing_treatments: existingTreatments,
        next_reservations: nextReservations,
        new_count: newCount,
        second_visit_reservations: secondVisit,
        reflection: reflection || null,
        tomorrow_action: tomorrowAction || null,
      };
      const { data: saved, error: saveErr } = await supabase
        .from("daily_reports")
        .upsert(payload, { onConflict: "member_id,report_date" })
        .select()
        .single();
      if (saveErr) throw saveErr;
      const rid: string = saved.id;
      setReportId(rid);

      // メモを置き換え
      await supabase.from("contract_memos").delete().eq("report_id", rid);
      const memoRows = memos
        .filter((m) => m.outcome === "won" || m.reason || m.customer_name)
        .map((m) => ({
          report_id: rid,
          store_id: member.store_id,
          member_id: member.id,
          outcome: m.outcome,
          channel: m.channel || null,
          amount: m.amount ? Math.max(0, parseInt(m.amount, 10) || 0) : null,
          // エステはメニュー連携、整体は回数券/定額
          menu_plan_id: m.outcome === "won" && isEsthe && m.menu_plan_id ? m.menu_plan_id : null,
          menu_label:
            m.outcome === "won" && isEsthe && m.menu_plan_id
              ? menuPlans.find((p) => p.id === m.menu_plan_id)?.label
                ? `${menuPlans.find((p) => p.id === m.menu_plan_id)!.group_name} ${menuPlans.find((p) => p.id === m.menu_plan_id)!.label ?? ""}`.trim()
                : null
              : null,
          contract_type: m.outcome === "won" && !isEsthe ? m.contract_type : null,
          contract_plan: m.outcome === "won" && !isEsthe ? m.contract_plan : null,
          customer_name: m.customer_name || null,
          customer_attr: m.customer_attr || null,
          reason: m.reason || null,
        }));
      if (memoRows.length > 0) {
        const { error: memoErr } = await supabase.from("contract_memos").insert(memoRows);
        if (memoErr) throw memoErr;
      }

      setMessage("日報を保存しました。");

      if (generateAi) {
        setFeedbackLoading(true);
        setFeedback(null);
        const res = await fetch("/api/ai-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId: rid, force: true }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "AIフィードバックの生成に失敗しました");
        setFeedback(json.feedback as FeedbackData);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
      setFeedbackLoading(false);
    }
  }

  const wonCount = memos.filter((m) => m.outcome === "won").length;
  const reservationRatePct =
    existingTreatments > 0 ? Math.round((nextReservations / existingTreatments) * 100) : 0;

  // メニューを section ごとにグルーピング（契約内容セレクト用）
  const menuOptionGroups = (() => {
    const order: string[] = [];
    const map = new Map<string, MenuPlan[]>();
    for (const p of menuPlans) {
      if (!map.has(p.section)) {
        map.set(p.section, []);
        order.push(p.section);
      }
      map.get(p.section)!.push(p);
    }
    return order.map((section) => ({ section, items: map.get(section)! }));
  })();
  const secondVisitRatePct = newCount > 0 ? Math.round((secondVisit / newCount) * 100) : 0;

  if (loading) {
    return <div className="text-center py-16 text-slate-400 text-sm">読み込み中…</div>;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 日付・売上 */}
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="field-label">日付</span>
            <input
              type="date"
              className="field-input"
              value={reportDate}
              max={todayJST()}
              onChange={(e) => setReportDate(e.target.value)}
            />
          </label>
          <label className="block flex-1 min-w-[160px]">
            <span className="field-label">個人売上（円）</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="field-input"
              value={revenue === 0 ? "" : revenue}
              placeholder="0"
              onChange={(e) => setRevenue(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
        </div>
      </section>

      {/* 既存施術 → 次回予約（整体・エステ共通） */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3">施術数（既存のみ）</h2>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <NumberField
            label={isEsthe ? "施術数（新規を含めない）" : "施術数（新患を含めない）"}
            color="orange"
            value={existingTreatments}
            onChange={setExistingTreatments}
          />
          <NumberField
            label={isEsthe ? "うち 既存客の次回予約数" : "うち 次回予約数"}
            color="emerald"
            value={nextReservations}
            onChange={setNextReservations}
          />
        </div>
        {existingTreatments > 0 && (
          <p className="text-xs text-slate-500 mt-2">次回予約率 <span className="font-bold text-emerald-600">{reservationRatePct}%</span></p>
        )}
      </section>

      {/* 新規 → 2回目予約 */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3">新規</h2>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <NumberField label="新規数" color="blue" value={newCount} onChange={setNewCount} />
          <NumberField label="うち 2回目予約につながった数" color="emerald" value={secondVisit} onChange={setSecondVisit} />
        </div>
        {newCount > 0 && (
          <p className="text-xs text-slate-500 mt-2">2回目予約転換率 <span className="font-bold text-emerald-600">{secondVisitRatePct}%</span></p>
        )}
      </section>

      {/* 新規のお客様ごとの契約記録 */}
      <section className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">新規のお客様ごとの契約記録</h2>
            <p className="text-[11px] text-slate-400">契約の有無・内容と、取れた/取れなかった理由を残してください</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setMemos((p) => [...p, emptyMemo("won")])}>
              ＋ 契約あり
            </button>
            <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setMemos((p) => [...p, emptyMemo("lost")])}>
              ＋ 契約なし
            </button>
          </div>
        </div>

        {memos.length === 0 && (
          <p className="text-xs text-slate-400">「契約あり」「契約なし」ボタンで、新規のお客様ごとに記録を追加できます。</p>
        )}

        <div className="space-y-3">
          {memos.map((m, i) => (
            <div
              key={i}
              className={`rounded-xl border p-3 ${m.outcome === "won" ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold ${m.outcome === "won" ? "text-emerald-700" : "text-rose-700"}`}>
                  {m.outcome === "won" ? "✓ 契約あり" : "✗ 契約なし"}
                </span>
                <button type="button" className="text-xs text-slate-400 hover:text-rose-500" onClick={() => removeMemo(i)}>
                  削除
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-1">媒体（どこから来たお客様か）</span>
                  <select
                    className="field-input !py-2"
                    value={m.channel}
                    onChange={(e) => updateMemo(i, { channel: e.target.value })}
                  >
                    <option value="">-- 媒体を選択 --</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                    {/* 既存データに無い値が入っていた場合も表示 */}
                    {m.channel && !channels.some((c) => c.name === m.channel) && (
                      <option value={m.channel}>{m.channel}</option>
                    )}
                  </select>
                </label>
                {channels.find((c) => c.name === m.channel)?.unit_price && (
                  <label className="block">
                    <span className="block text-[11px] text-slate-500 mb-1">単価（円）</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="field-input !py-2"
                      placeholder="0"
                      value={m.amount}
                      onChange={(e) => updateMemo(i, { amount: e.target.value })}
                    />
                  </label>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-1">お客様（呼称・任意）</span>
                  <input className="field-input !py-2" value={m.customer_name} onChange={(e) => updateMemo(i, { customer_name: e.target.value })} />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-1">属性（年代/主訴等・任意）</span>
                  <input className="field-input !py-2" value={m.customer_attr} onChange={(e) => updateMemo(i, { customer_attr: e.target.value })} />
                </label>
              </div>

              {/* 契約内容（契約ありのみ） */}
              {m.outcome === "won" && isEsthe && (
                <div className="mb-2 rounded-lg bg-white/70 border border-emerald-100 p-2.5">
                  <p className="text-[11px] font-semibold text-slate-500 mb-2">契約内容（料金表メニュー）</p>
                  <select
                    className="field-input !py-2"
                    value={m.menu_plan_id}
                    onChange={(e) => updateMemo(i, { menu_plan_id: e.target.value })}
                  >
                    <option value="">-- メニューを選択 --</option>
                    {menuOptionGroups.map((g) => (
                      <optgroup key={g.section} label={g.section}>
                        {g.items.map((p) => (
                          <option key={p.id} value={p.id}>
                            {[p.group_name, p.variant, p.label].filter(Boolean).join(" ")}
                            {p.price != null ? `（¥${Number(p.price).toLocaleString()}）` : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {menuPlans.length === 0 && (
                    <p className="text-[11px] text-amber-600 mt-1">料金表メニューが未登録です。管理画面で登録してください。</p>
                  )}
                </div>
              )}
              {m.outcome === "won" && !isEsthe && (
                <div className="mb-2 rounded-lg bg-white/70 border border-emerald-100 p-2.5">
                  <p className="text-[11px] font-semibold text-slate-500 mb-2">契約内容</p>
                  <div className="flex gap-2 mb-2">
                    {(["ticket", "subscription"] as ContractType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setContractType(i, t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          m.contract_type === t
                            ? "bg-sise-500 text-white border-sise-500"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {t === "ticket" ? "回数券" : "定額"}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(m.contract_type === "ticket" ? TICKET_PLANS : SUBSCRIPTION_PLANS).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => updateMemo(i, { contract_plan: p })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          m.contract_plan === p
                            ? "bg-emerald-500 text-white border-emerald-500"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {m.contract_type === "ticket" ? `${p}回` : `月${p}回`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="block">
                <span className="block text-[11px] text-slate-500 mb-1">
                  {m.outcome === "won" ? "契約できた理由・決め手" : "契約に至らなかった理由"}
                </span>
                <textarea
                  className="field-input !py-2"
                  rows={2}
                  value={m.reason}
                  onChange={(e) => updateMemo(i, { reason: e.target.value })}
                />
              </label>
            </div>
          ))}
        </div>

        {memos.length > 0 && (
          <p className="text-[11px] text-slate-400 mt-2">契約あり {wonCount}件 / 記録 {memos.length}件</p>
        )}
      </section>

      {/* 今日の振り返り */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-2">今日の振り返り</h2>
        <textarea
          className="field-input"
          rows={3}
          placeholder="今日うまくいったこと・課題に感じたこと"
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
        />
      </section>

      {/* 明日の行動 */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-2">明日の行動</h2>
        <textarea
          className="field-input"
          rows={3}
          placeholder="明日の行動計画等"
          value={tomorrowAction}
          onChange={(e) => setTomorrowAction(e.target.value)}
        />
      </section>

      {message && <p className="text-sm text-emerald-600 font-semibold">{message}</p>}
      {error && <p className="text-sm text-rose-600 font-semibold">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-3 sticky bottom-3 z-10">
        <button className="btn-ghost flex-1" onClick={() => handleSave(false)} disabled={saving}>
          {saving ? "保存中…" : "保存のみ"}
        </button>
        <button className="btn-primary flex-1" onClick={() => handleSave(true)} disabled={saving || feedbackLoading}>
          {feedbackLoading ? "AI分析中…" : "保存してAIフィードバック"}
        </button>
      </div>

      {(feedback || feedbackLoading) && <AiFeedbackCard feedback={feedback} loading={feedbackLoading} />}
    </div>
  );
}
