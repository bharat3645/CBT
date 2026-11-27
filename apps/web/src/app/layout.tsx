import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/query-provider";
import { DemoBanner } from "@/lib/demo/bootstrap";

// Plus Jakarta Sans (OFL) carries every label and paragraph, up to an 800 weight for bold UI text.
// Fraunces (OFL) sets page titles and headline figures. Geist Mono stays for code and the exam clock.
const body = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-body", display: "swap" });
const serif = Fraunces({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-serif", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "PrepDesk | CBT exam prep for institutes", template: "%s | PrepDesk" },
  description: "Computer-based tests, paper conversion and analytics for coaching institutes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${serif.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">
        <QueryProvider>{children}</QueryProvider>
        <DemoBanner />
      </body>
    </html>
  );
}
