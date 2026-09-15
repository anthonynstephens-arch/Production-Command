import type { Metadata } from "next";
import "./globals.css";
import "./dashboard-polish.css";

export const metadata: Metadata = {
  title: "Marsh Supply | Production Command",
  description: "Inventory and fulfillment command center for Marsh Supply.",
  appleWebApp: {capable:true,title:"Production Command",statusBarStyle:"black-translucent"},
  icons:{apple:"/notification-icon.png"},
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
