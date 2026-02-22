'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Target, Droplet, Plus, MoreHorizontal, CheckCircle2, Circle, Loader2, Bell, Clock, Calendar, ArrowDown } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/lib/auth';
import { getPB } from '@/lib/pb';
import { calcNutritionTargets } from '@/lib/nutritionTargets';

export default function DashboardPage() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<any>(null);
    const [waterMl, setWaterMl] = useState(0);
    const [hydrationRecordId, setHydrationRecordId] = useState<string | null>(null);
    const [plan, setPlan] = useState<any>(null);
    const [loadingPlan, setLoadingPlan] = useState(true);
    const [loggedKcal, setLoggedKcal] = useState(0);
    const [isMealModalOpen, setIsMealModalOpen] = useState(false);
    const [mealCalories, setMealCalories] = useState('');
    const [isWaterModalOpen, setIsWaterModalOpen] = useState(false);
    const [waterInputMl, setWaterInputMl] = useState('');
    const [isWorkoutBriefOpen, setIsWorkoutBriefOpen] = useState(false);
    const [nutritionRecordId, setNutritionRecordId] = useState<string | null>(null);
    const [generatingPlan, setGeneratingPlan] = useState(false);
    const [weeklyWeightChange, setWeeklyWeightChange] = useState<number | null>(null);

    // Animation States
    const [animatedKcal, setAnimatedKcal] = useState(0);
    const [animatedProtein, setAnimatedProtein] = useState(0);
    const [animatedCarbs, setAnimatedCarbs] = useState(0);
    const [animatedFat, setAnimatedFat] = useState(0);
    const [isMounted, setIsMounted] = useState(false);

    const targetWaterMl = profile?.current_weight ? profile.current_weight * 35 : 2500;

    // Derived Hydration State
    const currentLiters = (waterMl / 1000).toFixed(1);
    const hydrationPercentage = Math.min(Math.round((waterMl / targetWaterMl) * 100), 100);

    // Derived Nutrition State — AI plan takes priority, then profile BMR, then absolute fallback
    const computed = calcNutritionTargets(profile);
    const targetKcal = plan?.targetKcal || computed.targetKcal;
    const targetProtein = plan?.targetProtein || computed.targetProtein;
    const targetCarbs = plan?.targetCarbs || computed.targetCarbs;
    const targetFat = plan?.targetFat || computed.targetFat;

    // Progress Calculation
    // Use the actual loggedKcal for the final value, but draw the progress based on animation
    const calorieProgress = Math.min((animatedKcal / targetKcal) * 100, 100);

    // SVG stroke-dashoffset math (Circumference = 2 * pi * r = 2 * 3.14159 * 40 = 251.2)
    // When isMounted is false, keep offset at 251.2 (invisible). Once mounted, transition to the real progress.
    const initialDashoffset = 251.2;
    const targetDashoffset = 251.2 - (251.2 * calorieProgress) / 100;
    const currentDashoffset = isMounted ? targetDashoffset : initialDashoffset;

    // Context switching for 7-day calendar
    const [baseOffset, setBaseOffset] = useState(-2); // leftmost card offset from today
    const [selectedOffset, setSelectedOffset] = useState(0); // selected card offset from today
    const dayRefs = useRef<(HTMLDivElement | null)[]>([]);
    const touchStartX = useRef(0);
    const skipFirstDateEffect = useRef(true);

    // Derive selected date string and isToday flag
    const selectedDateStr = (() => {
        const d = new Date();
        d.setDate(d.getDate() + selectedOffset);
        return d.toISOString().split('T')[0];
    })();
    const isToday = selectedOffset === 0;

    const shiftCalendar = (dir: 'past' | 'future') => {
        setBaseOffset(b => dir === 'past' ? b - 1 : b + 1);
    };
    const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
    const onTouchEnd = (e: React.TouchEvent) => {
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        if (delta > 50) shiftCalendar('past');
        else if (delta < -50) shiftCalendar('future');
    };

    // Trigger on-mount animations
    useEffect(() => {
        // Short delay to ensure rendering completes before starting transitions
        const timer = setTimeout(() => setIsMounted(true), 100);
        return () => clearTimeout(timer);
    }, []);

    // Count Up Animation Logic
    useEffect(() => {
        if (!isMounted) return;

        // Animate the main calories number over 1.5 seconds
        const duration = 1500;
        const steps = 60;
        const stepTime = Math.abs(Math.floor(duration / steps));

        // This simulates a count-up if loggedKcal > 0. For now it's mostly 0, 
        // but if the user logs 1250 later, it'll count up smoothly on mount.
        let currentStep = 0;

        const counterInterval = setInterval(() => {
            currentStep += 1;
            const progress = currentStep / steps; // 0 to 1
            // Use an easeOutQuad easing function: 1 - (1 - t) * (1 - t)
            const easeProgress = 1 - (1 - progress) * (1 - progress);

            setAnimatedKcal(Math.round(loggedKcal * easeProgress));
            setAnimatedProtein(Math.round((loggedKcal > 0 ? targetProtein : 0) * easeProgress)); // Dummy logic for demo
            setAnimatedCarbs(Math.round((loggedKcal > 0 ? targetCarbs : 0) * easeProgress));
            setAnimatedFat(Math.round((loggedKcal > 0 ? targetFat : 0) * easeProgress));

            if (currentStep >= steps) {
                clearInterval(counterInterval);
                setAnimatedKcal(loggedKcal); // Ensure exact final value
            }
        }, stepTime);

        return () => clearInterval(counterInterval);
    }, [isMounted, loggedKcal, targetProtein, targetCarbs, targetFat]);


    useEffect(() => {
        const fetchUserData = async () => {
            if (!user) return;
            setLoadingPlan(true);

            try {
                const pb = getPB();

                // 1. Fetch Profile
                const profiles = await pb.collection('profiles_db').getFullList({
                    filter: `user = "${user.id}"`
                });

                const userProfile = profiles[0];
                setProfile(userProfile);

                // 2. Fetch the active plan from PocketBase
                let activePlan = null;
                try {
                    const todayDate = new Date();

                    // Fetch all plans for this user, newest first
                    const plans = await pb.collection('weekly_plans_db').getFullList({
                        filter: `user = "${user.id}"`,
                        sort: '-start_date',
                    });

                    // Filter in JS to be resilient to missing/null end_date values
                    const currentPlan = plans.find(p => {
                        const start = new Date(p.start_date);
                        const end = p.end_date ? new Date(p.end_date) : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
                        return todayDate >= start && todayDate <= end;
                    });

                    if (currentPlan) {
                        activePlan = currentPlan.plan_data;
                        setPlan(activePlan);
                        localStorage.setItem('weeklyPlan', JSON.stringify(activePlan));
                    } else if (plans.length > 0) {
                        // Fallback: If no "current" plan, just show the most recent one
                        activePlan = plans[0].plan_data;
                        setPlan(activePlan);
                        localStorage.setItem('weeklyPlan', JSON.stringify(activePlan));
                    }
                } catch (e) {
                    console.error("Plan fetch error:", e);
                }

                // Auto-generate a fallback week 1 plan if NONE exists at all (mostly for old test accounts)
                if (!activePlan && userProfile) {
                    try {
                        // Double check they don't have *any* plans before auto-generating
                        const allPlansCount = await pb.collection('weekly_plans_db').getList(1, 1, { filter: `user = "${user.id}"` });
                        if (allPlansCount.totalItems === 0) {
                            const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/generate-plan', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    userId: user.id,
                                    currentWeight: userProfile.current_weight,
                                    goalWeight: userProfile.goal_weight
                                })
                            });
                            if (res.ok) {
                                const data = await res.json();
                                localStorage.setItem('weeklyPlan', JSON.stringify(data));
                                setPlan(data);
                            }
                        } else {
                            // They have plans, but none are active today (e.g. plan expired). 
                            // Don't auto-generate to avoid spamming the AI API. Let them click "Regenerate".
                            setPlan(null);
                        }
                    } catch (e) {
                        console.error("Error during fallback plan generation", e)
                    }
                }

                // 3. Fetch today's nutrition targets
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);

                const nutritionRecords = await pb.collection('nutrition_targets_db').getFullList({
                    filter: `user = "${user.id}" && date >= "${today.toISOString()}" && date < "${tomorrow.toISOString()}"`
                });

                if (nutritionRecords.length > 0) {
                    const record = nutritionRecords[0];
                    setNutritionRecordId(record.id);
                    setLoggedKcal(record.logged_kcal || 0);
                }

                // 4. Fetch weight logs from last 7 days to compute weekly change
                try {
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                    const logs = await pb.collection('weight_logs_db').getFullList({
                        filter: `user = "${user.id}" && date >= "${sevenDaysAgo.toISOString()}"`,
                        sort: 'date',
                    });
                    if (logs.length > 0 && userProfile?.current_weight) {
                        // Compare oldest log in window vs current weight
                        const oldest = logs[0].weight;
                        const change = +(userProfile.current_weight - oldest).toFixed(1);
                        setWeeklyWeightChange(change);
                    }
                } catch (_) { /* no logs yet */ }

                // 5. Fetch today's hydration log
                try {
                    const todayDate = new Date().toISOString().split('T')[0];
                    const hydrationRecords = await pb.collection('hydration_logs_db').getFullList({
                        filter: `user = "${user.id}" && date = "${todayDate}"`,
                    });
                    if (hydrationRecords.length > 0) {
                        setWaterMl(hydrationRecords[0].ml);
                        setHydrationRecordId(hydrationRecords[0].id);
                    }
                } catch (_) { /* no hydration logs yet */ }

            } catch (e) {
                console.error("Error fetching user data", e);
            } finally {
                setLoadingPlan(false);
            }
        };

        fetchUserData();
    }, [user]);

    // Re-fetch hydration & nutrition when user taps a different date
    useEffect(() => {
        if (skipFirstDateEffect.current) { skipFirstDateEffect.current = false; return; }
        if (!user) return;
        (async () => {
            const pb = getPB();
            // Hydration for selected date
            try {
                const records = await pb.collection('hydration_logs_db').getFullList({
                    filter: `user = "${user.id}" && date = "${selectedDateStr}"`,
                });
                if (records.length > 0) {
                    setWaterMl(records[0].ml);
                    setHydrationRecordId(records[0].id);
                } else {
                    setWaterMl(0);
                    setHydrationRecordId(null);
                }
            } catch (_) { setWaterMl(0); setHydrationRecordId(null); }
            // Nutrition for selected date
            try {
                const d = new Date(selectedDateStr);
                d.setHours(0, 0, 0, 0);
                const next = new Date(d); next.setDate(next.getDate() + 1);
                const recs = await pb.collection('nutrition_targets_db').getFullList({
                    filter: `user = "${user.id}" && date >= "${d.toISOString()}" && date < "${next.toISOString()}"`,
                });
                if (recs.length > 0) {
                    setNutritionRecordId(recs[0].id);
                    setLoggedKcal(recs[0].logged_kcal || 0);
                } else {
                    setNutritionRecordId(null);
                    setLoggedKcal(0);
                }
            } catch (_) { setNutritionRecordId(null); setLoggedKcal(0); }
        })();
    }, [selectedDateStr, user]);

    // ── Manual plan generation ──────────────────────────────────────────────
    const handleGeneratePlan = async () => {
        if (!user || !profile || generatingPlan) return;
        setGeneratingPlan(true);
        try {
            const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/generate-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    currentWeight: profile.current_weight,
                    goalWeight: profile.goal_weight
                })
            });
            if (res.ok) {
                const data = await res.json();
                localStorage.setItem('weeklyPlan', JSON.stringify(data));
                setPlan(data);
            }
        } catch (e) {
            console.error('Plan generation failed', e);
        } finally {
            setGeneratingPlan(false);
        }
    };

    const handleSaveMealLog = async () => {
        if (!mealCalories || !user) return;
        const addKcal = Number(mealCalories);

        try {
            const pb = getPB();
            if (nutritionRecordId) {
                // Update
                const updated = await pb.collection('nutrition_targets_db').update(nutritionRecordId, {
                    logged_kcal: loggedKcal + addKcal
                });
                setLoggedKcal(updated.logged_kcal);
            } else {
                // Create
                const created = await pb.collection('nutrition_targets_db').create({
                    user: user.id,
                    date: new Date().toISOString(),
                    target_kcal: targetKcal,
                    logged_kcal: addKcal,
                    protein_g: targetProtein,
                    carbs_g: targetCarbs,
                    fat_g: targetFat
                });
                setNutritionRecordId(created.id);
                setLoggedKcal(created.logged_kcal);
            }
        } catch (e) {
            console.error("Failed to save meal log", e);
            setLoggedKcal(prev => prev + addKcal); // Fallback UI update
        }

        setIsMealModalOpen(false);
        setMealCalories('');
    };

    const handleAddWater = async (ml: number) => {
        const newTotal = Math.min(waterMl + ml, targetWaterMl * 2);
        setWaterMl(newTotal);
        try {
            const pb = getPB();
            const todayDate = new Date().toISOString().split('T')[0];
            if (hydrationRecordId) {
                await pb.collection('hydration_logs_db').update(hydrationRecordId, { ml: newTotal });
            } else {
                const created = await pb.collection('hydration_logs_db').create({
                    user: user!.id,
                    date: todayDate,
                    ml: newTotal,
                });
                setHydrationRecordId(created.id);
            }
        } catch (e) {
            console.error('Failed to save hydration log', e);
        }
    };

    const submitCustomWater = () => {
        const amount = parseInt(waterInputMl);
        if (!isNaN(amount) && amount > 0) {
            handleAddWater(amount);
            setIsWaterModalOpen(false);
            setWaterInputMl('');
        }
    };

    return (
        <div className="min-h-screen bg-[#f8f9fa] text-slate-900 pb-32 font-sans selection:bg-orange-500 selection:text-white max-w-md mx-auto relative shadow-2xl shadow-slate-200/50">

            <div className="pt-12 px-6 flex justify-between items-start mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center relative">
                        {/* Inner orange ring with white square inside, mimicking the avatar in the image */}
                        <div className="w-12 h-12 rounded-full border-2 border-[#f97316] p-0.5 flex items-center justify-center">
                            <div className="w-full h-full bg-[#fcead7] rounded-full flex items-center justify-center">
                                <div className="w-3.5 h-5 border-[3px] border-white rounded-[4px] bg-white/40"></div>
                            </div>
                        </div>
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">Good morning, {user?.email?.split('@')[0] || 'Alex'}</h1>
                        <p className="text-sm font-medium text-slate-500 mt-0.5">Ready to crush your goals? 🚀</p>
                    </div>
                </div>
                {/* Bell only — plan button moved to Daily Protocol section */}
                <button className="w-10 h-10 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center relative mt-2">
                    <Bell size={18} className="text-slate-700 fill-slate-700" />
                    <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-[#f97316] border-2 border-white rounded-full"></span>
                </button>
            </div>

            {/* Calendar Strip */}
            <div
                className="w-full px-4 pb-3 pt-2 -mt-4 mb-4 select-none space-y-2"
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
            >
                {/* Nav row: ‹  Month Year  › */}
                {(() => {
                    const centerDate = new Date();
                    centerDate.setDate(centerDate.getDate() + baseOffset + 2);
                    const monthLabel = centerDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    return (
                        <div className="flex items-center gap-2">
                            <button onClick={() => shiftCalendar('past')} className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-slate-100 shadow-sm text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-all flex-shrink-0">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                            </button>
                            <p className="flex-1 text-center text-sm font-extrabold text-slate-700 tracking-tight">{monthLabel}</p>
                            <button onClick={() => shiftCalendar('future')} className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-slate-100 shadow-sm text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-all flex-shrink-0">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                            </button>
                        </div>
                    );
                })()}
                {/* Cards row */}
                <div className="flex gap-2 flex-1 justify-between">
                    {Array.from({ length: 5 }, (_, i) => {
                        const offset = baseOffset + i;
                        const d = new Date();
                        d.setDate(d.getDate() + offset);
                        const isSelected = selectedOffset === offset;
                        const isFuture = offset > 0;
                        const dayName = offset === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
                        const dayNum = d.getDate();
                        const planDay = offset >= 0 ? plan?.days?.[offset] : null;

                        return (
                            <div
                                key={offset}
                                onClick={() => setSelectedOffset(offset)}
                                className={`flex-1 flex flex-col items-center justify-center h-20 rounded-[1.2rem] cursor-pointer transition-all ${isSelected
                                    ? 'bg-[#f97316] text-white shadow-lg shadow-orange-500/30'
                                    : isFuture
                                        ? 'bg-slate-50 border border-slate-100 text-slate-300 hover:border-orange-200'
                                        : 'bg-white border border-slate-100 text-slate-400 hover:border-orange-200 hover:shadow-md'
                                    }`}
                            >
                                <span className={`text-[10px] uppercase tracking-wider font-bold mb-1 ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>
                                    {dayName}
                                </span>
                                <span className={`text-xl font-black tracking-tighter ${isSelected ? 'text-white' : isFuture ? 'text-slate-300' : 'text-slate-800'}`}>
                                    {dayNum}
                                </span>
                                <div className="flex gap-1 mt-1.5 h-1.5">
                                    {planDay?.type === 'workout' && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-orange-400'}`}></div>}
                                    {planDay?.type === 'rest' && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-orange-200' : 'bg-blue-400'}`}></div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Main Content */}
            <div className="px-6 space-y-16 mt-6">

                {/* CALORIES SECTION */}
                <div className="bg-white rounded-[2rem] py-6 px-6 shadow-sm border border-slate-100 mb-6 mx-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-slate-900">Energy Balance</h2>
                        <span className="text-sm font-bold text-[#f97316]">Today</span>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                        {/* Donut Chart */}
                        <div className="relative w-32 h-32 flex-shrink-0">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="12" />
                                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f97316" strokeWidth="12" strokeDasharray="251.2" strokeDashoffset={currentDashoffset} strokeLinecap="round" className="transition-all duration-[1500ms] ease-out" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-3xl font-black text-slate-900 tracking-tighter leading-none">{animatedKcal}</span>
                                <span className="text-[10px] font-bold text-slate-400 mt-1">/ {targetKcal} kcal</span>
                            </div>
                        </div>
                        {/* Macros */}
                        <div className="flex-1 space-y-4 pr-2">
                            <div>
                                <div className="flex justify-between items-end mb-1.5">
                                    <span className="text-xs font-bold text-slate-700">Protein</span>
                                    <span className="text-xs font-bold text-[#22c55e]">{animatedProtein}g <span className="text-slate-400 font-medium tracking-tight">/ {targetProtein}g</span></span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-[#22c55e] rounded-full" style={{ width: `${Math.min((animatedProtein / targetProtein) * 100, 100)}%` }}></div>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-end mb-1.5">
                                    <span className="text-xs font-bold text-slate-700">Carbs</span>
                                    <span className="text-xs font-bold text-[#3b82f6]">{animatedCarbs}g <span className="text-slate-400 font-medium tracking-tight">/ {targetCarbs}g</span></span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-[#3b82f6] rounded-full" style={{ width: `${Math.min((animatedCarbs / targetCarbs) * 100, 100)}%` }}></div>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-end mb-1.5">
                                    <span className="text-xs font-bold text-slate-700">Fats</span>
                                    <span className="text-xs font-bold text-[#ec4899]">{animatedFat}g <span className="text-slate-400 font-medium tracking-tight">/ {targetFat}g</span></span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-[#ec4899] rounded-full" style={{ width: `${Math.min((animatedFat / targetFat) * 100, 100)}%` }}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* HYDRATION & WEIGHT SECTION */}
                <div className="grid grid-cols-2 gap-4 px-6 mb-8 mt-[-1rem]">
                    {/* Hydration */}
                    <div onClick={() => isToday && setIsWaterModalOpen(true)}
                        className={`bg-white rounded-[2rem] p-5 shadow-sm border border-slate-100 flex flex-col justify-between transition-colors h-48 ${isToday ? 'cursor-pointer hover:border-blue-200' : 'cursor-default'}`}>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="bg-blue-50 p-1.5 rounded-full">
                                <Droplet size={16} className="text-blue-500 fill-blue-500" />
                            </div>
                            <span className="text-sm font-bold text-slate-800">Hydration</span>
                        </div>
                        <div className="w-full flex-1 mt-2 relative bg-blue-50/50 rounded-2xl overflow-hidden flex flex-col items-center justify-center border border-blue-100/50">
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-blue-200 to-blue-100 opacity-60 transition-all duration-1000 ease-out" style={{ height: `${hydrationPercentage}%` }}></div>
                            <div className="relative z-10 flex flex-col items-center mt-2">
                                <span className="text-2xl font-black text-slate-900 tracking-tighter leading-none">{currentLiters}L</span>
                                <span className="text-[10px] font-medium text-slate-500 mt-1">Goal {(targetWaterMl / 1000).toFixed(1)}L</span>
                            </div>
                        </div>
                    </div>

                    {/* Weight + BMI */}
                    <div className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-100 flex flex-col gap-3 h-48">
                        <div className="flex items-center gap-2">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#f97316]">
                                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
                                <polyline points="16 7 22 7 22 13"></polyline>
                            </svg>
                            <span className="text-sm font-bold text-slate-800">Weight</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black text-slate-900 tracking-tighter leading-none">{profile?.current_weight || '--'}</span>
                            <span className="text-xs font-bold text-slate-400">kg</span>
                        </div>
                        {weeklyWeightChange !== null ? (
                            <p className={`text-[10px] font-bold flex items-center gap-1 ${weeklyWeightChange <= 0 ? 'text-[#22c55e]' : 'text-rose-500'}`}>
                                <ArrowDown size={10} strokeWidth={3} className={weeklyWeightChange > 0 ? 'rotate-180' : ''} />
                                {weeklyWeightChange > 0 ? '+' : ''}{weeklyWeightChange}kg this week
                            </p>
                        ) : (
                            <p className="text-[10px] font-medium text-slate-400">No data yet</p>
                        )}
                        {(() => {
                            const w = profile?.current_weight;
                            const h = profile?.height;
                            if (!w || !h) return null;
                            const bmi = +(w / ((h / 100) ** 2)).toFixed(1);
                            const { label, color } = bmi < 18.5
                                ? { label: 'Underweight', color: 'text-blue-500' }
                                : bmi < 25
                                    ? { label: 'Normal', color: 'text-[#22c55e]' }
                                    : bmi < 30
                                        ? { label: 'Overweight', color: 'text-[#f97316]' }
                                        : { label: 'Obese', color: 'text-rose-500' };
                            return (
                                <div className="flex items-center gap-1.5 mt-auto">
                                    <span className="text-xs font-black text-slate-900">BMI {bmi}</span>
                                    <span className={`text-[10px] font-bold ${color}`}>· {label}</span>
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* TODAY'S PROTOCOL */}
                <div className="px-6 mb-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2 text-slate-900">
                            <Calendar size={20} className="text-[#f97316]" strokeWidth={2.5} />
                            <h2 className="text-lg font-bold">Daily Protocol</h2>
                        </div>
                        <button
                            onClick={() => { localStorage.removeItem('weeklyPlan'); handleGeneratePlan(); }}
                            disabled={generatingPlan || !profile}
                            className="flex items-center gap-1.5 bg-orange-50 hover:bg-orange-100 disabled:opacity-40 text-[#f97316] border border-orange-200 text-[11px] font-black px-3 py-1.5 rounded-full transition-all active:scale-95"
                        >
                            {generatingPlan
                                ? <Loader2 size={12} className="animate-spin" />
                                : <span className="text-xs">✨</span>
                            }
                            {generatingPlan ? 'Generating...' : 'Regenerate'}
                        </button>
                    </div>

                    <div className="relative pl-5 space-y-6 before:absolute before:inset-y-6 before:left-[25px] before:w-[2px] before:bg-slate-100">

                        {/* Skeleton/Loading State */}
                        {loadingPlan && !plan && (
                            <div className="relative text-center py-8 ml-4">
                                <Loader2 size={24} className="animate-spin text-slate-300 mx-auto mb-2" />
                                <p className="text-xs font-bold text-slate-400">AI is drafting your plan...</p>
                            </div>
                        )}

                        {plan && (() => {
                            const activeDay = plan.days?.[selectedOffset];
                            if (!activeDay) return null;
                            return (
                                <>
                                    {/* Nutrition Tip */}
                                    {activeDay.nutritionTip && (
                                        <div className="relative animate-in fade-in slide-in-from-bottom-2 duration-500">
                                            <div className="absolute -left-[25px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[#f97316] ring-[6px] ring-[#f8f9fa] z-10"></div>
                                            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 ml-4">
                                                <div className="flex items-center gap-4 w-full">
                                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-xl shadow-inner">💡</div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-sm font-bold text-slate-900">Coach&apos;s Tip</h4>
                                                        <p className="text-[11px] text-slate-500 font-medium mt-0.5 pr-2 leading-relaxed">{activeDay.nutritionTip}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {/* Workout Day */}
                                    {activeDay.type === 'workout' && activeDay.exercises && (
                                        <div className="relative animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
                                            <div className="absolute -left-[25px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-slate-200 ring-[6px] ring-[#f8f9fa] z-10"></div>
                                            <div
                                                onClick={() => setIsWorkoutBriefOpen(true)}
                                                className={`bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col ml-4 transition-colors group hover:border-[#f97316]/50 cursor-pointer`}
                                            >
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-xl shadow-inner">🔥</div>
                                                        <div>
                                                            <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#f97316] transition-colors">{activeDay.focusArea || "Today's Workout"}</h4>
                                                            <p className="text-[11px] text-slate-500 font-medium mt-0.5">{activeDay.exercises.length} movements scheduled</p>
                                                        </div>
                                                    </div>
                                                    <div className="w-7 h-7 rounded-full bg-slate-50 border border-slate-100 text-slate-400 flex items-center justify-center mr-1">
                                                        <Clock size={14} strokeWidth={2.5} />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5 pl-14">
                                                    {activeDay.exercises.slice(0, 3).map((ex: { name: string; sets?: number; durationOrReps: string }, idx: number) => (
                                                        <div key={idx} className="flex justify-between items-end text-[11px] border-b border-slate-50 pb-1.5 last:border-0 last:pb-0">
                                                            <span className="font-bold text-slate-700">{ex.name}</span>
                                                            <span className="text-slate-400 font-bold bg-slate-50 px-2 py-0.5 rounded-md">{ex.sets ? `${ex.sets}x ` : ''}{ex.durationOrReps}</span>
                                                        </div>
                                                    ))}
                                                    {activeDay.exercises.length > 3 && (
                                                        <p className="text-[10px] text-slate-400 font-medium italic pt-1">+{activeDay.exercises.length - 3} more...</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {/* Rest Day */}
                                    {activeDay.type === 'rest' && (
                                        <div className="relative animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
                                            <div className="absolute -left-[25px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-slate-200 ring-[6px] ring-[#f8f9fa] z-10"></div>
                                            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-4 ml-4">
                                                <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-xl shadow-inner">🧘</div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-slate-900">Active Recovery</h4>
                                                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">Focus on mobility and stretching.</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {/* Quick Log Meal — today only */}
                                    {isToday && (
                                        <div className="relative pt-2 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200">
                                            <div className="absolute -left-[25px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-slate-200 ring-[6px] ring-[#f8f9fa] z-10"></div>
                                            <div
                                                onClick={() => setIsMealModalOpen(true)}
                                                className="bg-slate-50 rounded-2xl p-4 border border-dashed border-slate-300 flex items-center justify-center ml-4 cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-colors"
                                            >
                                                <Plus size={16} className="text-slate-500 mr-2" />
                                                <span className="text-xs font-bold text-slate-600">Quick Log Meal</span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            );
                        })()}

                    </div>
                </div>
            </div>

            {/* Meal Logging Modal */}
            {
                isMealModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/40 z-[60] flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl border border-slate-100">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-bold text-lg text-slate-900">Log Meal</h3>
                                <button onClick={() => setIsMealModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-2">
                                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="mb-8">
                                <label className="block text-sm font-bold text-slate-700 mb-2">Calories (kcal)</label>
                                <input
                                    type="number"
                                    placeholder="e.g. 450"
                                    value={mealCalories}
                                    onChange={(e) => setMealCalories(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-xl font-bold text-slate-900 focus:ring-2 focus:ring-[#f97316] focus:outline-none transition-all"
                                    autoFocus
                                />
                            </div>

                            <button
                                onClick={handleSaveMealLog}
                                className="w-full bg-[#f97316] hover:bg-orange-600 text-white font-extrabold py-4 rounded-xl transition-colors shadow-lg shadow-orange-500/30"
                            >
                                Save Meal Log
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Water Logging Modal */}
            {
                isWaterModalOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
                        <div
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in"
                            onClick={() => setIsWaterModalOpen(false)}
                        ></div>
                        <div className="bg-white rounded-[2rem] p-6 w-full max-w-sm relative z-10 shadow-2xl animate-in zoom-in-95 duration-200">
                            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-4 mx-auto border border-blue-100">
                                <Droplet className="text-blue-500" size={24} />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 text-center mb-2">Log Hydration</h3>
                            <p className="text-sm text-slate-500 text-center mb-6 font-medium">Enter amount in milliliters.</p>

                            <div className="relative mb-6">
                                <input
                                    type="number"
                                    value={waterInputMl}
                                    onChange={(e) => setWaterInputMl(e.target.value)}
                                    placeholder="e.g. 500"
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-4 text-center text-3xl font-black text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-sans"
                                    autoFocus
                                />
                                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold">ml</span>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setIsWaterModalOpen(false)}
                                    className="py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitCustomWater}
                                    disabled={!waterInputMl || isNaN(parseInt(waterInputMl))}
                                    className="py-3 rounded-xl font-bold text-white bg-[#f97316] hover:bg-orange-600 disabled:opacity-50 transition-colors shadow-lg shadow-orange-500/30"
                                >
                                    Log It
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Workout Brief Modal */}
            {
                isWorkoutBriefOpen && plan?.days?.[selectedOffset]?.type === 'workout' && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <div
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in"
                            onClick={() => setIsWorkoutBriefOpen(false)}
                        ></div>
                        <div className="bg-white rounded-[2rem] p-6 w-full max-w-md relative z-10 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
                            {/* Header */}
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-xl shadow-inner">🔥</div>
                                    <div>
                                        <h3 className="text-lg font-black text-slate-900">{plan.days[selectedOffset].focusArea || "Workout Routine"}</h3>
                                        <p className="text-xs font-medium text-slate-500">{plan.days[selectedOffset].exercises?.length || 0} movements scheduled</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsWorkoutBriefOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-2.5 transition-colors">
                                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Scrollable Content */}
                            <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-3 mb-6">
                                {plan.days[selectedOffset].exercises?.map((ex: any, idx: number) => (
                                    <div key={idx} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex justify-between items-center group hover:border-[#f97316]/30 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[10px] font-black text-slate-400 shadow-sm">
                                                {idx + 1}
                                            </div>
                                            <span className="font-bold text-slate-700">{ex.name}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-[#f97316] font-black text-[13px]">{ex.durationOrReps}</span>
                                            {ex.sets && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{ex.sets} Sets</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Footer */}
                            <div className="pt-2 border-t border-slate-100 mt-auto">
                                {isToday ? (
                                    <Link
                                        href="/log?plan=today"
                                        className="w-full bg-[#f97316] hover:bg-orange-600 text-white font-extrabold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-orange-500/30"
                                    >
                                        <span>Start Workout</span>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                                    </Link>
                                ) : (
                                    <button
                                        onClick={() => setIsWorkoutBriefOpen(false)}
                                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-4 rounded-xl transition-colors"
                                    >
                                        Close Details
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

        </div >
    );
}
