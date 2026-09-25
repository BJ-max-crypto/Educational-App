import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Pane",
  description: "Coursework, in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">
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
      </body>
    </html>
  );
}
