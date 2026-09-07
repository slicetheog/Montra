"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, ChevronDown, HelpCircle } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationBell } from "@/components/layout/notification-bell";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useMe } from "@/hooks/use-me";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { budget, budgets, setBudgetId } = useCurrentBudget();
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function logout() {
    await api.post("/api/auth/logout");
    queryClient.clear();
    router.push("/login");
  }

  const mobileItems = NAV_ITEMS.filter((item) => item.mobile);

  return (
    // Every InfoTooltip in the app (see components/ui/info-tooltip.tsx)
    // relies on this one Provider — it has to wrap the whole shell, not
    // each page individually, since every authenticated page renders
    // inside AppShell (see app/(app)/layout.tsx).
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen flex-col md:flex-row">
        {/* Desktop / tablet sidebar */}
        <aside className="hidden shrink-0 flex-col border-r border-border bg-surface md:flex md:w-16 lg:w-64">
          <div className="flex h-16 items-center gap-2 px-4 lg:px-5">
            <Logo />
            <span className="hidden text-lg font-semibold lg:inline">Montra</span>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-2 py-2" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                  className={cn(
                    // A steady 3px left border in both states (only its color
                    // changes) avoids a content shift when a link becomes
                    // active — the red accent stripe pairs with the existing
                    // blue tint so the active item reads as blue *and* red,
                    // not blue alone.
                    "flex items-center gap-3 rounded-md border-l-[3px] py-2.5 pr-3 pl-[9px] text-sm font-medium transition-colors",
                    "lg:justify-start justify-center",
                    active
                      ? "border-accent bg-brand-tint text-brand-strong"
                      : "border-transparent text-foreground-muted hover:bg-surface-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-border p-3">
            <button
              onClick={logout}
              className="flex w-full items-center justify-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground lg:justify-start"
            >
              <LogOut className="size-5" />
              <span className="hidden lg:inline">Log out</span>
            </button>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur">
            <div className="flex items-center gap-2 md:hidden">
              <button
                onClick={() => setDrawerOpen(true)}
                className="rounded-md p-2 text-foreground-muted hover:bg-surface-muted"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </button>
            </div>

            {budgets.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  {budget?.name ?? "Choose a budget"}
                  <ChevronDown className="size-4 text-foreground-muted" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Your budgets</DropdownMenuLabel>
                  {budgets.map((b) => (
                    <DropdownMenuItem key={b.id} onSelect={() => setBudgetId(b.id)}>
                      {b.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings?tab=budgets">Manage budgets</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-3">
              <Link
                href="/help"
                aria-current={pathname === "/help" ? "page" : undefined}
                aria-label="Help center"
                title="Help center"
                className={cn(
                  "rounded-md p-2 text-foreground-muted hover:bg-surface-muted hover:text-foreground",
                  pathname === "/help" && "bg-brand-tint text-brand-strong",
                )}
              >
                <HelpCircle className="size-5" />
              </Link>
              <NotificationBell />
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-full bg-brand-tint text-sm font-semibold text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  {me?.user?.name?.[0]?.toUpperCase() ?? "?"}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{me?.user?.name}</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link href="/settings">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/help">Help center</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={logout} className="text-negative">
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/*
            No shell-wide ad banner here on purpose: ads only appear on
            specific low-distraction screens (Dashboard, Reports, Settings)
            via their own <AdBanner>, per spec — the primary budgeting
            screens (Budget, Accounts, transaction entry) stay ad-free so
            the core workflow never competes for attention with a banner.
          */}
          <main id="main-content" className="flex-1 pb-20 md:pb-0">
            {children}
          </main>
        </div>

        {/* Mobile bottom nav */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface md:hidden"
          aria-label="Main navigation"
        >
          {mobileItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
                  active ? "text-brand" : "text-foreground-muted",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile drawer for full nav */}
        <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DialogContent className="left-0 top-0 h-full max-h-full w-64 translate-x-0 translate-y-0 rounded-none border-r border-l-0 border-t-0 border-b-0">
            <VisuallyHidden>
              <DialogTitle>Navigation</DialogTitle>
            </VisuallyHidden>
            <nav className="flex flex-col gap-1" aria-label="Main navigation">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-surface-muted"
                  >
                    <Icon className="size-5" />
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/help"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-surface-muted"
              >
                <HelpCircle className="size-5" />
                Help center
              </Link>
            </nav>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
