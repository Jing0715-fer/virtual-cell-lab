import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { LangProvider, type Lang } from "@/lib/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VirtualCell Lab · 虚拟细胞实验室 — 分子级信号转导演示平台",
  description:
    "基于 KEGG 通路数据库的虚拟细胞模拟平台：7 种细胞类型、13 条信号转导通路、分子级动力学演示（精确到磷酸化残基），内置 AI 分子生物学助手。",
  keywords: [
    "虚拟细胞", "信号转导", "KEGG", "MAPK", "PI3K-Akt", "系统生物学", "分子生物学",
    "cell signaling", "pathway simulation", "virtual cell",
  ],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "VirtualCell Lab · 虚拟细胞实验室",
    description: "KEGG 通路驱动的分子级细胞信号转导演示",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 服务端读 cookie 决定初始语言 → SSR HTML 与客户端首帧一致（无水合错配、无闪烁）
  let initialLang: Lang = "zh";
  try {
    const saved = (await cookies()).get("vcl-lang")?.value;
    if (saved === "en" || saved === "zh") initialLang = saved;
  } catch {
    /* cookie 不可用时回退中文 */
  }
  return (
    <html lang={initialLang === "en" ? "en" : "zh-CN"} className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <LangProvider initialLang={initialLang}>
          {children}
          <Toaster />
        </LangProvider>
      </body>
    </html>
  );
}
