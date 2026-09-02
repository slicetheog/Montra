import { ImageResponse } from "next/og";
import { renderIconElement } from "@/lib/app-icon";

const size = { width: 192, height: 192 };

// Deterministic output, no request-time input — cache it at build time
// like the reserved icon.tsx/apple-icon.tsx conventions already are,
// rather than regenerating on every request.
export const dynamic = "force-static";

/**
 * Not the reserved icon.tsx/apple-icon.tsx convention (those don't cover
 * the specific fixed PNG sizes a PWA install prompt wants) — a plain
 * route handler returning an ImageResponse, which next/og's own docs
 * call out as a supported use.
 */
export async function GET() {
  return new ImageResponse(renderIconElement(size.width), size);
}
