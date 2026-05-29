"use client";

import { useState, useTransition } from "react";
import { updateRolePermission } from "@/app/admin/actions";
import {
  LEVEL_LABELS,
  RESOURCE_LABELS,
  RESOURCES,
  type PermLevel,
  type Resource,
} from "@/lib/permissions";
import { ROLE_LABELS, ROLE_ORDER, type Role } from "@/lib/types";

const LEVELS: PermLevel[] = ["none", "view", "edit", "manage"];
const LEVEL_STYLE: Record<PermLevel, string> = {
  none: "bg-slate-100 text-slate-400",
  view: "bg-blue-100 text-blue-700",
  edit: "bg-amber-100 text-amber-700",
  manage: "bg-emerald-100 text-emerald-700",
};

type Matrix = Record<string, Partial<Record<Resource, PermLevel>>>;

export default function RoleMatrixEditor({
  initial,
}: {
  initial: { role: string; resource: Resource; level: PermLevel }[];
}) {
  const [matrix, setMatrix] = useState<Matrix>(() => {
    const m: Matrix = {};
    for (const r of initial) (m[r.role] ||= {})[r.resource] = r.level;
    return m;
  });
  const [pending, startTransition] = useTransition();
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cycle(role: Role, resource: Resource) {
    const cur = matrix[role]?.[resource] ?? "none";
    const next = LEVELS[(LEVELS.indexOf(cur) + 1) % LEVELS.length];
    setMatrix((m) => ({ ...m, [role]: { ...m[role], [resource]: next } }));
    setSavingCell(`${role}:${resource}`);
    setError(null);
    startTransition(async () => {
      try {
        await updateRolePermission(role, resource, next);
      } catch (e) {
        // 失敗したら元に戻す
        setMatrix((m) => ({ ...m, [role]: { ...m[role], [resource]: cur } }));
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      } finally {
        setSavingCell(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-slate-500">凡例:</span>
        {LEVELS.map((l) => (
          <span key={l} className={`px-2 py-0.5 rounded font-semibold ${LEVEL_STYLE[l]}`}>{LEVEL_LABELS[l]}</span>
        ))}
        <span className="text-slate-400">（セルをタップで切替）</span>
      </div>

      {error && <p className="text-sm text-rose-600 font-semibold">{error}</p>}

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/60 border-b border-slate-100">
              <th className="text-left py-3 px-3 font-semibold text-slate-500 text-xs sticky left-0 bg-slate-50/60">機能</th>
              {ROLE_ORDER.map((role) => (
                <th key={role} className="py-3 px-2 font-semibold text-slate-500 text-xs text-center whitespace-nowrap">
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RESOURCES.map((resource) => (
              <tr key={resource} className="border-b border-slate-50">
                <td className="py-2.5 px-3 font-semibold text-slate-700 text-xs sticky left-0 bg-white whitespace-nowrap">
                  {RESOURCE_LABELS[resource]}
                </td>
                {ROLE_ORDER.map((role) => {
                  const level = matrix[role]?.[resource] ?? "none";
                  const cellKey = `${role}:${resource}`;
                  return (
                    <td key={role} className="py-2 px-2 text-center">
                      <button
                        onClick={() => cycle(role, resource)}
                        disabled={pending && savingCell === cellKey}
                        className={`min-w-[52px] px-2 py-1 rounded-lg text-xs font-bold transition-opacity ${LEVEL_STYLE[level]} ${
                          savingCell === cellKey ? "opacity-50" : "hover:opacity-80"
                        }`}
                      >
                        {LEVEL_LABELS[level]}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-400">
        ※ ここで設定した操作レベルは即時保存され、各画面の表示/編集可否（Phase C）と、DBレベルのアクセス制御（Phase D）に反映されます。
      </p>
    </div>
  );
}
