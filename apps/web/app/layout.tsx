import type { Metadata, Viewport } from "next";
import "./globals.css";
import { EARLY_THEME_SCRIPT } from "../lib/themeScript";

export const metadata: Metadata = {
  title: "Spartacus",
  description: "Community management, stream alerts, and event coordination for your Discord server.",
};

// The CSS `color-scheme: dark` rule in globals.css isn't always enough on
// its own — some browsers (notably Chrome on Windows) only reliably paint
// native widgets like an open <select> dropdown's popup list in dark mode
// when this is also declared via a <meta name="color-scheme"> tag, which
// this `viewport` export renders into <head>.
export const viewport: Viewport = {
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="studio" suppressHydrationWarning>
      <head>
        {/* Paints the saved theme before anything shows, so it never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: EARLY_THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
