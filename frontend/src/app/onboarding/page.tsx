"use client";

import { useState } from "react";
import { getPB } from "@/lib/pb";
import { useRouter } from "next/navigation";
import { MoveRight, Loader2, Target, Weight, Ruler, Dumbbell, CheckCircle2, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";

const EQUIPMENT_OPTIONS = [
    { id: "jump_rope", label: "Jump Rope", emoji: "〰️" },
    { id: "dumbbells", label: "Dumbbells", emoji: "🏋️" },
    { id: "resistance_bands", label: "Resistance Bands", emoji: "🎽" },
    { id: "pull_up_bar", label: "Pull-up Bar", emoji: "🔩" },
    { id: "kettlebell", label: "Kettlebell", emoji: "⚫" },
    { id: "gym", label: "Commercial Gym", emoji: "🏢" },
    { id: "none", label: "Home Workout", emoji: "🤸" },
];

const TOTAL_STEPS = 4;

export default function OnboardingPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState("");
    const [error, setError] = useState("");
    const [isPremiumError, setIsPremiumError] = useState(false);
    const [isPremiumUser, setIsPremiumUser] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const [currentWeight, setCurrentWeight] = useState("");
    const [goalWeight, setGoalWeight] = useState("");
    const [height, setHeight] = useState("");
    const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);

    const handleNext = () => setStep(prev => prev + 1);
    const handleBack = () => setStep(prev => prev - 1);

    const toggleEquipment = (id: string) => {
        setSelectedEquipment(prev => {
            // "gym" is exclusive 
            if (id === "gym") return prev.includes("gym") ? [] : ["gym"];
            // Selecting any home equipment clears "gym"
            const withoutGym = prev.filter(e => e !== "gym");
            return withoutGym.includes(id) ? withoutGym.filter(e => e !== id) : [...withoutGym, id];
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            setError("You must be logged in to complete onboarding.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const pb = getPB();

            // 1. Save/update the user's profile
            setLoadingMsg("Saving your profile...");
            const profiles = await pb.collection("profiles_db").getFullList({
                filter: `user = "${user.id}"`,
            });

            if (profiles.length > 0) {
                await pb.collection("profiles_db").update(profiles[0].id, {
                    current_weight: parseFloat(currentWeight),
                    goal_weight: parseFloat(goalWeight),
                    height: parseFloat(height),
                });
            } else {
                await pb.collection("profiles_db").create({
                    user: user.id,
                    current_weight: parseFloat(currentWeight),
                    goal_weight: parseFloat(goalWeight),
                    height: parseFloat(height),
                });
            }

            // 2. Determine how many weeks to generate (Free = 1 week, Premium = 4 weeks)
            let isPremium = false;
            try {
                // Fetch fresh user data to be 100% sure of their status
                const userRecord = await pb.collection('users').getOne(user.id);
                isPremium = !!userRecord.is_premium;
            } catch (e) {
                console.error("Failed to check premium status, defaulting to Free tier.");
            }

            setIsPremiumUser(isPremium);
            const weeksToGenerate = isPremium ? 4 : 1;

            // 3. Call AI to generate the plans
            for (let i = 0; i < weeksToGenerate; i++) {
                if (isPremium) {
                    setLoadingMsg(`Generating Week ${i + 1} of 4...`);
                } else {
                    setLoadingMsg("Generating your Free 7-Day Plan...");
                }

                const res = await fetch(process.env.NEXT_PUBLIC_API_URL + "/generate-plan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userId: user.id,
                        currentWeight: parseFloat(currentWeight),
                        goalWeight: parseFloat(goalWeight),
                        equipment: selectedEquipment,
                        weekOffset: i, // <--- Tells API to shift start_date logic
                    }),
                });

                if (res.status === 403) {
                    setIsPremiumError(true);
                    setLoading(false);
                    setLoadingMsg("");
                    return; // Stop the loop immediately
                }

                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || `Failed to generate Week ${i + 1}. Please try again.`);
                }
            }

            // 4. After all weeks succeed, show the success screen
            localStorage.setItem('momentum_onboarded', 'true');
            setLoading(false);
            setIsSuccess(true);
        } catch (err: any) {
            console.error("Onboarding error:", err);
            setError(err.message || "Something went wrong. Please try again.");
            setLoading(false);
            setLoadingMsg("");
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans relative overflow-hidden">

            {/* Progress Bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-200">
                <div
                    className="h-full bg-[#18A058] transition-all duration-500 ease-out"
                    style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                />
            </div>

            <div className="flex-1 flex flex-col max-w-md w-full mx-auto px-6 pt-20 pb-12 relative z-10">

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl font-medium text-center mb-6">
                        {error}
                    </div>
                )}

                {/* Success Screen */}
                {isSuccess && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-in zoom-in-95 duration-500 text-center">
                        <div className="w-24 h-24 bg-[#18A058]/10 rounded-full flex items-center justify-center mb-4">
                            <span className="text-5xl">🎉</span>
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 mb-4">You're all set!</h1>
                            <p className="text-slate-600 mb-6 text-lg max-w-sm mx-auto leading-relaxed">
                                {isPremiumUser
                                    ? "Thank you for upgrading. Your personalised 4-week premium plan has been generated by our AI."
                                    : "Your personalised 7-day fitness and nutrition plan has been generated by our AI."
                                }
                            </p>
                            <div className="bg-slate-100 p-6 rounded-2xl text-left mb-8 shadow-inner shadow-slate-200/50">
                                <p className="font-bold text-slate-900 mb-2">What to do next:</p>
                                <ul className="space-y-3 text-slate-600">
                                    <li className="flex gap-2 items-start opacity-0 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 fill-mode-forwards"><CheckCircle2 className="text-[#18A058] shrink-0 w-5 h-5 mt-0.5" /> Check your daily dashboard</li>
                                    <li className="flex gap-2 items-start opacity-0 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 fill-mode-forwards"><CheckCircle2 className="text-[#18A058] shrink-0 w-5 h-5 mt-0.5" /> Log your workouts as you do them</li>
                                    <li className="flex gap-2 items-start opacity-0 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 fill-mode-forwards"><CheckCircle2 className="text-[#18A058] shrink-0 w-5 h-5 mt-0.5" /> Hit your new nutrition targets</li>
                                </ul>
                            </div>
                        </div>
                        <button
                            onClick={() => router.push("/")}
                            className="w-full bg-[#18A058] text-white font-bold text-xl rounded-2xl px-4 py-5 hover:bg-[#138046] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-xl shadow-[#18A058]/30"
                        >
                            Go to my Dashboard <MoveRight size={24} />
                        </button>
                    </div>
                )}

                {/* Premium Required Screen */}
                {!isSuccess && isPremiumError && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-in fade-in duration-500 text-center">
                        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center">
                            <Lock size={36} className="text-amber-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-slate-900">Premium Feature</p>
                            <p className="text-slate-500 mt-2 text-base max-w-xs">
                                AI plan generation is available for premium members. Contact us to unlock your plan.
                            </p>
                        </div>
                        <button
                            onClick={() => setIsPremiumError(false)}
                            className="text-sm text-slate-400 underline underline-offset-2"
                        >
                            Go back
                        </button>
                    </div>
                )}

                {/* Loading Overlay */}
                {!isSuccess && loading && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-in fade-in duration-500">
                        <div className="w-20 h-20 bg-[#18A058]/10 rounded-full flex items-center justify-center">
                            <Loader2 size={40} className="animate-spin text-[#18A058]" />
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-black text-slate-900">Hang tight!</p>
                            <p className="text-slate-500 mt-2 text-base">{loadingMsg}</p>
                        </div>
                    </div>
                )}

                {/* Step 1: Current Weight */}
                {!isSuccess && !loading && !isPremiumError && step === 1 && (
                    <div className="flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-right-8 duration-500">
                        <div className="w-16 h-16 bg-blue-100 text-blue-500 rounded-2xl flex items-center justify-center mb-6">
                            <Weight size={32} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Let's set your baseline.</h1>
                        <p className="text-slate-500 mb-10 text-lg">First, what is your current weight? We'll use this to calculate your daily caloric needs.</p>

                        <div className="relative">
                            <span className="absolute right-6 top-1/2 -translate-y-1/2 font-bold text-slate-400">kg</span>
                            <input
                                type="number" step="0.1" value={currentWeight}
                                onChange={(e) => setCurrentWeight(e.target.value)}
                                placeholder="85.0"
                                className="w-full bg-white border-2 border-slate-200 text-slate-900 text-center text-4xl rounded-3xl px-6 py-8 outline-none focus:border-[#18A058] transition-all font-black placeholder:text-slate-300 shadow-sm"
                                autoFocus
                            />
                        </div>

                        <div className="mt-auto pt-8">
                            <button
                                onClick={handleNext}
                                disabled={!currentWeight || parseFloat(currentWeight) <= 0}
                                className="w-full bg-slate-900 text-white font-bold text-lg rounded-2xl px-4 py-5 hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:active:scale-100 shadow-xl shadow-slate-900/20"
                            >
                                Continue <MoveRight size={20} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Height */}
                {!isSuccess && !loading && !isPremiumError && step === 2 && (
                    <div className="flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-right-8 duration-500">
                        <div className="w-16 h-16 bg-purple-100 text-purple-500 rounded-2xl flex items-center justify-center mb-6">
                            <Ruler size={32} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">How tall are you?</h1>
                        <p className="text-slate-500 mb-10 text-lg">Height helps our AI determine your ideal BMI range and fine-tune your nutrition.</p>

                        <div className="relative">
                            <span className="absolute right-6 top-1/2 -translate-y-1/2 font-bold text-slate-400">cm</span>
                            <input
                                type="number" value={height}
                                onChange={(e) => setHeight(e.target.value)}
                                placeholder="175"
                                className="w-full bg-white border-2 border-slate-200 text-slate-900 text-center text-4xl rounded-3xl px-6 py-8 outline-none focus:border-[#18A058] transition-all font-black placeholder:text-slate-300 shadow-sm"
                                autoFocus
                            />
                        </div>

                        <div className="mt-auto pt-8 flex gap-3">
                            <button onClick={handleBack} className="w-1/3 bg-slate-200 text-slate-600 font-bold text-lg rounded-2xl px-4 py-5 hover:bg-slate-300 active:scale-[0.98] transition-all">
                                Back
                            </button>
                            <button
                                onClick={handleNext}
                                disabled={!height || parseFloat(height) <= 0}
                                className="w-2/3 bg-slate-900 text-white font-bold text-lg rounded-2xl px-4 py-5 hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:active:scale-100 shadow-xl shadow-slate-900/20"
                            >
                                Continue <MoveRight size={20} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Goal Weight */}
                {!isSuccess && !loading && !isPremiumError && step === 3 && (
                    <div className="flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-right-8 duration-500">
                        <div className="w-16 h-16 bg-[#18A058]/10 text-[#18A058] rounded-2xl flex items-center justify-center mb-6">
                            <Target size={32} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Set your target.</h1>
                        <p className="text-slate-500 mb-10 text-lg">What is your goal weight? We'll build a plan specifically to get you there.</p>

                        <div className="relative">
                            <span className="absolute right-6 top-1/2 -translate-y-1/2 font-bold text-slate-400">kg</span>
                            <input
                                type="number" step="0.1" value={goalWeight}
                                onChange={(e) => setGoalWeight(e.target.value)}
                                placeholder="68.0"
                                className="w-full bg-white border-2 border-[#18A058] text-[#18A058] text-center text-4xl rounded-3xl px-6 py-8 outline-none focus:ring-4 focus:ring-[#18A058]/20 transition-all font-black shadow-lg shadow-[#18A058]/10 placeholder:text-[#18A058]/30"
                                autoFocus
                            />
                        </div>

                        <div className="mt-auto pt-8 flex gap-3">
                            <button onClick={handleBack} className="w-1/3 bg-slate-200 text-slate-600 font-bold text-lg rounded-2xl px-4 py-5 hover:bg-slate-300 active:scale-[0.98] transition-all">
                                Back
                            </button>
                            <button
                                onClick={handleNext}
                                disabled={!goalWeight || parseFloat(goalWeight) <= 0}
                                className="w-2/3 bg-slate-900 text-white font-bold text-lg rounded-2xl px-4 py-5 hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:active:scale-100 shadow-xl shadow-slate-900/20"
                            >
                                Continue <MoveRight size={20} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 4: Equipment */}
                {!isSuccess && !loading && !isPremiumError && step === 4 && (
                    <div className="flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-right-8 duration-500">
                        <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-2xl flex items-center justify-center mb-6">
                            <Dumbbell size={32} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">What's in your gym?</h1>
                        <p className="text-slate-500 mb-8 text-lg">Select all the equipment you have access to. Your AI plan will be tailored to it.</p>

                        <div className="grid grid-cols-2 gap-3">
                            {EQUIPMENT_OPTIONS.map(opt => {
                                const selected = selectedEquipment.includes(opt.id);
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => toggleEquipment(opt.id)}
                                        className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 font-semibold text-sm transition-all active:scale-95
                                            ${selected
                                                ? "bg-[#18A058]/10 border-[#18A058] text-[#18A058]"
                                                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                                            }`}
                                    >
                                        {selected && (
                                            <CheckCircle2 size={16} className="absolute top-2 right-2 text-[#18A058]" />
                                        )}
                                        <span className="text-2xl">{opt.emoji}</span>
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-auto pt-8 flex gap-3">
                            <button onClick={handleBack} className="w-1/3 bg-slate-200 text-slate-600 font-bold text-lg rounded-2xl px-4 py-5 hover:bg-slate-300 active:scale-[0.98] transition-all">
                                Back
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={selectedEquipment.length === 0 || loading}
                                className="w-2/3 bg-[#18A058] text-white font-bold text-lg rounded-2xl px-4 py-5 hover:bg-[#138046] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:active:scale-100 shadow-xl shadow-[#18A058]/30"
                            >
                                Build My Plan <MoveRight size={20} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Ambient Background */}
            <div className={`absolute -top-[20%] -right-[10%] w-[500px] h-[500px] rounded-full blur-3xl z-0 pointer-events-none transition-colors duration-1000
                ${step === 1 ? 'bg-blue-400/10' : step === 2 ? 'bg-purple-400/10' : step === 3 ? 'bg-[#18A058]/10' : 'bg-orange-400/10'}`}
            />
        </div>
    );
}
