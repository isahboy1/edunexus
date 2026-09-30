import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { getBranding, getInstitutionSettings } from "@/lib/settings";
import { brandCssVars } from "@/lib/branding";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Editorial serif for page titles and section headings. */
const sourceSerif = Source_Serif_4({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal"],
  weight: ["600", "700"],
});

/**
 * Metadata is derived from the configured institution identity so a re-branded
 * deployment (name, short name, logo) presents itself everywhere, including
 * the browser tab. getInstitutionSettings already falls back to the bundled
 * defaults when the API is unreachable.
 */
export async function generateMetadata(): Promise<Metadata> {
  const inst = await getInstitutionSettings().catch(() => null);
  const shortName = inst?.shortName ?? "EduNexus";
  const name = inst?.name ?? "EduNexus";

  return {
    title: {
      default: `${shortName} — Complete Institution Management Platform`,
      template: `%s | ${shortName}`,
    },
    description: `${name} Integrated Academic & Student Management System — admissions, applications, student records, results and payments in one platform.`,
    icons: { icon: "/api/v1/branding/logo" },
  };
}

/**
 * Applied before first paint so the portal sidebar renders in its saved
 * collapsed state — no flash of the expanded sidebar while React hydrates.
 * Mirrors the key in src/components/PortalShell.tsx ("edunexus.sidebar.collapsed").
 */
const sidebarPrefScript = `try{if(localStorage.getItem("edunexus.sidebar.collapsed")==="1")document.documentElement.setAttribute("data-sidebar","collapsed")}catch(e){}`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // White-label palette: derive the full tint/shade ramp from the admin's two
  // seed colours and override the design-system CSS variables before paint.
  const branding = await getBranding().catch(() => null);
  const brandStyle = branding ? brandCssVars(branding.primary, branding.accent) : "";

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: sidebarPrefScript }} />
        {brandStyle ? <style dangerouslySetInnerHTML={{ __html: brandStyle }} /> : null}
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
