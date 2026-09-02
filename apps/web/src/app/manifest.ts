import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Montra — Give every dollar a job",
    short_name: "Montra",
    description: "A free, privacy-respecting zero-based budgeting app.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f8fc",
    theme_color: "#0046ad",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
