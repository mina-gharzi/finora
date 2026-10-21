"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Animated hero "stage": a self-playing product demo.
 *
 * A Jalali month grid builds itself (cells drop in once), then sample
 * transactions are "entered" one by one. Each one appears in a composer chip,
 * flies into its day (Web Animations API, measured from real layout), the day
 * lights up with a ripple, and the totals and budget ring tween to their new
 * values. After the last entry the month holds for a moment, resets, and
 * plays again.
 *
 * - Everything shown is derived from the single EVENTS list, so the grid, the
 *   totals and the ring can never disagree.
 * - Under prefers-reduced-motion the loop never starts and the finished month
 *   is shown statically.
 * - The pointer-driven tilt only reacts to a mouse, and only when motion is OK.
 * - The whole stage is exposed to assistive tech as one labelled image; its
 *   moving parts are presentational.
 * - All data is illustrative and labelled "نمونه نمایشی".
 */

interface Ev {
  day: number;
  title: string;
  category: string;
  amount: number;
  income?: boolean;
}

const EVENTS: Ev[] = [
  { day: 1, title: "حقوق", category: "درآمد", amount: 45_000_000, income: true },
  { day: 3, title: "اجاره", category: "مسکن", amount: 18_000_000 },
  { day: 7, title: "خرید هفتگی", category: "خوراک", amount: 2_850_000 },
  { day: 10, title: "اینترنت", category: "قبوض", amount: 690_000 },
  { day: 15, title: "خرید پوشاک", category: "پوشاک", amount: 3_200_000 },
  { day: 19, title: "رستوران", category: "سرگرمی", amount: 780_000 },
  { day: 22, title: "لوازم منزل", category: "مسکن", amount: 2_100_000 },
  { day: 26, title: "قبض برق", category: "قبوض", amount: 560_000 },
];

const MONTH_NAME = "مهر";
const DAYS_IN_MONTH = 30;
/** ۱ مهر ۱۴۰۵ is a Wednesday → 4 empty cells in a Saturday-first grid. */
const MONTH_OFFSET = 4;
const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const BUDGET_CAP = 32_000_000;

const LEVEL_CLASS = [
  "bg-surface-muted text-muted-foreground",
  "bg-primary/15 text-foreground",
  "bg-primary/35 text-foreground",
  "bg-primary/65 text-primary-foreground",
  "bg-primary text-primary-foreground",
];

const fa = (n: number) => n.toLocaleString("fa-IR");

function levelOf(expense: number) {
  if (expense === 0) return 0;
  if (expense < 500_000) return 1;
  if (expense < 1_500_000) return 2;
  if (expense < 5_000_000) return 3;
  return 4;
}

