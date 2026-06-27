// CSV 生成・ダウンロード（Excel/日本語対応のため UTF-8 BOM を付与）。

function escapeCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  // ダブルクオート・カンマ・改行を含む場合はクオートで囲む
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  // Excel で文字化けしないよう UTF-8 BOM を先頭に付ける
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
