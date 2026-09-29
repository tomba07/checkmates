import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chesscoop · Better together",
  description: "A shared board. A worthy opponent. Play chess together against Stockfish.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