const subscribeMotion = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getReduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Eases a number toward its target (used for the counters). */
function useTween(target: number, ms: number) {
  const [value, setValue] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = ms <= 0 ? 1 : Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      current.current = from + (target - from) * eased;
      setValue(current.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return Math.round(value);
}

export function HeroStage() {
  const reduced = useSyncExternalStore(subscribeMotion, getReduced, () => false);

  const [applied, setApplied] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [pulse, setPulse] = useState<{ day: number; n: number } | null>(null);

  const cellRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const chipRef = useRef<HTMLDivElement>(null);

  /* The autoplay loop: enter → fly → light up → hold → reset → repeat. */
  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    const fly = async (ev: Ev) => {
      const chip = chipRef.current;
      const cell = cellRefs.current[ev.day];
      if (!chip || !cell) return;
      const a = chip.getBoundingClientRect();
      const b = cell.getBoundingClientRect();
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const anim = chip.animate(
        [
          { transform: "translate(0,0) scale(1)", opacity: 1 },
          {
            transform: `translate(${dx * 0.55}px, ${dy * 0.3 - 18}px) scale(.8)`,
            opacity: 1,
            offset: 0.55,
          },
          { transform: `translate(${dx}px, ${dy}px) scale(.15)`, opacity: 0 },
        ],
        { duration: 700, easing: "cubic-bezier(.55,0,.25,1)", fill: "forwards" },
      );
      await anim.finished.catch(() => {});
    };

    (async () => {
      let n = 0;
      await wait(2300); // let the intro finish first
      while (!cancelled) {
        for (let i = 0; i < EVENTS.length; i++) {
          setActive(i);
          await wait(850);
          if (cancelled) return;
          await fly(EVENTS[i]);
          if (cancelled) return;
          setActive(null);
          setApplied(i + 1);
          setPulse({ day: EVENTS[i].day, n: ++n });
          await wait(520);
          if (cancelled) return;
        }
        await wait(3400);
        if (cancelled) return;
        setApplied(0);
        setPulse(null);
        await wait(1300);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reduced]);

  const shown = reduced ? EVENTS.length : applied;
  const done = EVENTS.slice(0, shown);

  const spend: Record<number, number> = {};
  const incomeDays = new Set<number>();
  let income = 0;
  let expense = 0;
  for (const e of done) {
    if (e.income) {
      income += e.amount;
      incomeDays.add(e.day);
    } else {
      expense += e.amount;
      spend[e.day] = (spend[e.day] ?? 0) + e.amount;
    }
  }

  const ms = reduced ? 0 : 800;
  const tIncome = useTween(income, ms);
  const tExpense = useTween(expense, ms);
  const tNet = useTween(income - expense, ms);
  const ratio = Math.min(1, expense / BUDGET_CAP);
  const pct = Math.round(ratio * 100);
  const tPct = useTween(pct, ms);
  const nearCap = ratio > 0.85;

  const activeEv = active === null ? null : EVENTS[active];

  const cells: (number | null)[] = [
    ...Array.from({ length: MONTH_OFFSET }, () => null),
    ...Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1),
  ];

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    e.currentTarget.style.setProperty("--rx", `${(-y * 6).toFixed(2)}deg`);
    e.currentTarget.style.setProperty("--ry", `${(x * 8).toFixed(2)}deg`);
  };
  const onLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.setProperty("--rx", "0deg");
    e.currentTarget.style.setProperty("--ry", "0deg");
  };

  return (
    <div
      role="img"
      aria-label="نمونه نمایشی: تراکنش‌های یک ماه یکی‌یکی روی تقویم شمسی ثبت می‌شوند و جمع درآمد، هزینه و مصرف بودجه به‌روز می‌شود"
      className="finora-card-in relative isolate w-full max-w-md pb-7"
    >
      <style>{`
        @keyframes finora-card-in { from { opacity: 0; transform: translateY(28px) } to { opacity: 1; transform: none } }
        .finora-card-in { animation: finora-card-in .9s cubic-bezier(.2,.8,.2,1) .35s both }
        @keyframes finora-cell-in { from { opacity: 0; transform: translateY(-18px) scale(.7) } to { opacity: 1; transform: none } }
        .finora-cell { animation: finora-cell-in .6s cubic-bezier(.2,.9,.25,1.15) both }
        @keyframes finora-chip-in { from { opacity: 0; transform: translateY(-10px) scale(.9) } to { opacity: 1; transform: none } }
        .finora-chip { animation: finora-chip-in .35s cubic-bezier(.2,.9,.3,1) both }
        @keyframes finora-ripple { from { opacity: .75; transform: scale(.6) } to { opacity: 0; transform: scale(2.3) } }
        .finora-ripple { animation: finora-ripple .85s ease-out both }
        @keyframes finora-float { from { transform: translateY(0) } to { transform: translateY(-7px) } }
        .finora-float { animation: finora-float 4.5s ease-in-out infinite alternate }
        @keyframes finora-blink { 50% { opacity: .35 } }
        .finora-live { animation: finora-blink 1.6s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) {
          .finora-card-in, .finora-cell, .finora-chip, .finora-ripple, .finora-float, .finora-live { animation: none }
        }
      `}</style>

      {/* Burgundy slab behind the card: brand presence + depth */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 bottom-7 -z-10 translate-x-3 translate-y-3 rounded-2xl bg-primary dark:bg-primary/35"
      />

      <div
        aria-hidden="true"
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="transition-transform duration-200 ease-out will-change-transform"
        style={{
          transform:
            "perspective(1000px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))",
        }}
      >
        <div className="rounded-2xl border border-accent/50 bg-surface p-5 shadow-xl sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-base font-extrabold text-primary">
              {MONTH_NAME} ۱۴۰۵
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="finora-live size-1.5 rounded-full bg-success" />
              نمونه نمایشی
            </span>
          </div>

          {/* Composer: the next transaction appears here, then flies to its day */}
          <div className="mt-4 flex h-11 items-center justify-center">
            {activeEv ? (
              <div
                key={active}
                ref={chipRef}
                className="finora-chip flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm shadow-md"
              >
                <span
                  className={`size-2 rounded-full ${
                    activeEv.income ? "bg-success" : "bg-primary"
                  }`}
                />
                <span className="font-semibold text-foreground">
                  {activeEv.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {activeEv.category}
                </span>
                <span
                  dir="ltr"
                  className={`font-bold tabular-nums ${
                    activeEv.income
                      ? "text-success"
                      : "text-danger"
                  }`}
                >
                  {activeEv.income ? "+" : "−"}
                  {fa(activeEv.amount)}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full border border-dashed border-border px-3.5 py-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-border" />
                تراکنش بعدی
              </div>
            )}
          </div>

          {/* Month grid */}
          <div className="mt-2 grid grid-cols-7 gap-1.5 text-center">
            {WEEKDAYS.map((d) => (
              <span key={d} className="pb-1 text-xs text-muted-foreground">
                {d}
              </span>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <span key={`empty-${i}`} />;
              return (
                <span
                  key={day}
                  ref={(el) => {
                    cellRefs.current[day] = el;
                  }}
                  className={`finora-cell relative flex aspect-square items-center justify-center rounded-md text-xs font-medium tabular-nums transition-colors duration-500 ${
                    LEVEL_CLASS[levelOf(spend[day] ?? 0)]
                  }`}
                  style={{ animationDelay: `${0.55 + i * 0.018}s` }}
                >
                  {fa(day)}
                  {incomeDays.has(day) && (
                    <span className="absolute top-1 right-1 size-1.5 rounded-full bg-success" />
                  )}
                  {pulse?.day === day && (
                    <span
                      key={pulse.n}
                      className="finora-ripple pointer-events-none absolute inset-0 rounded-md bg-primary"
                    />
                  )}
                </span>
              );
            })}
          </div>

          {/* Totals */}
          <dl className="mt-5 grid grid-cols-3 divide-x divide-x-reverse divide-border border-t border-border pt-4">
            {[
              {
                label: "درآمد",
                value: tIncome,
                tone: "text-success",
              },
              {
                label: "هزینه",
                value: tExpense,
                tone: "text-danger",
              },
              { label: "خالص", value: tNet, tone: "text-foreground" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex flex-col gap-1 px-3 first:ps-0 last:pe-0"
              >
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd
                  className={`text-sm font-bold tabular-nums sm:text-base ${item.tone}`}
                >
                  {fa(item.value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Floating budget ring: fills as expenses land, turns rose near the cap */}
      <div
        aria-hidden="true"
        className="finora-float absolute bottom-0 left-4 flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-2.5 shadow-lg"
      >
        <svg viewBox="0 0 40 40" className="size-10 -rotate-90">
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-surface-muted"
          />
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - pct}
            className={`transition-[stroke-dashoffset,color] duration-700 ease-out ${
              nearCap ? "text-danger" : "text-primary"
            }`}
          />
        </svg>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">مصرف بودجه ماه</span>
          <span
            className={`text-sm font-bold tabular-nums ${
              nearCap
                ? "text-danger"
                : "text-foreground"
            }`}
          >
            {fa(tPct)}٪
          </span>
        </div>
      </div>
    </div>
  );
}