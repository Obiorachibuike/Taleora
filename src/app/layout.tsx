import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Taleora — Where Every Story Finds Its Voice",
    template: "%s · Taleora",
  },
  description: "Taleora — AI-powered Story Writing & Humanization Platform. Imagine. Write. Humanize.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "Taleora — Where Every Story Finds Its Voice",
    description: "AI-powered Story Writing & Humanization Platform.",
    type: "website",
    siteName: "Taleora",
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
