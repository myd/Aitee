import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unseen — AI t-shirt studio",
  description: "Describe a shirt. We design it, check it, print it, and post it. You see it when it arrives.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
