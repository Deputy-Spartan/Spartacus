import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spartacus",
  description: "Community management, stream alerts, and event coordination for your Discord server.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
