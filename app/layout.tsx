import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "城市二手房交易知识库｜北京·深圳·广州",
  description: "检索北京、深圳、广州二手房购房资格、转让限制、贷款首付、税率税费和政策版本。",
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
