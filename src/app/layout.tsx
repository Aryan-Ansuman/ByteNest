import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthBootstrap from "@/components/AuthBootstrap";

const inter = Inter({ subsets: ["latin"] });
import { cn } from "@/lib/utils";
export const metadata: Metadata = {
  title: "ByteNest",
  description: "A modern Q&A platform for developers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={cn(inter.className, "dark:bg-black dark:text-white")}>
        <AuthBootstrap />
        {children}</body>
    </html>
  );
}
