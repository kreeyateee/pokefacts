import type { Metadata } from "next";
import { Fredoka, Nunito } from "next/font/google";

import { LocalOrigin } from "@/components/local-origin";
import { Toaster } from "@/components/ui/sonner";
import { APP_NAME } from "@/lib/site";

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
  title: APP_NAME,
  description:
    "Hear a Pokémon fact, or play Guess Who. The same two games can go on a Yoto card.",
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
