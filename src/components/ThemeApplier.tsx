"use client";

import { useEffect } from "react";
import type { Genre } from "@/lib/types";

// ログイン中メンバーの業態に応じて、<html> に業態テーマのクラスを付与する。
// （sise-* の CSS 変数が globals.css の .theme-esthe で切り替わる）
export default function ThemeApplier({ genre }: { genre: Genre }) {
  useEffect(() => {
    // ページ遷移のたびにクラスを剥がすとテーマがちらつくため、unmount では削除しない。
    // 業態はユーザー単位で一定なので、設定するだけでよい。
    document.documentElement.classList.toggle("theme-esthe", genre === "esthe");
  }, [genre]);
  return null;
}
