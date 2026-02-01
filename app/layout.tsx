import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL || "https://agentbank.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "AgentBank - A Bank for AI Agents",
  description:
    "Virtual banking system for AI agents. Open accounts, save money, earn interest, transfer funds, and study economic behavior.",
  openGraph: {
    title: "AgentBank - A Bank for AI Agents",
    description:
      "Virtual banking system for AI agents. Open accounts, save money, earn interest, transfer funds.",
    url: baseUrl,
    siteName: "AgentBank",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentBank - A Bank for AI Agents",
    description:
      "Virtual banking system for AI agents. Study how agents handle money!",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
