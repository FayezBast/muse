import type { Metadata } from "next";
import StaffAutoRedirect from "./StaffAutoRedirect";
import { AppClerkProvider } from "./lib/auth-client";
import "./globals.css";

export const metadata: Metadata = {
  title: "MUSE Pilates",
  description: "Booking page for MUSE Pilates",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppClerkProvider>
          <StaffAutoRedirect />
          {children}
        </AppClerkProvider>
      </body>
    </html>
  );
}
