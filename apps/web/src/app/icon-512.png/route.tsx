import { ImageResponse } from "next/og";
import { renderIconElement } from "@/lib/app-icon";

const size = { width: 512, height: 512 };

// See icon-192.png/route.tsx's comment.
export const dynamic = "force-static";

/** See icon-192.png/route.tsx's comment — same reasoning, larger size for the manifest's maskable/high-res slot. */
export async function GET() {
  return new ImageResponse(renderIconElement(size.width), size);
}
