"use client";

import { useState } from "react";
import type { StaffCoaching } from "@/lib/types";

type StaffItem = { id: string; name: string };

function Block({ title, body, accent }: { title: string; body?: string | null; accent: string }) {
  if (!body) return null;
  return (
    <div>
      <p className={`text-xs font-bold mb-1 ${accent}`}>{title}</p>
      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{body}</p>
    </div>
  );
}

export default function CoachingView({
  storeId,
  month,
  staff,
  initial,
}: {
  storeId: string;
  month: string;
  staff: StaffItem[];
  initial: Record<string, StaffCoaching>;
}) {
  const [coaching, setCoaching] = useState<Record<string, StaffCoaching>>(initial);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<{ id: string; msg: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function generate(memberId: string, force: boolean) {
    setLoadingId(memberId);
    setErrorId(null);
    try {
      const res = await fetch("/api/staff-coaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, storeId, month, force }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "生成に失敗しました");
      setCoaching((prev) => ({ ...prev, [memberId]: json.coaching as StaffCoaching }));
      setOpenId(memberId);
    } catch (e) {
      setErrorId({ id: memberId, msg: e instanceof Error ? e.message : "生成に失敗しました" });
    } finally {
      setLoadingId(null);
    }
  }

  if (staff.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">この店舗に在籍スタッフがいません。</p>;
  }

  return (
    <div className="space-y-3">
      {staff.map((m) => {
        const c = coaching[m.id];
        const isOpen = openId === m.id;
        const loading = loadingId === m.id;
        return (
          <div key={m.id} className="glass-card p-4">
            <div className="flex items-center justify-between gap-2">
              <button
                className="flex items-center gap-2 text-left min-w-0"
                onClick={() => setOpenId(isOpen ? null : m.id)}
              >
                <span className="text-sm font-bold text-slate-800">{m.name}</span>
                {c ? (
                  <span className="chip bg-sise-100 text-sise-700 text-[10px]">指導メモあり</span>
                ) : (
                  <span className="chip bg-slate-100 text-slate-400 text-[10px]">未生成</span>
                )}
              </button>
              <button
                className="btn-primary !py-1.5 !px-3 text-xs shrink-0"
                onClick={() => generate(m.id, !!c)}
                disabled={loading}
              >
                {loading ? "分析中…" : c ? "再生成" : "AIで生成"}
              </button>
            </div>

            {errorId?.id === m.id && (
              <p className="text-xs text-rose-600 font-semibold mt-2">{errorId.msg}</p>
            )}

            {c && isOpen && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                <Block title="強み・伸ばす点" body={c.strengths} accent="text-emerald-600" />
                <Block title="課題" body={c.issues} accent="text-rose-600" />
                <Block title="店舗責任者への指導アドバイス" body={c.coaching} accent="text-sise-600" />
                {c.model && <p className="text-[10px] text-slate-400">{c.model}</p>}
              </div>
            )}
            {c && !isOpen && (
              <p className="text-xs text-slate-400 mt-2 cursor-pointer" onClick={() => setOpenId(m.id)}>
                タップして指導メモを表示
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
