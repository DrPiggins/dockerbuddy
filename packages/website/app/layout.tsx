import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dockerbuddy.com"),
  title: "DockerBuddy — Docker × Claude Code",
  description:
    "DockerBuddy lets Claude Code drive Docker, and offloads heavy builds to a paired machine. One app, two roles. No more melting your laptop fans.",
  openGraph: {
    type: "website",
    siteName: "DockerBuddy",
    title: "DockerBuddy — Docker × Claude Code",
    description:
      "Claude Code, meet Docker. Pair any machine to offload heavy builds. Watch every container call as it happens.",
    url: "https://dockerbuddy.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "DockerBuddy — Docker × Claude Code",
    description:
      "Claude Code, meet Docker. Pair any machine to offload heavy builds.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
