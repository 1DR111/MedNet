import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ThemeProvider from "@/components/ThemeProvider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MedNet | Abuja Healthcare & HMO Directory",
  description:
    "Find hospitals, clinics, pharmacies and laboratories in Abuja, see which Leadway Health plans each one accepts, check listed hours and get directions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script adds `.dark` before hydration; the warning it would
    // otherwise trigger is expected and suppressed.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/* Browser extensions such as Grammarly add their own attributes to <body>
          before React hydrates; that is not a bug in the app, so React is told not
          to report it. The flag only covers this element's attributes. */}
      <body
        suppressHydrationWarning
        className="flex min-h-full flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
