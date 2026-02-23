"use client";

import { useState } from "react";
import { getPB } from "@/lib/pb";
import { useRouter } from "next/navigation";
import { MoveRight, Loader2 } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const pb = getPB();
            await pb.collection("users").authWithPassword(email, password);
            router.push("/");
        } catch (err: any) {
            setError(err.message || "Failed to log in.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="momentum-dark min-h-screen momentum-bg dot-grid-subtle flex flex-col items-center justify-center p-6 font-sans">
            <div className="w-full max-w-sm">
                <div className="text-center mb-10">
                    <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center rounded-3xl overflow-hidden ui-elevated ring-1 ring-slate-500/30">
                        <img src="/icon-192x192.png" alt="Momentum Logo" className="w-full h-full object-cover" />
                    </div>
                    <h1 className="text-3xl font-black tracking-tight mb-2"><span className="text-slate-900">Momen</span><span className="text-[#f97316]">tum</span></h1>
                    <p className="text-sm text-slate-400 font-semibold">Welcome back to your daily protocol</p>
                </div>

                <div className="ui-glass-strong surface-violet border border-slate-200 rounded-3xl p-6 ui-elevated">
                    <form onSubmit={handleLogin} className="space-y-4">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-300 text-sm px-4 py-3 rounded-xl font-medium text-center">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3.5 outline-none focus:border-[#f97316] focus:ring-1 focus:ring-[#f97316] transition-all font-medium placeholder:text-slate-400"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="********"
                                required
                                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3.5 outline-none focus:border-[#f97316] focus:ring-1 focus:ring-[#f97316] transition-all font-medium placeholder:text-slate-400"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full accent-gradient text-white font-bold text-base rounded-2xl px-4 py-4 mt-4 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:active:scale-100 ui-elevated"
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : "Sign In"}
                            {!loading && <MoveRight size={18} className="group-hover:translate-x-1 transition-transform" />}
                        </button>
                    </form>
                </div>

                <div className="mt-8 text-center text-sm font-medium text-slate-500">
                    Don't have an account?{" "}
                    <Link href="/signup" className="text-[#f97316] hover:text-[#fb923c] transition-colors">
                        Sign Up
                    </Link>
                </div>
            </div>
        </div>
    );
}
