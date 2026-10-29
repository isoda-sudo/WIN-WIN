"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "~/lib/utils";
import { isNavGroup, type NavGroup, visibleNavItems } from "./nav-config";

export function SidebarNav({ role }: { role: string }) {
  const pathname = usePathname();
  const items = visibleNavItems(role);
  const isActive = (href: string, exact = false) =>
    pathname === href || (!exact && pathname?.startsWith(`${href}/`));

  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {items.map((item) => {
        if (isNavGroup(item)) {
          return (
            <MasterNavGroup group={item} isActive={isActive} key={item.label} />
          );
        }

        const active = isActive(item.href, item.exact);
        const Icon = item.icon;
        return (
          <Link
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 font-medium text-sm transition-colors",
              item.nested && "ms-4 py-1.5",
              active
                ? "bg-secondary/15 text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            href={item.href}
            key={item.href}
            prefetch={false}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function MasterNavGroup({
  group,
  isActive,
}: {
  group: NavGroup;
  isActive: (href: string) => boolean;
}) {
  const groupActive = group.children.some((c) => isActive(c.href));
  const [open, setOpen] = useState(groupActive);
  const Icon = group.icon;

  return (
    <div>
      <button
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 font-medium text-sm transition-colors",
          groupActive
            ? "bg-secondary/15 text-secondary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="flex items-center gap-3">
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{group.label}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5 border-muted border-l ps-3">
          {group.children.map((c) => {
            const active = isActive(c.href);
            const ChildIcon = c.icon;
            return (
              <Link
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 font-medium text-sm transition-colors",
                  active
                    ? "bg-secondary/15 text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                href={c.href}
                key={c.href}
                prefetch={false}
              >
                <ChildIcon className="size-4 shrink-0" />
                <span className="truncate">{c.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
