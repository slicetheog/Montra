import { ImageResponse } from "next/og";
import { renderIconElement } from "@/lib/app-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(renderIconElement(size.width), { ...size });
}
