import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "扇会衆 奉仕予定表",
  description: "会衆メンバーの奉仕予定（時間・場所・司会者）を同期・確認できるアプリ",
  themeColor: "#0EA5E9",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0", // Prevents zooming for elderly on iOS
  appleWebApp: {
    title: "奉仕予定",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <main className="container flex flex-col gap-6 animate-fade-in">
          {children}
        </main>
      </body>
    </html>
  );
}
