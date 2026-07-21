import type { MetadataRoute } from "next";
import { getClinicSettings } from "@/lib/schedule/config";

// must be served per-request — the clinic name lives in the DB
export const dynamic = "force-dynamic";

// Served at /manifest.webmanifest — the clinic name comes from the DB so the
// installed PWA carries each clinic's own branding.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let clinicName = "ניהול חדרים";
  try {
    clinicName = (await getClinicSettings()).clinicName;
  } catch {}
  return {
    name: `${clinicName} — ניהול חדרים`,
    short_name: clinicName,
    description: `מערכת ניהול חדרי הטיפול של ${clinicName}`,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    dir: "rtl",
    lang: "he",
    background_color: "#faf9f7",
    theme_color: "#0d9488",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
