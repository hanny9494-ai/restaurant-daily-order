import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ensue 餐厅下单系统",
  description: "ensue 餐厅下单系统"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="app-header">ensue 餐厅下单系统</header>
        {children}
      </body>
    </html>
  );
}
