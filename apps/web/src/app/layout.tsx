import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { DEFAULT_THEME, themeInitScript } from "@/lib/theme";
import "./globals.css";

const pinar = localFont({
  src: [
    {
      path: "../../public/font/PINAR-DS3-REGULAR.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/font/PINAR-MEDIUM.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/font/PINAR-BOLD.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../public/font/PINAR-DS3-EXTRABOLD2.ttf",
      weight: "800",
      style: "normal",
    },
  ],
  variable: "--font-pinar",
});

export const metadata: Metadata = {
  title: {
    default: "فینورا — مدیریت مالی شخصی",
    template: "%s | فینورا",
  },
  description:
    "فینورا، دستیار مدیریت مالی شخصی برای ثبت و پیگیری درآمد و هزینه‌ها.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="fa"
      dir="rtl"
      data-theme={DEFAULT_THEME}
      className={pinar.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
