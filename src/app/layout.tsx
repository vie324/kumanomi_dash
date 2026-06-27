import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const noto = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-noto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "くまのみ整体院 - 経営ダッシュボード",
  description: "成増店トライアル / 日報・成績追跡・AIフィードバック",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={noto.variable}>
      {/* モバイル下部ナビ分の余白（md以上では不要） */}
      <body className="min-h-screen font-sans pb-20 md:pb-0">{children}</body>
    </html>
  );
}
