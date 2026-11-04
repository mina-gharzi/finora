import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface OnboardingChecklistProps {
  hasAccounts: boolean;
  hasTransactions: boolean;
  hasBudgets: boolean;
}

interface ChecklistStep {
  title: string;
  href: string;
  done: boolean;
}

/**
 * First-run checklist shown on the dashboard. Every step links to the place
 * where it can be completed, and done steps stay visible as confirmation until
 * all three are done — at which point the card disappears entirely.
 */
export function OnboardingChecklist({
  hasAccounts,
  hasTransactions,
  hasBudgets,
}: OnboardingChecklistProps) {
  const steps: ChecklistStep[] = [
    { title: "ساخت اولین حساب", href: "/accounts", done: hasAccounts },
    {
      title: "ثبت اولین تراکنش",
      href: "/transactions/new",
      done: hasTransactions,
    },
    { title: "تعیین اولین بودجه", href: "/budgets", done: hasBudgets },
  ];

  if (steps.every((step) => step.done)) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>شروع سریع</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {steps.map((step) => (
            <li
              key={step.href}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <Link
                href={step.href}
                className="text-sm font-medium text-foreground hover:text-primary hover:underline"
              >
                {step.title}
              </Link>
              <Badge variant={step.done ? "success" : "neutral"}>
                {step.done ? "انجام شد" : "در انتظار"}
              </Badge>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
