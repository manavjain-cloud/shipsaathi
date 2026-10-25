import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Sora, Syne } from "next/font/google";
import { Nav, NavFallback } from "@/components/nav";
import { MotionFlag } from "@/components/motion-flag";
import { Toaster } from "@/components/toast";
import "./globals.css";

const syne = Syne({ variable: "--font-syne", subsets: ["latin"], weight: ["600", "700", "800"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "ShipSaathi — shipment booking & pre-flight checks",
  description:
    "Describe a shipment in plain English or upload your booking sheet. ShipSaathi checks ten pre-flight rules, explains every fix and recommends a carrier from the rate card.",
};

export const viewport: Viewport = {
  themeColor: "#0a0c0e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${sora.variable}`} suppressHydrationWarning>
      <head>
        {/* Set before first paint so scroll-bound motion starts closed without a flash; absent JS or with reduced motion the page renders finished. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('motion-ok')}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-screen">
        <MotionFlag />
        <Toaster>
          <Suspense fallback={<NavFallback />}>
            <Nav />
          </Suspense>
          {children}
        </Toaster>
      </body>
    </html>
  );
}
