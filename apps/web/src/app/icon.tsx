import { ImageResponse } from "next/og";
import { renderIconElement } from "@/lib/app-icon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(renderIconElement(size.width), { ...size });
}
