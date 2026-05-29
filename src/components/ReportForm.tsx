"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CHANNELS, type Member, type Store } from "@/lib/types";
import AiFeedbackCard, { type FeedbackData } from "./AiFeedbackCard";

type MemoDraft = {
  outcome: "won" | "lost";
  channel: string;
  customer_name: string;
  customer_attr: string;
  reason: string;
  next_action: string;
};

function todayJST(): string {
  // Asia/Tokyo の当日 (YYYY-MM-DD)
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

const emptyMemo = (outcome: "won" | "lost"): MemoDraft => ({
  outcome,
  channel: "hpb",
  customer_name: "",
  customer_attr: "",
  reason: "",
  next_action: "",
});

function NumberField({
  label,
  value,
  onChange,
  color = "slate",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  color?: string;
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
    </label>
  );
}

export default function ReportForm({ member, store }: { member: Member; store: Store | null }) {
  const supabase = createClient();

  const [reportDate, setReportDate] = useState(todayJST());
  const [revenue, setRevenue] = useState(0);
  const [targetRevenue, setTargetRevenue] = useState(0);
  const [ch, setCh] = useState<Record<string, number>>({
    hpb_new: 0, hpb_contract: 0,
    meta_new: 0, meta_contract: 0,
    referral_new: 0, referral_contract: 0,
    discount_new: 0, discount_contract: 0,
  });
  const [existingTreatments, setExistingTreatments] = useState(0);
  const [dailyDone, setDailyDone] = useState(false);
  const [prepDone, setPrepDone] = useState(false);
  const [note, setNote] = useState("");
  const [memos, setMemos] = useState<MemoDraft[]>([]);

  const [reportId, setReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // 当該日の既存日報を読み込み（あれば編集）
  const loadExisting = useCallback(
    async (date: string) => {
      setLoading(true);
      setFeedback(null);
      const { data: report } = await supabase
        .from("daily_reports")
        .select("*")
        .eq("member_id", member.id)
        .eq("report_date", date)
        .maybeSingle();

      if (report) {
        setReportId(report.id);
        setRevenue(Number(report.revenue) || 0);
        setTargetRevenue(Number(report.target_revenue) || 0);
        setCh({
          hpb_new: report.hpb_new, hpb_contract: report.hpb_contract,
          meta_new: report.meta_new, meta_contract: report.meta_contract,
          referral_new: report.referral_new, referral_contract: report.referral_contract,
          discount_new: report.discount_new, discount_contract: report.discount_contract,
        });
        setExistingTreatments(report.existing_treatments);
        setDailyDone(report.daily_tasks_completed);
        setPrepDone(report.tomorrow_prep_completed);
        setNote(report.note || "");

        const { data: memoRows } = await supabase
          .from("contract_memos")
          .select("*")
          .eq("report_id", report.id)
          .order("created_at", { ascending: true });
        setMemos(
          (memoRows || []).map((m) => ({
            outcome: m.outcome,
            channel: m.channel || "hpb",
            customer_name: m.customer_name || "",
            customer_attr: m.customer_attr || "",
            reason: m.reason || "",
            next_action: m.next_action || "",
          }))
        );

        const { data: fb } = await supabase
          .from("ai_feedback")
          .select("*")
          .eq("report_id", report.id)
          .maybeSingle();
        if (fb) setFeedback(fb as FeedbackData);
      } else {
        // リセット
        setReportId(null);
        setRevenue(0);
        setTargetRevenue(store?.monthly_target_revenue ? Math.round(store.monthly_target_revenue / 25) : 0);
        setCh({
          hpb_new: 0, hpb_contract: 0, meta_new: 0, meta_contract: 0,
          referral_new: 0, referral_contract: 0, discount_new: 0, discount_contract: 0,
        });
        setExistingTreatments(0);
        setDailyDone(false);
        setPrepDone(false);
        setNote("");
        setMemos([]);
      }
      setLoading(false);
    },
    [member.id, store, supabase]
  );

  useEffect(() => {
    loadExisting(reportDate);
  }, [reportDate, loadExisting]);

  const setChannel = (key: string, v: number) => setCh((p) => ({ ...p, [key]: v }));
  const updateMemo = (i: number, patch: Partial<MemoDraft>) =>
    setMemos((p) => p.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const removeMemo = (i: number) => setMemos((p) => p.filter((_, idx) => idx !== i));

  async function handleSave(generateAi: boolean) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      // 1) 日報 upsert（member_id + report_date が一意）
      const payload = {
        store_id: member.store_id,
        member_id: member.id,
        report_date: reportDate,
        revenue,
        target_revenue: targetRevenue,
        ...ch,
        existing_treatments: existingTreatments,
        daily_tasks_completed: dailyDone,
        tomorrow_prep_completed: prepDone,
        note: note || null,
      };
      const { data: saved, error: saveErr } = await supabase
        .from("daily_reports")
        .upsert(payload, { onConflict: "member_id,report_date" })
        .select()
        .single();
      if (saveErr) throw saveErr;
      const rid: string = saved.id;
      setReportId(rid);

      // 2) メモを置き換え（既存削除 → 挿入）
      await supabase.from("contract_memos").delete().eq("report_id", rid);
      const memoRows = memos
        .filter((m) => m.reason || m.customer_name || m.next_action)
        .map((m) => ({
          report_id: rid,
          store_id: member.store_id,
          member_id: member.id,
          outcome: m.outcome,
          channel: m.channel || null,
          customer_name: m.customer_name || null,
          customer_attr: m.customer_attr || null,
          reason: m.reason || null,
          next_action: m.next_action || null,
        }));
      if (memoRows.length > 0) {
        const { error: memoErr } = await supabase.from("contract_memos").insert(memoRows);
        if (memoErr) throw memoErr;
      }

      setMessage("日報を保存しました。");

      // 3) AIフィードバック生成
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

  const totalNew = ch.hpb_new + ch.meta_new + ch.referral_new + ch.discount_new;
  const totalContract = ch.hpb_contract + ch.meta_contract + ch.referral_contract + ch.discount_contract;

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
          <label className="block flex-1 min-w-[140px]">
            <span className="field-label">本日売上（円）</span>
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
          <label className="block flex-1 min-w-[140px]">
            <span className="field-label">本日目標（円）</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="field-input"
              value={targetRevenue === 0 ? "" : targetRevenue}
              placeholder="0"
              onChange={(e) => setTargetRevenue(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
        </div>
        {targetRevenue > 0 && (
          <p className={`mt-2 text-xs font-semibold ${revenue >= targetRevenue ? "text-emerald-600" : "text-amber-600"}`}>
            {revenue >= targetRevenue
              ? `目標達成（+${(revenue - targetRevenue).toLocaleString()}円）`
              : `目標まで ${(targetRevenue - revenue).toLocaleString()}円`}
          </p>
        )}
      </section>

      {/* チャネル別 新規 / 契約 */}
      <section className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-800">新規 / 契約（チャネル別）</h2>
          <div className="text-xs text-slate-500">
            新規 <span className="font-bold text-blue-600">{totalNew}</span> / 契約{" "}
            <span className="font-bold text-emerald-600">{totalContract}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CHANNELS.map((c) => (
            <div key={c.key} className="rounded-xl border border-slate-100 p-3">
              <p className="text-xs font-bold text-slate-700 mb-2">{c.label}</p>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="新規"
                  color="blue"
                  value={ch[`${c.key}_new`]}
                  onChange={(v) => setChannel(`${c.key}_new`, v)}
                />
                <NumberField
                  label="契約"
                  color="emerald"
                  value={ch[`${c.key}_contract`]}
                  onChange={(v) => setChannel(`${c.key}_contract`, v)}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 max-w-[200px]">
          <NumberField
            label="既存（リピート）施術数"
            color="orange"
            value={existingTreatments}
            onChange={setExistingTreatments}
          />
        </div>
      </section>

      {/* 業務チェック */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3">業務チェック</h2>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 cursor-pointer">
            <input type="checkbox" checked={dailyDone} onChange={(e) => setDailyDone(e.target.checked)} />
            <span className="text-sm font-medium text-slate-700">当日業務 完了</span>
          </label>
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 cursor-pointer">
            <input type="checkbox" checked={prepDone} onChange={(e) => setPrepDone(e.target.checked)} />
            <span className="text-sm font-medium text-slate-700">翌日準備 完了</span>
          </label>
        </div>
      </section>

      {/* 契約メモ */}
      <section className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-800">契約メモ（お客様ごと）</h2>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setMemos((p) => [...p, emptyMemo("won")])}>
              ＋ 契約取れた
            </button>
            <button type="button" className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setMemos((p) => [...p, emptyMemo("lost")])}>
              ＋ 取れなかった
            </button>
          </div>
        </div>

        {memos.length === 0 && (
          <p className="text-xs text-slate-400">
            契約が取れた／取れなかったお客様の理由・次回アクションを記録すると、AIが原因分析と改善策をフィードバックします。
          </p>
        )}

        <div className="space-y-3">
          {memos.map((m, i) => (
            <div
              key={i}
              className={`rounded-xl border p-3 ${m.outcome === "won" ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold ${m.outcome === "won" ? "text-emerald-700" : "text-rose-700"}`}>
                  {m.outcome === "won" ? "✓ 契約" : "✗ 未契約"}
                </span>
                <button type="button" className="text-xs text-slate-400 hover:text-rose-500" onClick={() => removeMemo(i)}>
                  削除
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-1">お客様（呼称）</span>
                  <input className="field-input !py-2" value={m.customer_name} onChange={(e) => updateMemo(i, { customer_name: e.target.value })} />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-1">属性（年代/主訴等）</span>
                  <input className="field-input !py-2" value={m.customer_attr} onChange={(e) => updateMemo(i, { customer_attr: e.target.value })} />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-slate-500 mb-1">チャネル</span>
                  <select className="field-input !py-2" value={m.channel} onChange={(e) => updateMemo(i, { channel: e.target.value })}>
                    {CHANNELS.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                    <option value="other">その他</option>
                  </select>
                </label>
              </div>
              <label className="block mb-2">
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
              <label className="block">
                <span className="block text-[11px] text-slate-500 mb-1">次回アクション / フォロー</span>
                <input className="field-input !py-2" value={m.next_action} onChange={(e) => updateMemo(i, { next_action: e.target.value })} />
              </label>
            </div>
          ))}
        </div>
      </section>

      {/* 所感 */}
      <section className="glass-card p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-2">所感・振り返り</h2>
        <textarea
          className="field-input"
          rows={3}
          placeholder="今日うまくいったこと、課題に感じたことなど"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </section>

      {/* メッセージ */}
      {message && <p className="text-sm text-emerald-600 font-semibold">{message}</p>}
      {error && <p className="text-sm text-rose-600 font-semibold">{error}</p>}

      {/* 保存ボタン */}
      <div className="flex flex-col sm:flex-row gap-3 sticky bottom-3 z-10">
        <button className="btn-ghost flex-1" onClick={() => handleSave(false)} disabled={saving}>
          {saving ? "保存中…" : "保存のみ"}
        </button>
        <button className="btn-primary flex-1" onClick={() => handleSave(true)} disabled={saving || feedbackLoading}>
          {feedbackLoading ? "AI分析中…" : "保存してAIフィードバック"}
        </button>
      </div>

      {/* AIフィードバック */}
      {(feedback || feedbackLoading) && (
        <AiFeedbackCard feedback={feedback} loading={feedbackLoading} />
      )}
    </div>
  );
}
