import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeSync } from "@/components/appearance-setting";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import { themeBootScript } from "@/lib/theme";
import "./globals.css";
import "./mobile.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Pane",
  description: "Coursework, in one place.",
  applicationName: "Pane",
  appleWebApp: { capable: true, title: "Pane", statusBarStyle: "default" },
  // Next only emits `mobile-web-app-capable`; iOS before 16.4 needs the Apple-prefixed tag.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the page draw under the notch and home indicator; mobile.css pads by the safe-area insets.
  viewportFit: "cover",
  // Only phones get a tinted browser bar; desktop browser chrome is left alone.
  themeColor: [{ media: "(max-width: 767.98px)", color: "#eef3fb" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <ThemeSync />
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: "#4f7cff",
              colorForeground: "#14213d",
              colorMutedForeground: "#5b6478",
              colorBackground: "#f7f9ff",
              borderRadius: "1.25rem",
              fontFamily: "var(--font-inter), Inter, sans-serif",
            },
          }}
        >
          {children}
        </ClerkProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
