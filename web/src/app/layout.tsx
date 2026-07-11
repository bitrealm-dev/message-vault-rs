import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { SourceFilterProvider } from "@/components/SourceFilter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Message Vault",
  description: "Browse your messages in one place",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`}>
      <body className="h-full overflow-hidden bg-bg text-text antialiased">
        <SourceFilterProvider>{children}</SourceFilterProvider>
      </body>
    </html>
  );
}
