import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { QueryProvider } from "@/lib/query-provider";
import { DemoBanner } from "@/lib/demo/bootstrap";

// General Sans (Fontshare, free for commercial use) carries every label and heading; Geist Mono sets figures in columns.
const general = localFont({
  src: [
    { path: "./fonts/general-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/general-sans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/general-sans-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-general",
  display: "swap",
});
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "PrepDesk | CBT exam prep for institutes", template: "%s | PrepDesk" },
  description: "Computer-based tests, paper conversion and analytics for coaching institutes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${general.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">
        <QueryProvider>{children}</QueryProvider>
        <DemoBanner />
      </body>
    </html>
  );
}
