import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthBootstrap from "@/components/AuthBootstrap";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

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
        {children}
        <Toaster 
          theme="dark" 
          position="bottom-right" 
          closeButton 
          toastOptions={{
            classNames: {
              toast: "border-white/5 bg-[#0a0a0a] text-zinc-300",
              success: "border-[#a7c8b3]/20 bg-[#a7c8b3]/10 text-[#a7c8b3]",
              error: "border-rose-900/30 bg-rose-950/30 text-rose-300",
            }
          }}
        />
      </body>
    </html>
  );
}
