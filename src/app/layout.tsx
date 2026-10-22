import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";

import { LocalOrigin } from "@/components/local-origin";
import { Toaster } from "@/components/ui/sonner";
import { APP_NAME, PUBLIC_SITE_ORIGIN } from "@/lib/site";

import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
});

const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-fredoka",
});

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_ORIGIN),
  title: APP_NAME,
  description:
    "Hear a Pokémon fact, or play Who's That Pokémon. The same two games can go on a Yoto card.",
  openGraph: {
    title: APP_NAME,
    description:
      "Hear a Pokémon fact, or play Who's That Pokémon. The same two games can go on a Yoto card.",
    url: "/",
    siteName: APP_NAME,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: APP_NAME,
    description:
      "Hear a Pokémon fact, or play Who's That Pokémon. The same two games can go on a Yoto card.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocalOrigin />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
