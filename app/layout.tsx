import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "全国与城市二手房交易知识库｜全国通则 + 12 城",
  description: "检索全国通则及北京、深圳、广州、上海、天津、武汉、杭州、苏州、成都、重庆、西安、南京二手房交易知识。",
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
