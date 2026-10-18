import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";

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
  title: "Pokémon facts and Guess Who",
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
        {children}
        <Toaster />
      </body>
    </html>
  );
}
