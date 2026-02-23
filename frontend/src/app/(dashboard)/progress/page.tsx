'use client';

import { useState, useEffect } from 'react';
import { getPB } from '@/lib/pb';
import { useAuth } from '@/lib/auth';
import { TrendingDown, Scale, Plus, Loader2, Target, CalendarDays, LineChart } from 'lucide-react';
import Link from 'next/link';

export default function ProgressPage() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<any>(null);
    const [weightLogs, setWeightLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [newWeight, setNewWeight] = useState('');
    const [loggingState, setLoggingState] = useState(false);

    useEffect(() => {
        const fetchProgressData = async () => {
            if (!user) return;
            try {
                const pb = getPB();

                // Fetch profiles
                const profiles = await pb.collection('profiles_db').getFullList({
                    filter: `user = "${user.id}"`
                });

                if (profiles.length > 0) {
                    setProfile(profiles[0]);
                }

                // Fetch weight logs, sorted oldest to newest for the chart
                const logs = await pb.collection('weight_logs_db').getFullList({
                    filter: `user = "${user.id}"`,
                    sort: 'date'
                });

                // If there are no logs but we have a profile, fake a starting log from profile creation date
                if (logs.length === 0 && profiles.length > 0) {
                    setWeightLogs([{
                        weight: profiles[0].current_weight,
                        date: profiles[0].created
                    }]);
                } else {
                    setWeightLogs(logs);
                }
            } catch (e) {
                console.error("Progress fetch error", e);
            } finally {
                setLoading(false);
            }
        };

        fetchProgressData();
    }, [user]);

    const handleLogWeight = async () => {
        if (!newWeight || !user || !profile) return;
        setLoggingState(true);
        try {
            const pb = getPB();
            const weightNum = parseFloat(newWeight);

            // 1. Add log entry
            const logEntry = await pb.collection('weight_logs_db').create({
                user: user.id,
                date: new Date().toISOString(),
                weight: weightNum
            });

            // 2. Update profile current weight
            await pb.collection('profiles_db').update(profile.id, {
                current_weight: weightNum
            });

            // Update UI
            setWeightLogs(prev => [...prev, logEntry]);
            setProfile((prev: any) => ({ ...prev, current_weight: weightNum }));
            setIsLogModalOpen(false);
            setNewWeight('');
        } catch (e) {
            console.error("Failed to log weight", e);
        } finally {
            setLoggingState(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa]">
                <Loader2 className="animate-spin text-[#f97316]" size={32} />
            </div>
        );
    }

    const currentWeight = profile?.current_weight || 0;
    const goalWeight = profile?.goal_weight || 0;

    // Determine starting weight (first log or current weight)
    const startingWeight = weightLogs.length > 0 ? weightLogs[0].weight : currentWeight;
    const totalLost = startingWeight - currentWeight;
    const toGo = currentWeight - goalWeight;

    // Progress %
    const totalJourney = startingWeight - goalWeight;
    const currentProgress = totalJourney > 0 ? Math.min(Math.max((totalLost / totalJourney) * 100, 0), 100) : 0;

    // SVG Chart generation logic
    const maxWeight = Math.max(...weightLogs.map(l => l.weight), startingWeight) + 2;
    const minWeight = Math.min(...weightLogs.map(l => l.weight), goalWeight) - 2;
    const chartRange = maxWeight - minWeight || 1;

    // Map logs to SVG coordinates
    const points = weightLogs.map((log, i) => {
        const x = weightLogs.length > 1 ? (i / (weightLogs.length - 1)) * 100 : 50;
        const y = 100 - (((log.weight - minWeight) / chartRange) * 100);
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="min-h-screen momentum-bg dot-grid-subtle text-slate-900 pb-32 font-sans selection:bg-orange-500 selection:text-white ui-page">
            {/* Header */}
            <div className="pt-12 px-6 mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Your Progress</h1>
                    <p className="text-sm font-medium text-slate-500 mt-1">Consistency is key.</p>
                </div>
                <button
                    onClick={() => setIsLogModalOpen(true)}
                    className="w-12 h-12 bg-white rounded-full flex items-center justify-center ui-card border border-slate-100 text-slate-700 hover:text-[#f97316] hover:border-orange-200 transition-colors"
                >
                    <Plus size={24} />
                </button>
            </div>

            <div className="px-6 space-y-6">

                {/* Master Overview Card */}
                <div className="ui-glass-strong surface-orange rounded-[2rem] p-6 ui-card relative overflow-hidden">
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-2">
                            <Scale size={20} className="text-[#f97316]" />
                            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Current Weight</h2>
                        </div>
                        <div className="status-success border font-bold px-3 py-1 rounded-full text-xs flex items-center gap-1">
                            <TrendingDown size={14} /> {totalLost > 0 ? `${totalLost.toFixed(1)}kg lost` : 'Just starting'}
                        </div>
                    </div>

                    <div className="flex items-baseline gap-1 mb-8">
                        <span className="text-6xl font-black text-slate-900 tracking-tighter">{currentWeight.toFixed(1)}</span>
                        <span className="text-lg font-bold text-slate-400">kg</span>
                    </div>

                    {/* Progress Bar mapped to Goal */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold text-slate-500">
                            <span>{startingWeight}kg (Start)</span>
                            <span className="text-[#f97316]">{goalWeight}kg (Goal)</span>
                        </div>
                        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden relative">
                            <div
                                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-orange-400 to-[#f97316] rounded-full transition-all duration-1000"
                                style={{ width: `${currentProgress}%` }}
                            ></div>
                        </div>
                        <div className="text-right text-xs font-bold text-slate-400">
                            {toGo > 0 ? `${toGo.toFixed(1)}kg to go` : 'Goal reached! 🎉'}
                        </div>
                    </div>

                    {/* Abstract Decoration */}
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-orange-100 rounded-full blur-3xl z-0 pointer-events-none opacity-50"></div>
                </div>

                {/* The Chart */}
                <div className="ui-glass surface-blue rounded-[2rem] p-6 ui-card">
                    <div className="flex items-center gap-2 mb-6">
                        <LineChart size={20} className="text-blue-500" />
                        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Weight Trend</h2>
                    </div>

                    {weightLogs.length > 1 ? (
                        <div className="relative w-full h-56 mt-2">
                            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                <defs>
                                    <linearGradient id="blueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                                    </linearGradient>
                                </defs>

                                {/* Grid lines at 25 / 50 / 75 % */}
                                {[25, 50, 75].map(pct => (
                                    <line
                                        key={pct}
                                        x1="0" y1={pct} x2="100" y2={pct}
                                        stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2,2"
                                    />
                                ))}
                                {/* Bottom axis */}
                                <line x1="0" y1="100" x2="100" y2="100" stroke="#e2e8f0" strokeWidth="0.5" />

                                {/* Area fill */}
                                <path
                                    d={`M 0,100 L ${points.split(' ').map(p => {
                                        const [x, y] = p.split(',');
                                        return `${x},${y}`;
                                    }).join(' L ')} L 100,100 Z`}
                                    fill="url(#blueGrad)"
                                />

                                {/* Line */}
                                <polyline
                                    points={points}
                                    fill="none"
                                    stroke="#3b82f6"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />

                                {/* Dots */}
                                {points.split(' ').map((p, i) => {
                                    const [x, y] = p.split(',');
                                    const isLast = i === weightLogs.length - 1;
                                    return (
                                        <circle
                                            key={i}
                                            cx={x} cy={y}
                                            r={isLast ? '2.5' : '1.5'}
                                            fill={isLast ? '#3b82f6' : 'white'}
                                            stroke="#3b82f6"
                                            strokeWidth="1.5"
                                        />
                                    );
                                })}
                            </svg>

                            {/* Y-axis labels (absolute, outside SVG) */}
                            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pr-1">
                                {[0, 25, 50, 75, 100].map(pct => {
                                    const val = maxWeight - (pct / 100) * chartRange;
                                    return (
                                        <span key={pct} className="text-xs font-bold text-slate-300 text-right leading-none">
                                            {val.toFixed(1)}
                                        </span>
                                    );
                                })}
                            </div>

                            {/* X-axis date labels */}
                            <div className="flex justify-between mt-1 px-0.5">
                                <span className="text-xs font-bold text-slate-400">
                                    {new Date(weightLogs[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                                <span className="text-xs font-bold text-slate-400">
                                    {new Date(weightLogs[weightLogs.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full h-40 flex flex-col items-center justify-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            <LineChart size={32} className="text-slate-300 mb-2" />
                            <p className="text-sm font-bold text-slate-500">Not enough data yet.</p>
                            <p className="text-xs text-slate-400">Log your weight a few times to see a trend!</p>
                        </div>
                    )}
                </div>

                {/* History List */}
                <div className="ui-glass surface-violet rounded-[2rem] p-6 ui-card">
                    <div className="flex items-center gap-2 mb-6">
                        <CalendarDays size={20} className="text-purple-500" />
                        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">History</h2>
                    </div>

                    <div className="space-y-4">
                        {[...weightLogs].reverse().map((log, i) => (
                            <div key={log.id || i} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                                <div className="text-sm font-bold text-slate-900">
                                    {new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </div>
                                <div className="text-sm font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-lg">
                                    {Number(log.weight).toFixed(1)} kg
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {/* Log Weight Modal */}
            {isLogModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in"
                        onClick={() => setIsLogModalOpen(false)}
                    ></div>
                    <div className="ui-glass-strong rounded-[2rem] p-6 w-full max-w-sm relative z-10 ui-elevated border border-slate-100 animate-in zoom-in-95 duration-200">
                        <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center mb-4 mx-auto border border-orange-100">
                            <Scale className="text-[#f97316]" size={24} />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 text-center mb-2">Log Weight</h3>
                        <p className="text-sm text-slate-500 text-center mb-6 font-medium">Daily morning weigh-ins are most accurate.</p>

                        <div className="relative mb-6">
                            <input
                                type="number"
                                step="0.1"
                                value={newWeight}
                                onChange={(e) => setNewWeight(e.target.value)}
                                placeholder="e.g. 71.5"
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-4 text-center text-3xl font-black text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all font-sans"
                                autoFocus
                            />
                            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold">kg</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setIsLogModalOpen(false)}
                                className="py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleLogWeight}
                                disabled={!newWeight || isNaN(parseFloat(newWeight)) || loggingState}
                                className="py-3 rounded-xl font-bold text-white bg-[#f97316] hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center ui-elevated "
                            >
                                {loggingState ? <Loader2 size={18} className="animate-spin" /> : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

