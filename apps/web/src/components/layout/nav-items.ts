import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, PiggyBank, Landmark, Target, CreditCard, BarChart3, TrendingUp, Waves, Settings } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the compact 5-slot mobile bottom nav. */
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/budget", label: "Budget", icon: PiggyBank, mobile: true },
  { href: "/accounts", label: "Accounts", icon: Landmark, mobile: true },
  { href: "/goals", label: "Goals", icon: Target, mobile: true },
  { href: "/debt", label: "Debt", icon: CreditCard },
  { href: "/cash-flow", label: "Cash Flow", icon: Waves },
  { href: "/reports", label: "Reports", icon: BarChart3, mobile: true },
  { href: "/net-worth", label: "Net Worth", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
];
