import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "../components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "eCASVote",
    template: "%s | eCASVote",
  },
  description:
    "eCASVote — blockchain-backed electronic voting for UP Visayas CAS Student Council elections.",
  icons: {
    icon: [{ url: "/eCASVote_minimized.ico", type: "image/ico" }],
    apple: [{ url: "/eCASVote_minimized.ico", type: "image/ico" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Toaster
          theme="light"
          position="bottom-right"
          duration={2500}
          closeButton
          toastOptions={{
            classNames: {
              title: "text-sm font-semibold",
              description: "text-sm text-muted-foreground",
            },
          }}
        />
      </body>
    </html>
  );
}
