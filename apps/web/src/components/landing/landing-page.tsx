import type { ReactNode } from "react";
import Link from "next/link";
import {
  BudgetIcon,
  CategoryIcon,
  ReportsIcon,
  TransactionsIcon,
  WalletIcon,
} from "@/components/icons";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { HeaderDate, MobileMenu } from "./header-extras";
import { HeroStage } from "./hero-stage";

/**
 * Public marketing landing page (server component, presentation only).
 *
 * Concept: "تقویم مالی". The hero is a self-playing demo (client component in
 * ./hero-stage): a Jalali month builds itself, then transactions fly into
 * their days while the totals and a budget ring update. Everything else is
 * quiet: hairline borders, small radii, a strict type scale.
 *
 * Calendar, chart and budget figures are illustrative samples and are labelled
 * as such. Every feature claim maps to a shipped capability.
 */

const LOGIN_HREF = "/login";
const REGISTER_HREF = "/register";

interface FeatureItem {
  icon: ReactNode;
  title: string;
  description: string;
}

interface FeatureGroup {
  heading: string;
  summary: string;
  items: FeatureItem[];
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    heading: "ثبت",
    summary: "هر ریال را همان روز بنویسید.",
    items: [
      {
        icon: <TransactionsIcon className="size-5" />,
        title: "ثبت درآمد و هزینه",
        description:
          "هر تراکنش را با مبلغ، تاریخ و حساب مرتبط ثبت کنید و بعداً ویرایش یا حذف کنید.",
      },
      {
        icon: <TransactionsIcon className="size-5" />,
        title: "جست‌وجوی تراکنش‌ها",
        description:
          "میان تراکنش‌ها جست‌وجو و فیلتر کنید و در صورت نیاز خروجی CSV بگیرید.",
      },
    ],
  },
  {
    heading: "سازمان‌دهی",
    summary: "پول‌هایتان هر کدام جای خودش را دارد.",
    items: [
      {
        icon: <WalletIcon className="size-5" />,
        title: "حساب‌های متعدد",
        description:
          "نقد، بانکی و کیف پول را جدا نگه دارید و موجودی هر حساب را بر پایه تراکنش‌ها ببینید.",
      },
      {
        icon: <CategoryIcon className="size-5" />,
        title: "دسته‌بندی‌ها",
        description:
          "درآمد و هزینه را دسته‌بندی کنید تا تفکیک هزینه‌ها معنادار و قابل پیگیری شود.",
      },
    ],
  },
  {
    heading: "تصمیم",
    summary: "پیش از آنکه دیر شود، وضعیت را ببینید.",
    items: [
      {
        icon: <BudgetIcon className="size-5" />,
        title: "بودجه‌بندی",
        description:
          "برای دسته‌بندی‌ها سقف بودجه تعیین کنید و وضعیت مصرف را پیش از عبور از سقف ببینید.",
      },
      {
        icon: <ReportsIcon className="size-5" />,
        title: "گزارش‌ها",
        description:
          "درآمد، هزینه و جریان نقدی را در بازه‌های زمانی مختلف مقایسه و مرور کنید.",
      },
    ],
  },
];

const STEPS: { title: string; description: string }[] = [
  {
    title: "حساب بسازید",
    description:
      "یک حساب نقدی، بانکی یا کیف پول با موجودی اولیه ایجاد کنید.",
  },
  {
    title: "تراکنش ثبت کنید",
    description:
      "درآمد و هزینه‌ها را با تاریخ و دسته‌بندی ثبت کنید؛ همه‌چیز خودکار جمع زده می‌شود.",
  },
  {
    title: "تصمیم بگیرید",
    description:
      "داشبورد، بودجه‌ها و گزارش‌ها تصویر روشنی از وضعیت مالی شما می‌دهند.",
  },
];

/* ---------- Illustrative report data ---------- */

const REPORT_MONTHS: { name: string; income: number; expense: number }[] = [
  { name: "فروردین", income: 72, expense: 58 },
  { name: "اردیبهشت", income: 68, expense: 74 },
  { name: "خرداد", income: 75, expense: 55 },
  { name: "تیر", income: 70, expense: 61 },
  { name: "مرداد", income: 78, expense: 82 },
  { name: "شهریور", income: 80, expense: 57 },
];

const BUDGETS: { name: string; used: number }[] = [
  { name: "خوراک", used: 62 },
  { name: "رفت‌وآمد", used: 91 },
  { name: "سرگرمی", used: 38 },
];

/* ---------- Shared styles ---------- */

const PRIMARY_CTA =
  "inline-flex h-12 items-center justify-center rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const SECONDARY_CTA =
  "inline-flex h-12 items-center justify-center rounded-lg border border-primary/40 bg-surface px-6 text-base font-medium text-primary transition-colors hover:bg-primary-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const NAV_LINK =
  "rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "#features", label: "امکانات" },
  { href: "#reports", label: "گزارش‌ها" },
  { href: "#steps", label: "شروع کار" },
];

/* ---------- Sections ---------- */

function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:right-3 focus:z-50"
    >
      پرش به محتوای اصلی
    </a>
  );
}

