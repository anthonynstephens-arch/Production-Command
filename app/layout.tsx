import type { Metadata } from "next";
import "./globals.css";
import "./dashboard-polish.css";

export const metadata: Metadata = {
  title: "Marsh Supply | Production Command",
  description: "Inventory and fulfillment command center for Marsh Supply.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
