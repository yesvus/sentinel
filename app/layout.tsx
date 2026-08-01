import type { Metadata } from "next";
import { Inter, Geist_Mono, Montserrat } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-context";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const montserrat = Montserrat({
  variable: "--font-wordmark",
  weight: "800",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sentinel",
  description: "A better study/work tracker.",
};

// Mirrors lib/theme-context.tsx's storedSettings/resolveTheme/scheduledTheme. Must run inline,
// synchronously, before first paint — keep this in sync by hand if that logic changes.
const THEME_INIT_SCRIPT = `(function() {
  try {
    var stored = JSON.parse(localStorage.getItem("sentinel-theme-settings") || "null");
    var mode = stored && (stored.mode === "light" || stored.mode === "dark" || stored.mode === "scheduled" || stored.mode === "system") ? stored.mode : "dark";
    var schedule = stored && stored.schedule && stored.schedule.darkFrom && stored.schedule.lightFrom ? stored.schedule : { darkFrom: "20:00", lightFrom: "06:00" };
    function minutes(v) { var p = v.split(":"); return Number(p[0]) * 60 + Number(p[1]); }
    var theme;
    if (mode === "light" || mode === "dark") {
      theme = mode;
    } else if (mode === "scheduled") {
      var now = new Date();
      var current = now.getHours() * 60 + now.getMinutes();
      var darkFrom = minutes(schedule.darkFrom);
      var lightFrom = minutes(schedule.lightFrom);
      var dark = darkFrom === lightFrom ? true : (darkFrom > lightFrom ? (current >= darkFrom || current < lightFrom) : (current >= darkFrom && current < lightFrom));
      theme = dark ? "dark" : "light";
    } else {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    if (theme === "dark") document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} ${montserrat.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <AuthProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
