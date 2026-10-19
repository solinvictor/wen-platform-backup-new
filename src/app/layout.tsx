import type { Metadata } from "next";
import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";
import { CartProvider } from "@/context/CartContext";
import { LocationProvider } from "@/context/LocationContext";
import { TYPEKIT_KIT_ID } from "@/lib/typekit";
import "./globals.css";

const nohemi = localFont({
  src: [
    { path: "../../public/fonts/nohemi/Nohemi-Regular-BF6438cc579d934.woff",  weight: "400", style: "normal" },
    { path: "../../public/fonts/nohemi/Nohemi-Medium-BF6438cc57ddecd.woff",   weight: "500", style: "normal" },
    { path: "../../public/fonts/nohemi/Nohemi-SemiBold-BF6438cc57db2ff.woff", weight: "600", style: "normal" },
    { path: "../../public/fonts/nohemi/Nohemi-Bold-BF6438cc577b524.woff",     weight: "700", style: "normal" },
    { path: "../../public/fonts/nohemi/Nohemi-ExtraBold-BF6438cc5761ae2.woff",weight: "800", style: "normal" },
  ],
  variable: "--font-nohemi",
  display: "swap",
});


const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = "https://wenfoods.com"
const TITLE = "WEN — Fresh Farm Produce, Direct From Trusted Farmers"
const DESCRIPTION =
  "WEN connects farmers directly to buyers to ensure fresh produce, fair pricing, and faster delivery across communities."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "WEN",
    type: "website",
    locale: "en_NG",
    // opengraph-image.png in this folder is picked up automatically.
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    // twitter-image.png in this folder is picked up automatically.
  },
};

// True once an Adobe Fonts project ID is set in src/lib/typekit.ts
const museo = TYPEKIT_KIT_ID !== "";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-font={museo ? "museo" : undefined}
      className={`${nohemi.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      {museo && (
        <head>
          <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
          <link rel="preconnect" href="https://p.typekit.net" crossOrigin="anonymous" />
          <link rel="stylesheet" href={`https://use.typekit.net/${TYPEKIT_KIT_ID}.css`} />
        </head>
      )}
      <body className="min-h-full flex flex-col bg-grain text-soil">
        <LocationProvider>
          <CartProvider>
            {children}
          </CartProvider>
        </LocationProvider>
      </body>
    </html>
  );
}
