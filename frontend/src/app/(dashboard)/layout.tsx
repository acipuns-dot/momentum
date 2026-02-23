'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, LineChart, Plus, User, Dumbbell, X, Utensils } from 'lucide-react';
import { useState } from 'react';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const [fabOpen, setFabOpen] = useState(false);

    const isActive = (path: string) => {
        if (path === '/' && pathname !== '/') return false;
        return pathname?.startsWith(path);
    };

    const handleChoice = (href: string) => {
        setFabOpen(false);
        router.push(href);
    };

    return (
        <div className="relative min-h-screen pb-[calc(7rem+env(safe-area-inset-bottom))] bg-[#f8f9fa] dot-grid-subtle max-w-md mx-auto overflow-hidden shadow-2xl shadow-slate-200/50">
            {children}

            {/* ── FAB Choice Bottom Sheet ───────────────────────────────── */}
            {fabOpen && (
                <div
                    className="fixed inset-0 z-[70] flex flex-col justify-end"
                    onClick={() => setFabOpen(false)}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" />

                    {/* Sheet */}
                    <div
                        className="relative bg-white rounded-t-[2.5rem] px-6 pt-5 pb-36 shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-6" />
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">What would you like to log?</p>

                        <div className="grid grid-cols-2 gap-3">
                            {/* Log Workout */}
                            <button
                                onClick={() => handleChoice('/log')}
                                className="flex flex-col items-center justify-center gap-3 bg-orange-50 border border-orange-100 rounded-[1.5rem] p-5 active:scale-95 transition-all hover:border-orange-200 hover:bg-orange-100"
                            >
                                <div className="w-14 h-14 bg-[#f97316] rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/30">
                                    <Dumbbell size={26} className="text-white" strokeWidth={2} />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-black text-slate-900">Log Workout</p>
                                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">Timer + activity tracker</p>
                                </div>
                            </button>

                            {/* Log Nutrition */}
                            <button
                                onClick={() => handleChoice('/nutrition')}
                                className="flex flex-col items-center justify-center gap-3 bg-emerald-50 border border-emerald-100 rounded-[1.5rem] p-5 active:scale-95 transition-all hover:border-emerald-200 hover:bg-emerald-100"
                            >
                                <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                    <Utensils size={26} className="text-white" strokeWidth={2} />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-black text-slate-900">Log Nutrition</p>
                                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">Meals &amp; calorie tracking</p>
                                </div>
                            </button>
                        </div>

                        {/* Cancel */}
                        <button
                            onClick={() => setFabOpen(false)}
                            className="w-full mt-4 py-3.5 rounded-2xl bg-slate-100 text-slate-500 text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
                        >
                            <X size={16} /> Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* ── Bottom Navigation ─────────────────────────────────────── */}
            <nav className="fixed bottom-0 left-0 right-0 w-full bg-white border-t border-slate-100/60 z-50 shadow-[0_-8px_30px_-15px_rgba(0,0,0,0.1)] rounded-t-[2rem] h-[calc(80px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]">
                <div className="flex justify-between items-center h-[80px] px-8 max-w-md mx-auto relative">

                    <Link href="/" className={`flex flex-col items-center justify-center w-[50px] h-full transition-colors group ${isActive('/') ? 'text-[#f97316]' : 'text-slate-400 hover:text-slate-600'}`}>
                        <Home size={24} className={`mb-1 ${isActive('/') ? 'fill-current' : 'group-hover:scale-110 transition-transform'}`} strokeWidth={isActive('/') ? 2.5 : 2} />
                        <span className="text-[10px] font-bold">Home</span>
                    </Link>

                    <Link href="/progress" className={`flex flex-col items-center justify-center w-[50px] h-full transition-colors group ${isActive('/progress') ? 'text-[#f97316]' : 'text-slate-400 hover:text-slate-600'}`}>
                        <LineChart size={24} className={`mb-1 ${isActive('/progress') ? '' : 'group-hover:scale-110 transition-transform'}`} strokeWidth={isActive('/progress') ? 2.5 : 2} />
                        <span className="text-[10px] font-bold">Progress</span>
                    </Link>

                    {/* FAB */}
                    <button
                        onClick={() => setFabOpen(true)}
                        className="flex flex-col items-center justify-center w-[64px] h-full relative -top-8 group"
                    >
                        <div className={`text-white w-[60px] h-[60px] rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ring-4 ring-[#f8f9fa] ${fabOpen ? 'bg-slate-700 rotate-45 shadow-slate-700/30' : 'bg-[#f97316] shadow-[#f97316]/40 group-hover:scale-105'}`}>
                            <Plus size={32} strokeWidth={2.5} />
                        </div>
                    </button>

                    <Link href="/exercises" className={`flex flex-col items-center justify-center w-[50px] h-full transition-colors group ${isActive('/exercises') ? 'text-[#f97316]' : 'text-slate-400 hover:text-slate-600'}`}>
                        <Dumbbell size={24} className={`mb-1 ${isActive('/exercises') ? '' : 'group-hover:scale-110 transition-transform'}`} strokeWidth={isActive('/exercises') ? 2.5 : 2} />
                        <span className="text-[10px] font-bold">Workouts</span>
                    </Link>

                    <Link href="/profile" className={`flex flex-col items-center justify-center w-[50px] h-full transition-colors group ${isActive('/profile') ? 'text-[#f97316]' : 'text-slate-400 hover:text-slate-600'}`}>
                        <User size={24} className={`mb-1 ${isActive('/profile') ? '' : 'group-hover:scale-110 transition-transform'}`} strokeWidth={isActive('/profile') ? 2.5 : 2} />
                        <span className="text-[10px] font-bold">Profile</span>
                    </Link>

                </div>
            </nav>
        </div>
    );
}
