import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import AuthGuard from "@/components/AuthGuard";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Momentum",
  description: "AI-Powered Weight Loss & Fitness Training",
  manifest: "/manifest.json",
  themeColor: "#f97316",
  icons: {
    icon: "/icon-192x192.png",
    apple: "/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Momentum",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${outfit.className} bg-slate-50 text-slate-900 antialiased relative min-h-screen`}>
        {/* Global animated ambient background mesh */}
        <div className="fixed inset-0 z-[0] pointer-events-none overflow-hidden bg-slate-50">
          <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-100/40 mix-blend-multiply blur-3xl opacity-70 animate-blob"></div>
          <div className="absolute top-[20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-[#18A058]/10 mix-blend-multiply blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-[-10%] left-[20%] w-[50vw] h-[50vw] rounded-full bg-purple-100/40 mix-blend-multiply blur-3xl opacity-70 animate-blob animation-delay-4000"></div>
        </div>
        <main className="relative z-10 max-w-md mx-auto min-h-screen shadow-2xl bg-white/80 border-x border-slate-200/50">
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
