import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spartacus",
    short_name: "Spartacus",
    description: "Community management, stream alerts, and event coordination for your Discord server.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0F19",
    theme_color: "#4C8DFF",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
