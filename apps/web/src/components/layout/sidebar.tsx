import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { NavItem } from "@/components/ui/nav-item";
import { Brand } from "./brand";
import { COMING_SOON_LABEL, isNavEntryActive, navGroups, type NavEntry } from "./nav-config";

function NavSection({
  title,
  items,
  activePath,
}: {
  title: string;
  items: NavEntry[];
  activePath?: string;
}) {
  return (
    <div>
      <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">
        {title}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <NavItem
            key={item.key}
            label={item.label}
            icon={item.icon}
            href={item.href}
            disabled={item.disabled}
            active={isNavEntryActive(item, activePath)}
            badge={
              item.disabled ? (
                <Badge variant="neutral">{COMING_SOON_LABEL}</Badge>
              ) : undefined
            }
          />
        ))}
      </ul>
    </div>
  );
}

export interface SidebarProps {
  activePath?: string;
  className?: string;
}

export function Sidebar({ activePath, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        "hidden w-64 shrink-0 flex-col border-e border-border bg-surface lg:flex",
        className,
      )}
    >
      <div className="flex h-16 items-center border-b border-border px-5">
        <Brand />
      </div>
      <nav
        aria-label="ناوبری اصلی"
        className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4"
      >
        {navGroups.map((group) => (
          <NavSection
            key={group.title}
            title={group.title}
            items={group.items}
            activePath={activePath}
          />
        ))}
      </nav>
      <div className="border-t border-border px-5 py-4">
        <p className="text-xs text-muted-foreground">نسخه 0.1.0</p>
      </div>
    </aside>
  );
}
