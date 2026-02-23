"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Loader2, Users, DollarSign, Crown, Lock, Search, ChevronLeft } from "lucide-react";
import { getPB } from "@/lib/pb";

interface UserInfo {
    id: string;
    email: string;
    name: string;
    is_premium: boolean;
    premium_until: string | null;
    created: string;
}

interface Metrics {
    totalUsers: number;
    premiumCount: number;
    estimatedMRR: number;
}

export default function AdminDashboard() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [users, setUsers] = useState<UserInfo[]>([]);
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [loadingData, setLoadingData] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [error, setError] = useState("");
    const [togglingMap, setTogglingMap] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (authLoading) return;

        // Kick out non-admins instantly
        if (!user || user.is_admin !== true) {
            router.replace("/");
            return;
        }

        fetchData();
    }, [user, authLoading, router]);

    const fetchData = async () => {
        try {
            setLoadingData(true);
            const token = getPB().authStore.token;
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!res.ok) throw new Error("Failed to fetch admin data");

            const data = await res.json();
            setUsers(data.users);
            setMetrics(data.metrics);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoadingData(false);
        }
    };

    const togglePremium = async (targetId: string, currentStatus: boolean) => {
        try {
            // Optimistic UI update
            setTogglingMap(prev => ({ ...prev, [targetId]: true }));
            const newStatus = !currentStatus;
            const token = getPB().authStore.token;

            const res = await fetch(process.env.NEXT_PUBLIC_API_URL + "/admin/toggle-premium", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    targetUserId: targetId,
                    newPremiumStatus: newStatus
                })
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Failed to toggle");

            // Update local state, merging back the exact premium_until date string saved by the server
            setUsers(users.map(u =>
                u.id === targetId
                    ? { ...u, is_premium: newStatus, premium_until: data.user.premium_until }
                    : u
            ));

            // Recalculate quick metrics locally so we don't need a full refetch
            if (metrics) {
                const diff = newStatus ? 1 : -1;
                const newPremiumCount = metrics.premiumCount + diff;
                setMetrics({
                    ...metrics,
                    premiumCount: newPremiumCount,
                    estimatedMRR: newPremiumCount * 4.90
                });
            }

        } catch (err) {
            alert("Failed to toggle premium status.");
            fetchData(); // Rollback on failure
        } finally {
            setTogglingMap(prev => ({ ...prev, [targetId]: false }));
        }
    };

    if (authLoading || (user && user.is_admin && loadingData)) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 size={40} className="animate-spin text-[#18A058]" />
            </div>
        );
    }

    if (!user || user.is_admin !== true) {
        return null; // Will redirect in useEffect
    }

    const filteredUsers = users.filter(u =>
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-20">
            {/* Header */}
            <header className="bg-slate-900 text-white pt-12 pb-24 px-6 rounded-b-[3rem] sticky top-0 z-10">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.back()}
                            className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"
                        >
                            <ChevronLeft size={20} className="text-white" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-black">Admin HQ</h1>
                            <p className="text-slate-400 mt-1">Hello, {user.name || "Boss"}</p>
                        </div>
                    </div>
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                        <Lock size={24} className="text-white" />
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-6 -mt-16 relative z-20">

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl mb-6">
                        {error}
                    </div>
                )}

                {/* Metrics Cards */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-2">
                        <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-2">
                            <Users size={20} />
                        </div>
                        <p className="text-slate-500 text-sm font-medium">Total Users</p>
                        <p className="text-4xl font-black text-slate-900">{metrics?.totalUsers || 0}</p>
                    </div>
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-2 relative overflow-hidden">
                        <div className="w-10 h-10 bg-[#18A058]/10 text-[#18A058] rounded-full flex items-center justify-center mb-2">
                            <DollarSign size={20} />
                        </div>
                        <p className="text-slate-500 text-sm font-medium">Est. MRR</p>
                        <p className="text-4xl font-black text-[#18A058] flex items-baseline gap-1">
                            <span className="text-2xl">$</span>
                            {(metrics?.estimatedMRR || 0).toFixed(2)}
                            <span className="text-sm text-slate-400 font-normal">/mo</span>
                        </p>
                        <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-[#18A058]/5 rounded-full blur-xl pointer-events-none"></div>
                    </div>
                </div>

                {/* Users Table Section */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <Crown size={20} className="text-amber-500" /> All Users Output
                        </h2>
                        <div className="relative">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search email or name..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#18A058] focus:ring-1 focus:ring-[#18A058] transition-all w-full sm:w-64"
                            />
                        </div>
                    </div>

                    <div className="w-full">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                                <tr>
                                    <th className="px-4 sm:px-6 py-4">User</th>
                                    <th className="px-4 sm:px-6 py-4 hidden sm:table-cell">Joined</th>
                                    <th className="px-4 sm:px-6 py-4">Premium</th>
                                    <th className="px-4 sm:px-6 py-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                            No users found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map(u => (
                                        <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 sm:px-6 py-4">
                                                <p className="font-bold text-slate-900 truncate max-w-[100px] sm:max-w-[150px]">{u.name}</p>
                                                <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 truncate max-w-[100px] sm:max-w-[150px]">{u.email}</p>
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 text-slate-500 text-xs hidden sm:table-cell">
                                                {new Date(u.created).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4">
                                                {u.is_premium ? (
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className="inline-flex items-center justify-center px-2 py-1 text-[10px] sm:text-xs font-bold rounded-lg sm:rounded-full bg-amber-100 text-amber-700 w-auto">
                                                            💎 <span className="hidden sm:inline ml-1">Premium</span>
                                                        </span>
                                                        {u.premium_until && (
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                Exp: {new Date(u.premium_until).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex items-center justify-center px-2 py-1 text-[10px] sm:text-xs font-medium rounded-lg sm:rounded-full bg-slate-100 text-slate-600">
                                                        Free
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 text-right">
                                                <button
                                                    onClick={() => togglePremium(u.id, u.is_premium)}
                                                    disabled={togglingMap[u.id]}
                                                    className={`relative px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold rounded-xl transition-all shadow-sm inline-flex items-center justify-center gap-1 sm:gap-2 w-full sm:w-32 ml-auto
                                                        ${u.is_premium
                                                            ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'
                                                            : 'bg-[#18A058] text-white hover:bg-[#138046]'
                                                        } disabled:opacity-50`}
                                                >
                                                    {togglingMap[u.id] ? (
                                                        <Loader2 size={12} className="animate-spin" />
                                                    ) : u.is_premium ? 'Revoke' : 'Upgrade'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
