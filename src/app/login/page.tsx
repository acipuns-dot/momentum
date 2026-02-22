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

    const handleDemoLogin = async () => {
        setEmail("demo@jumprope.com");
        setPassword("password123");
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
            <div className="w-full max-w-sm">

                {/* Brand Header */}
                <div className="text-center mb-10">
                    <div className="w-16 h-16 bg-[#18A058] rounded-2xl mx-auto shadow-xl shadow-primary-500/30 mb-6 flex items-center justify-center">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path>
                            <line x1="16" y1="8" x2="2" y2="22"></line>
                            <line x1="17.5" y1="15" x2="9" y2="6.5"></line>
                        </svg>
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Weight<span className="text-[#18A058]">Loss</span>.ai</h1>
                    <p className="text-slate-500 text-sm">Target 68kg · Smart Planning</p>
                </div>

                {/* Login Form */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl">
                    <form onSubmit={handleLogin} className="space-y-4">

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl font-medium text-center">
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
                                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3.5 outline-none focus:border-[#18A058] focus:ring-1 focus:ring-[#18A058] transition-all font-medium placeholder:text-slate-400"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3.5 outline-none focus:border-[#18A058] focus:ring-1 focus:ring-[#18A058] transition-all font-medium placeholder:text-slate-400"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-slate-900 text-white font-bold text-base rounded-2xl px-4 py-4 mt-4 hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:active:scale-100 shadow-lg shadow-slate-900/20"
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : "Sign In"}
                            {!loading && <MoveRight size={18} className="group-hover:translate-x-1 transition-transform" />}
                        </button>
                    </form>

                    {/* Dev helper */}
                    <div className="mt-6 pt-6 border-t border-slate-100 text-center">
                        <button onClick={handleDemoLogin} type="button" className="text-sm text-slate-500 font-medium hover:text-slate-900 transition-colors">
                            Load demo credentials
                        </button>
                        <p className="text-[10px] text-slate-400 mt-2">v2026.02 (Light UI)</p>
                    </div>
                </div>

                <div className="mt-8 text-center text-sm font-medium text-slate-500">
                    Don't have an account?{" "}
                    <Link href="/signup" className="text-[#18A058] hover:text-[#138046] transition-colors">
                        Sign Up
                    </Link>
                </div>

            </div>
        </div>
    );
}
