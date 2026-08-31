/**
 * The Montra logomark: three ascending bars (budgeting = growth), with the
 * tallest bar picked out in the brand's red accent — a deliberate nod to a
 * traditional bank's blue/red/white identity, without literally copying any
 * one bank's actual trademarked mark. The red bar gets a solid white "halo"
 * behind it rather than sitting directly on the blue badge: red-on-blue
 * measures under 1.5:1 contrast (two saturated hues can share a lightness),
 * so it would blur into the background without one — the halo keeps it a
 * crisp, deliberate accent instead.
 *
 * Meant to sit inside a `bg-brand` badge (see the four call sites: the
 * sidebar, the marketing header, and the login/register lockups) — the two
 * shorter bars use `--brand-foreground` so they read correctly against that
 * badge in both light mode (dark badge, white bars) and dark mode (bright
 * badge, navy bars).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <rect x="3" y="11" width="4" height="8" rx="1.5" fill="var(--brand-foreground)" />
      <rect x="10" y="7" width="4" height="12" rx="1.5" fill="var(--brand-foreground)" />
      <rect x="16" y="2" width="5.5" height="17" rx="1.75" fill="var(--brand-foreground)" />
      <rect x="16.75" y="2.75" width="4" height="15.5" rx="1.25" fill="var(--accent)" />
    </svg>
  );
}
