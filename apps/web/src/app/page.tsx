import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

/**
 * Public root route. `proxy.ts` sends signed-in visitors to the dashboard, so
 * this page only ever renders for anonymous visitors.
 */
export const metadata: Metadata = {
  title: "مدیریت مالی شخصی",
  description:
    "فینورا؛ ثبت و پیگیری درآمد و هزینه‌ها، مدیریت حساب‌ها و دسته‌بندی‌ها، بودجه‌بندی و گزارش‌های مالی با تقویم شمسی.",
};

export default function HomePage() {
  return <LandingPage />;
}
