"use client";

import { useEffect } from "react";
import type { Genre } from "@/lib/types";

// ログイン中メンバーの業態に応じて、<html> に業態テーマのクラスを付与する。
// （sise-* の CSS 変数が globals.css の .theme-esthe で切り替わる）
export default function ThemeApplier({ genre }: { genre: Genre }) {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("theme-esthe", genre === "esthe");
    return () => {
      el.classList.remove("theme-esthe");
    };
  }, [genre]);
  return null;
}
