"use client";

import { useState } from "react";

/**
 * Interactive sample calendar for the landing hero.
 *
 * Each day is a button: selecting one shows that day's sample transactions
 * below the grid. Shading and the summary are *derived* from the sample data,
 * so the numbers can never disagree with each other. All data is illustrative
 * and labelled as such in the UI.
 */

interface Tx {
  title: string;
  category: string;
  amount: number;
  income?: boolean;
}

/** Sample transactions for Mehr 1405, keyed by day of month. */
const TX: Record<number, Tx[]> = {
  1: [
    { title: "حقوق", category: "درآمد", amount: 45_000_000, income: true },
    { title: "نان و لبنیات", category: "خوراک", amount: 180_000 },
  ],
  2: [{ title: "تاکسی", category: "رفت‌وآمد", amount: 120_000 }],
  3: [{ title: "اجاره", category: "مسکن", amount: 18_000_000 }],
  5: [{ title: "میوه و سبزی", category: "خوراک", amount: 420_000 }],
  7: [{ title: "خرید هفتگی", category: "خوراک", amount: 2_850_000 }],
  8: [{ title: "کافه", category: "سرگرمی", amount: 240_000 }],
  10: [{ title: "اینترنت", category: "قبوض", amount: 690_000 }],
  12: [
    { title: "داروخانه", category: "سلامت", amount: 350_000 },
    { title: "بنزین", category: "رفت‌وآمد", amount: 1_000_000 },
  ],
  15: [{ title: "خرید پوشاک", category: "پوشاک", amount: 3_200_000 }],
  17: [{ title: "اشتراک موسیقی", category: "سرگرمی", amount: 95_000 }],
  19: [{ title: "رستوران", category: "سرگرمی", amount: 780_000 }],
  22: [{ title: "لوازم منزل", category: "مسکن", amount: 2_100_000 }],
  24: [{ title: "تاکسی", category: "رفت‌وآمد", amount: 310_000 }],
  26: [{ title: "قبض برق", category: "قبوض", amount: 560_000 }],
  29: [{ title: "نان و لبنیات", category: "خوراک", amount: 450_000 }],
};

const MONTH_NAME = "مهر";
const DAYS_IN_MONTH = 30;
/** ۱ مهر ۱۴۰۵ is a Wednesday → 4 empty cells in a Saturday-first grid. */
const MONTH_OFFSET = 4;
const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

const fa = (n: number) => n.toLocaleString("fa-IR");

function expenseOf(day: number) {
  return (TX[day] ?? [])
    .filter((t) => !t.income)
    .reduce((sum, t) => sum + t.amount, 0);
}

function levelOf(expense: number) {
  if (expense === 0) return 0;
  if (expense < 500_000) return 1;
  if (expense < 1_500_000) return 2;
  if (expense < 5_000_000) return 3;
  return 4;
}

const LEVEL_CLASS = [
  "bg-surface-muted text-muted-foreground hover:bg-border",
  "bg-primary/15 text-foreground hover:bg-primary/25",
  "bg-primary/35 text-foreground hover:bg-primary/45",
  "bg-primary/65 text-primary-foreground hover:bg-primary/75",
  "bg-primary text-primary-foreground hover:bg-primary-hover",
];

const ALL = Object.values(TX).flat();
const TOTAL_INCOME = ALL.filter((t) => t.income).reduce((s, t) => s + t.amount, 0);
const TOTAL_EXPENSE = ALL.filter((t) => !t.income).reduce((s, t) => s + t.amount, 0);

const SUMMARY = [
  {
    label: "درآمد",
    value: fa(TOTAL_INCOME),
    tone: "text-success",
  },
  {
    label: "هزینه",
    value: fa(TOTAL_EXPENSE),
    tone: "text-danger",
  },
  { label: "خالص", value: fa(TOTAL_INCOME - TOTAL_EXPENSE), tone: "text-foreground" },
];

export function MonthCalendar() {
  const [selected, setSelected] = useState(1);
  const selectedTx = TX[selected] ?? [];

  const cells: (number | null)[] = [
    ...Array.from({ length: MONTH_OFFSET }, () => null),
    ...Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1),
  ];

  return (
    <figure className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      {/* One entrance moment: cells fade in on a diagonal, once. */}
      <style>{`
        @keyframes finora-cell-in { from { opacity: 0; transform: scale(.85) } to { opacity: 1; transform: scale(1) } }
        .finora-cell { animation: finora-cell-in .45s cubic-bezier(.2,.7,.2,1) both }
        @media (prefers-reduced-motion: reduce) { .finora-cell { animation: none } }
      `}</style>

      <figcaption className="flex items-baseline justify-between">
        <span className="text-base font-bold text-foreground">
          {MONTH_NAME} ۱۴۰۵
        </span>
        <span className="text-xs text-muted-foreground">
          نمونه نمایشی · روی یک روز بزنید
        </span>
      </figcaption>

      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
        {WEEKDAYS.map((d) => (
          <span
            key={d}
            aria-hidden="true"
            className="pb-1 text-xs text-muted-foreground"
          >
            {d}
          </span>
        ))}

        {cells.map((day, i) => {
          if (day === null) return <span key={`empty-${i}`} aria-hidden="true" />;

          const expense = expenseOf(day);
          const hasIncome = (TX[day] ?? []).some((t) => t.income);
          const isSelected = day === selected;
          const label = `${fa(day)} ${MONTH_NAME}${
            hasIncome ? "، دریافت درآمد" : ""
          }${expense ? `، هزینه ${fa(expense)}` : "، بدون هزینه"}`;

          return (
            <button
              key={day}
              type="button"
              aria-pressed={isSelected}
              aria-label={label}
              onClick={() => setSelected(day)}
              className={`finora-cell relative flex aspect-square items-center justify-center rounded-md text-xs font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                LEVEL_CLASS[levelOf(expense)]
              } ${
                isSelected
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface"
                  : ""
              }`}
              style={{ animationDelay: `${i * 14}ms` }}
            >
              {fa(day)}
              {hasIncome && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 size-1.5 rounded-full bg-success"
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        aria-hidden="true"
        className="mt-4 flex items-center justify-between text-xs text-muted-foreground"
      >
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-success" />
          روز دریافت درآمد
        </span>
        <span className="flex items-center gap-1">
          کم
          {LEVEL_CLASS.slice(1).map((c, i) => (
            <span key={i} className={`size-3 rounded-sm ${c.split(" ")[0]}`} />
          ))}
          زیاد
        </span>
      </div>

      <div
        aria-live="polite"
        className="mt-4 min-h-26 rounded-lg bg-surface-muted p-3"
      >
        <p className="text-xs font-semibold text-muted-foreground">
          {fa(selected)} {MONTH_NAME}
        </p>
        {selectedTx.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2">
            {selectedTx.map((tx) => (
              <li
                key={tx.title}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-foreground">
                  {tx.title}
                  <span className="ms-2 text-xs text-muted-foreground">
                    {tx.category}
                  </span>
                </span>
                <span
                  dir="ltr"
                  className={`font-semibold tabular-nums ${
                    tx.income
                      ? "text-success"
                      : "text-danger"
                  }`}
                >
                  {tx.income ? "+" : "−"}
                  {fa(tx.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            در این روز تراکنشی ثبت نشده است.
          </p>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-3 divide-x divide-x-reverse divide-border border-t border-border pt-4">
        {SUMMARY.map((item) => (
          <div
            key={item.label}
            className="flex flex-col gap-1 px-3 first:ps-0 last:pe-0"
          >
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className={`text-sm font-bold tabular-nums sm:text-base ${item.tone}`}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}