"use client";

import { useAuth } from "@/lib/auth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const PUBLIC_PATHS = ["/login", "/signup"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

    // Redirect unauthenticated users away from protected routes
    useEffect(() => {
        if (loading) return;
        if (!user && !isPublic) {
            router.push("/login");
        }
    }, [user, loading, isPublic, router]);

    // Check if user needs onboarding (only on protected routes when logged in)
    useEffect(() => {
        if (loading || isPublic || !user) return;

        // Optimized Bypass: Check localStorage first for instant redirection suppression
        const isAlreadyOnboarded = typeof window !== 'undefined' && localStorage.getItem('momentum_onboarded') === 'true';
        if (isAlreadyOnboarded) {
            // Guard: If they somehow landed on the /onboarding page (e.g. from an old PWA manifest start_url cache)
            // and they are already onboarded, force them back to the dashboard.
            if (pathname.startsWith("/onboarding")) {
                router.replace("/");
            }
            return;
        }

        const checkOnboarding = async () => {
            try {
                const { getPB } = await import("@/lib/pb");
                const pb = getPB();
                const profiles = await pb.collection("profiles_db").getFullList({
                    filter: `user = "${user.id}"`,
                });
                const profile = profiles[0];
                const needsOnboarding =
                    !profile || !profile.current_weight || profile.current_weight === 0;

                if (needsOnboarding) {
                    if (!pathname.startsWith("/onboarding")) {
                        router.replace("/onboarding");
                    }
                } else {
                    // Cache the result for next time!
                    localStorage.setItem('momentum_onboarded', 'true');
                    // Eject from onboarding if they somehow got here
                    if (pathname.startsWith("/onboarding")) {
                        router.replace("/");
                    }
                }
            } catch (e) {
                console.error("AuthGuard profile check failed", e);
            }
        };

        checkOnboarding();
    }, [user, loading, pathname, isPublic, router]);

    // Show spinner while auth state is resolving
    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="animate-spin text-[#f97316]" size={32} />
            </div>
        );
    }

    // Public pages (login/signup) ALWAYS render — no mounted trick needed
    if (isPublic) {
        return <>{children}</>;
    }

    // Protected route, not logged in — render nothing while redirect fires
    if (!user) {
        return null;
    }

    return <>{children}</>;
}
