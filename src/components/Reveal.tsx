"use client";

import type { ReactNode } from "react";

// 子要素をマウント時にふわっと出現させる薄いラッパー。
// index を渡すとスタッガー（順番に少し遅れて出現）になる。
export default function Reveal({
  children,
  index = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const delay = Math.min(index, 12) * 55;
  return (
    <Tag
      className={`animate-fade-in-up ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
