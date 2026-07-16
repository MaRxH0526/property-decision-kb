import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "房产决策知识库｜交易政策 + 教育政策",
  description: "检索全国与12城二手房交易政策，以及31城义务教育入学政策、公办学校和证据覆盖。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
