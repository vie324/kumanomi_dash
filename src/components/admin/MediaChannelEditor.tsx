"use client";

import { useState, useTransition } from "react";
import {
  addMediaChannel,
  deleteMediaChannel,
  updateMediaChannel,
} from "@/app/admin/actions";
import type { MediaChannel } from "@/lib/types";

export default function MediaChannelEditor({
  storeId,
  initial,
}: {
  storeId: string;
  initial: MediaChannel[];
}) {
  const [channels, setChannels] = useState<MediaChannel[]>(initial);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      try {
        await addMediaChannel({ storeId, name });
        // 楽観的に追加（再取得は revalidate に任せるが即時反映）
        setChannels((prev) => [
          ...prev,
          {
            id: `tmp_${Date.now()}`,
            store_id: storeId,
            genre: null,
            name,
            sort_order: (prev.at(-1)?.sort_order ?? 0) + 1,
            active: true,
            unit_price: false,
            created_at: new Date().toISOString(),
          },
        ]);
        setNewName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "追加に失敗しました");
      }
    });
  }

  function handleToggle(c: MediaChannel) {
    setError(null);
    startTransition(async () => {
      try {
        await updateMediaChannel({ id: c.id, active: !c.active });
        setChannels((prev) => prev.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "更新に失敗しました");
      }
    });
  }

  function handleRename(c: MediaChannel, name: string) {
    setChannels((prev) => prev.map((x) => (x.id === c.id ? { ...x, name } : x)));
  }

  function handleRenameCommit(c: MediaChannel, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initial.find((i) => i.id === c.id)?.name) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateMediaChannel({ id: c.id, name: trimmed });
      } catch (e) {
        setError(e instanceof Error ? e.message : "更新に失敗しました");
      }
    });
  }

  function handleDelete(c: MediaChannel) {
    if (!confirm(`媒体「${c.name}」を削除しますか？\n（過去の日報に記録済みの媒体名はそのまま残ります）`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteMediaChannel(c.id);
        setChannels((prev) => prev.filter((x) => x.id !== c.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "削除に失敗しました");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* 追加 */}
      <div className="glass-card p-4">
        <p className="text-sm font-bold text-slate-800 mb-2">媒体を追加</p>
        <div className="flex gap-2">
          <input
            className="field-input flex-1"
            placeholder="例: TikTok広告"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <button className="btn-primary !py-2" onClick={handleAdd} disabled={pending || !newName.trim()}>
            追加
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-600 font-semibold">{error}</p>}

      {/* 一覧 */}
      <div className="glass-card divide-y divide-slate-100">
        {channels.map((c) => (
          <div key={c.id} className="flex items-center gap-2 p-3">
            <span className="text-[10px] font-bold text-slate-400 w-10 shrink-0">
              {c.genre === "esthe" ? "エステ" : c.genre === "seitai" ? "整体" : "共通"}
            </span>
            <input
              className={`field-input !py-1.5 flex-1 ${c.active ? "" : "text-slate-400 line-through"}`}
              value={c.name}
              onChange={(e) => handleRename(c, e.target.value)}
              onBlur={(e) => handleRenameCommit(c, e.target.value)}
              disabled={pending}
            />
            {c.unit_price && (
              <span className="text-[10px] font-bold text-sise-600 shrink-0" title="日報で単価を入力する媒体">単価</span>
            )}
            <button
              className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold ${
                c.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
              }`}
              onClick={() => handleToggle(c)}
              disabled={pending}
            >
              {c.active ? "有効" : "無効"}
            </button>
            <button
              className="text-xs text-slate-300 hover:text-rose-500 px-1.5"
              onClick={() => handleDelete(c)}
              disabled={pending}
            >
              削除
            </button>
          </div>
        ))}
        {channels.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">媒体がまだありません。上から追加してください。</div>
        )}
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        ※ 「無効」にすると日報の選択肢から外れますが、過去の日報に記録済みの媒体名はそのまま保持されます。
      </p>
    </div>
  );
}
