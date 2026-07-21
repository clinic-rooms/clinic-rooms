import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { getBaseUrl } from "@/lib/base-url";
import { Toaster } from "sonner";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  // Clinic name lives in the DB; fall back to a generic title if it's unreachable
  // (e.g. during the very first build before the schema exists).
  let clinicName = "ניהול חדרים";
  try {
    const { getClinicSettings } = await import("@/lib/schedule/config");
    clinicName = (await getClinicSettings()).clinicName;
  } catch {}
  const title = `${clinicName} — ניהול חדרים`;
  const description = `מערכת ניהול חדרי הטיפול של ${clinicName}`;
  return {
    metadataBase: new URL(getBaseUrl()),
    title,
    description,
    manifest: "/manifest.webmanifest",
    // private app — keep it out of search engines entirely
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    icons: {
      icon: [
        { url: "/favicon.png", sizes: "48x48", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon.svg", type: "image/svg+xml" },
      ],
      apple: "/apple-touch-icon.png",
    },
    // iOS home-screen install: standalone, no Safari chrome
    appleWebApp: {
      capable: true,
      title: clinicName,
      statusBarStyle: "default",
    },
    // link previews (WhatsApp, etc.)
    openGraph: {
      title,
      description,
      images: [{ url: "/og.png", width: 1200, height: 630 }],
      type: "website",
      locale: "he_IL",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
        <PwaRegister />
        <Toaster position="top-center" dir="rtl" richColors closeButton />
      </body>
    </html>
  );
}
