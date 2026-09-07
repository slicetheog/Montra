/**
 * Shared JSX for the generated icon routes (icon.tsx, apple-icon.tsx, and
 * the manifest's 192/512 PNGs) — same three-ascending-bars mark as
 * components/brand/logo-mark.tsx, redrawn in Satori's supported CSS
 * subset (ImageResponse can't render an arbitrary SVG React component,
 * only flexbox + a handful of properties — see next/og's docs), so this
 * approximates it with plain divs rather than importing that component.
 * Colors are the light-mode brand tokens' literal values (globals.css
 * has no meaning at image-generation time, which runs outside the DOM).
 */
export function renderIconElement(px: number) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: px * 0.08,
        background: "#0046ad",
        borderRadius: px * 0.22,
      }}
    >
      <div style={{ width: px * 0.16, height: px * 0.28, background: "#ffffff", borderRadius: px * 0.03 }} />
      <div style={{ width: px * 0.16, height: px * 0.42, background: "#ffffff", borderRadius: px * 0.03 }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: px * 0.22,
          height: px * 0.6,
          background: "#ffffff",
          borderRadius: px * 0.04,
        }}
      >
        <div style={{ width: px * 0.14, height: px * 0.5, background: "#d0011b", borderRadius: px * 0.03 }} />
      </div>
    </div>
  );
}