/**
 * Compact floating "pill" header. It sits inside the page rather than across
 * it, stays on screen while scrolling, and carries one small nod to the
 * calendar concept: today's Jalali date.
 */
function Header() {
  return (
    <header className="pointer-events-none sticky top-0 z-30 px-3 pt-3 sm:px-4">
      <div className="pointer-events-auto mx-auto flex h-12 w-full max-w-5xl items-center justify-between gap-2 rounded-full border border-border bg-surface/80 ps-5 pe-1.5 shadow-sm backdrop-blur-md">
        <Link href="/" aria-label="فینورا — صفحه اصلی" className="shrink-0">
          <Brand />
        </Link>

        <nav
          aria-label="بخش‌های صفحه"
          className="hidden items-center gap-1 md:flex"
        >
          {NAV_ITEMS.map((item) => (
            <a key={item.href} href={item.href} className={NAV_LINK}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <HeaderDate />
          <ThemeToggle />
          <Link
            href={LOGIN_HREF}
            className="hidden h-9 items-center rounded-full px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:inline-flex"
          >
            ورود
          </Link>
          <Link
            href={REGISTER_HREF}
            className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            شروع رایگان
          </Link>
          <MobileMenu items={NAV_ITEMS} loginHref={LOGIN_HREF} />
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* One orchestrated intro: headline lines rise out of a mask, then the rest follows. */}
      <style>{`
        @keyframes finora-line-in { from { transform: translateY(110%) } to { transform: none } }
        .finora-line-inner { animation: finora-line-in .95s cubic-bezier(.2,.8,.2,1) both }
        @keyframes finora-fade-in { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        .finora-fade { animation: finora-fade-in .8s cubic-bezier(.2,.8,.2,1) both }
        @media (prefers-reduced-motion: reduce) { .finora-line-inner, .finora-fade { animation: none } }
      `}</style>

      {/* Faint dot grid that fades out toward the edges */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 text-primary/25 [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_65%_at_50%_40%,#000_25%,transparent_100%)]"
      />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-16 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-28">
        <div className="flex flex-col items-start gap-7">
          <h1 className="text-4xl font-extrabold leading-[1.4] text-foreground sm:text-6xl sm:leading-[1.35] lg:text-7xl lg:leading-[1.3]">
            <span className="block overflow-hidden pb-2">
              <span
                className="finora-line-inner block"
                style={{ animationDelay: "0.1s" }}
              >
                هر روز ماه،
              </span>
            </span>
            <span className="block overflow-hidden pb-2">
              <span
                className="finora-line-inner block text-primary"
                style={{ animationDelay: "0.25s" }}
              >
                یک خط روشن از حساب‌وکتاب
              </span>
            </span>
          </h1>
          <p
            className="finora-fade max-w-lg text-base leading-8 text-muted-foreground sm:text-lg"
            style={{ animationDelay: "0.6s" }}
          >
            فینورا تراکنش‌ها، حساب‌ها، دسته‌بندی‌ها، بودجه و گزارش‌های شما را در
            یک‌جا و با تقویم شمسی کنار هم می‌گذارد.
          </p>
          <div
            className="finora-fade flex flex-col items-start gap-3"
            style={{ animationDelay: "0.75s" }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <Link href={REGISTER_HREF} className={PRIMARY_CTA}>
                شروع رایگان
              </Link>
              <Link href={LOGIN_HREF} className={SECONDARY_CTA}>
                ورود به حساب
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              ساخت حساب رایگان است و در چند ثانیه انجام می‌شود.
            </p>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <HeroStage />
        </div>
      </div>
    </section>
  );
}

function Capabilities() {
 const items = [
  "مدیریت هزینه‌ها",
  "بودجه‌بندی ماهانه",
  "گزارش‌های مالی"
];
  return (
    <section
      aria-label="ویژگی‌های کلیدی"
      className="bg-primary text-primary-foreground dark:bg-primary-subtle dark:text-foreground"
    >
      <ul className="mx-auto grid w-full max-w-6xl grid-cols-1 divide-y divide-accent/50 px-4 text-center text-sm font-medium sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:divide-x-reverse sm:px-6">
        {items.map((item) => (
          <li key={item} className="py-4">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6 sm:py-28"
    >
      <h2
        id="features-heading"
        className="max-w-2xl text-balance text-3xl font-extrabold leading-[1.5] text-foreground sm:text-4xl"
      >
        سه کار اصلی، بدون شلوغی
      </h2>

      <div className="mt-12 grid gap-12 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-x-reverse lg:divide-border">
        {FEATURE_GROUPS.map((group) => (
          <div
            key={group.heading}
            className="flex flex-col gap-6 lg:px-8 lg:first:ps-0 lg:last:pe-0"
          >
            <div>
              <h3 className="text-xl font-extrabold text-primary">
                {group.heading}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {group.summary}
              </p>
            </div>
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {group.items.map((item) => (
                <li key={item.title} className="flex gap-4 py-5">
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
                  >
                    {item.icon}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <h4 className="text-base font-semibold text-foreground">
                      {item.title}
                    </h4>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Reports() {
  return (
    <section
      id="reports"
      aria-labelledby="reports-heading"
      className="scroll-mt-24 border-y border-primary/15 bg-primary-subtle"
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
        <div className="flex flex-col gap-4">
          <h2
            id="reports-heading"
            className="text-balance text-3xl font-extrabold leading-[1.5] text-foreground sm:text-4xl"
          >
            ماه‌ها را کنار هم بگذارید
          </h2>
          <p className="max-w-md text-base leading-8 text-muted-foreground">
            درآمد و هزینه را در بازه‌های مختلف مقایسه کنید و برای هر دسته یک
            سقف بگذارید تا پیش از عبور از آن خبردار شوید.
          </p>
        </div>

        <div
          role="img"
          aria-label="نمونه نمایشی نمودار مقایسه درآمد و هزینه شش ماه و نوارهای مصرف بودجه"
          className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6"
        >
          <div aria-hidden="true">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-primary" />
                  درآمد
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-border-strong" />
                  هزینه
                </span>
              </span>
              <span>نمونه نمایشی</span>
            </div>

            <div className="relative mt-5 h-44 border-b border-border">
              {/* Horizontal gridlines */}
              {[25, 50, 75].map((p) => (
                <span
                  key={p}
                  className="absolute inset-x-0 border-t border-dashed border-border/70"
                  style={{ bottom: `${p}%` }}
                />
              ))}
              <div className="relative grid h-full grid-cols-6 items-end gap-3">
                {REPORT_MONTHS.map((m) => (
                  <div
                    key={m.name}
                    className="flex h-full items-end justify-center gap-1"
                  >
                    <span
                      className="w-full max-w-4 rounded-t-sm bg-primary"
                      style={{ height: `${m.income}%` }}
                    />
                    <span
                      className="w-full max-w-4 rounded-t-sm bg-border-strong"
                      style={{ height: `${m.expense}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-6 gap-3 text-center text-[11px] text-muted-foreground">
              {REPORT_MONTHS.map((m) => (
                <span key={m.name}>{m.name}</span>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5">
              {BUDGETS.map((b) => {
                const near = b.used > 85;
                return (
                  <div key={b.name} className="flex items-center gap-3 text-sm">
                    <span className="w-16 shrink-0 text-foreground">
                      {b.name}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                      <span
                        className={`block h-full rounded-full ${
                          near ? "bg-danger" : "bg-primary"
                        }`}
                        style={{ width: `${b.used}%` }}
                      />
                    </span>
                    <span
                      className={`w-24 text-end text-xs tabular-nums ${
                        near
                          ? "font-semibold text-danger"
                          : "text-muted-foreground"
                      }`}
                    >
                      {b.used.toLocaleString("fa-IR")}٪
                      {near ? " · نزدیک سقف" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section
      id="steps"
      aria-labelledby="steps-heading"
      className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6 sm:py-28"
    >
      <h2
        id="steps-heading"
        className="text-3xl font-extrabold text-foreground sm:text-4xl"
      >
        در سه گام شروع کنید
      </h2>
      <ol className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-x-reverse sm:divide-border">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col gap-3 sm:px-8 sm:first:ps-0 sm:last:pe-0"
          >
            <span
              aria-hidden="true"
              className="text-6xl font-black leading-none text-primary"
            >
              {(index + 1).toLocaleString("fa-IR")}
            </span>
            <span aria-hidden="true" className="h-0.5 w-10 bg-accent" />
            <h3 className="text-lg font-bold text-foreground">{step.title}</h3>
            <p className="max-w-xs text-sm leading-7 text-muted-foreground sm:text-base">
              {step.description}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 sm:pb-28">
      <div className="flex flex-col items-start gap-6 rounded-2xl bg-primary px-6 py-12 text-primary-foreground dark:bg-primary-subtle dark:text-foreground sm:px-12 sm:py-16">
        <span aria-hidden="true" className="h-1 w-16 rounded-full bg-accent" />
        <h2 className="max-w-2xl text-balance text-3xl font-extrabold leading-[1.5] sm:text-4xl">
          ماه بعد را با حساب روشن شروع کنید
        </h2>
        <p className="max-w-xl text-base leading-8 opacity-80">
          ساخت حساب رایگان است و در چند ثانیه انجام می‌شود.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={REGISTER_HREF}
            className="inline-flex h-12 items-center justify-center rounded-lg bg-primary-foreground px-6 text-base font-semibold text-primary transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:bg-primary dark:text-primary-foreground"
          >
            شروع رایگان
          </Link>
          <Link
            href={LOGIN_HREF}
            className="inline-flex h-12 items-center justify-center rounded-lg border border-primary-foreground/30 px-6 text-base font-medium transition-colors hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-border dark:hover:bg-surface-muted"
          >
            ورود به حساب
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <Brand />
        <p>فینورا — مدیریت مالی شخصی</p>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SkipLink />
      <Header />
      <main id="main-content" className="flex-1">
        <Hero />
        <Capabilities />
        <Features />
        <Reports />
        <HowItWorks />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  );
}