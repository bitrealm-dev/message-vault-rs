import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import { SourceFilterProvider } from "@/components/SourceFilter";
import { DateTimeFormatProvider } from "@/components/useDateTimeFormat";
import { MessageBadgePrefsProvider } from "@/components/useMessageBadgePrefs";
import { ThemeProvider } from "@/components/useTheme";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
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
    <html
      lang="en"
      className={`${geistSans.variable} h-full`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <body className="h-full overflow-hidden bg-bg text-text antialiased">
        <Script id="mv-theme-boot" strategy="beforeInteractive">
          {THEME_BOOT_SCRIPT}
        </Script>
        <ThemeProvider>
          <DateTimeFormatProvider>
            <MessageBadgePrefsProvider>
              <SourceFilterProvider>{children}</SourceFilterProvider>
            </MessageBadgePrefsProvider>
          </DateTimeFormatProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
