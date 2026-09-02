import { LogoMark } from "@/components/brand/logo-mark";
import { cn } from "@/lib/utils";

/**
 * The brand badge: LogoMark on its bg-brand rounded square. Was
 * duplicated verbatim across the sidebar, login, register, and marketing
 * header — one component now, with a `lg` size for the homepage hero.
 */
export function Logo({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center bg-brand",
        size === "lg" ? "size-16 rounded-2xl shadow-lg shadow-brand/20" : "size-8 rounded-lg",
        className,
      )}
    >
      <LogoMark className={size === "lg" ? "size-9" : "size-4.5"} />
    </div>
  );
}
