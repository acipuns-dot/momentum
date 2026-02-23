import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import AuthGuard from "@/components/AuthGuard";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Momentum",
  description: "AI-Powered Weight Loss & Fitness Training",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Momentum",
  },
};

export const viewport: Viewport = {
  themeColor: "#070911",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${outfit.className} bg-[#070911] text-slate-100 antialiased relative min-h-screen`}>
        {/* Global animated ambient background mesh */}
        <div className="fixed inset-0 z-[0] pointer-events-none overflow-hidden bg-[#070911]">
          <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-sky-500/15 blur-3xl opacity-70 animate-blob"></div>
          <div className="absolute top-[20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-orange-500/12 blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-[-10%] left-[20%] w-[50vw] h-[50vw] rounded-full bg-indigo-500/14 blur-3xl opacity-70 animate-blob animation-delay-4000"></div>
        </div>
        <main className="relative z-10 max-w-md mx-auto min-h-screen shadow-2xl bg-slate-950/70 border-x border-slate-700/45">
          <AuthProvider>
            <AuthGuard>
              {children}
            </AuthGuard>
          </AuthProvider>
        </main>
      </body>
    </html>
  );
}
