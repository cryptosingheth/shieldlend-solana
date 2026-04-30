import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShieldLend Solana",
  description: "Privacy-first lending console for ShieldLend Solana.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
