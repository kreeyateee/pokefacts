import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";

import { LocalOrigin } from "@/components/local-origin";
import { Toaster } from "@/components/ui/sonner";
import { APP_NAME } from "@/lib/site";

import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    "Hear a Pokémon fact, or play Guess Who. The same two games can go on a Yoto card.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocalOrigin />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
