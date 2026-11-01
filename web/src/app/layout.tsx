import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ghostdrop | Encrypted link sharing",
    template: "%s | Ghostdrop",
  },
  description:
    "Ghostdrop encrypts secrets in your browser before they reach the server, so a one-time link can disappear after it is opened.",
  applicationName: "Ghostdrop",
  keywords: [
    "encrypted sharing",
    "privacy",
    "secret link",
    "browser-side encryption",
  ],
  openGraph: {
    title: "Ghostdrop",
    description:
      "Share a secret with a link that expires and disappears after one open.",
    type: "website",
    siteName: "Ghostdrop",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ghostdrop",
    description:
      "Browser-encrypted secret sharing with self-destructing links.",
  },
  referrer: "no-referrer",
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
