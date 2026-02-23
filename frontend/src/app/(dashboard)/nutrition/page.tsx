'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Flame } from 'lucide-react';
import { calcNutritionTargets } from '@/lib/nutritionTargets';
import { getPB } from '@/lib/pb';
import { useAuth } from '@/lib/auth';

type Meal = {
    id: string;
    name: string;
    category: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
};

type Category = Meal['category'];

const PRESETS: Omit<Meal, 'id'>[] = [
    { name: 'Oatmeal & Berries', category: 'Breakfast', kcal: 350, protein: 10, carbs: 60, fat: 7 },
    { name: 'Scrambled Eggs (2)', category: 'Breakfast', kcal: 180, protein: 14, carbs: 2, fat: 12 },
    { name: 'Grilled Chicken Salad', category: 'Lunch', kcal: 420, protein: 42, carbs: 18, fat: 14 },
    { name: 'Brown Rice + Tuna', category: 'Lunch', kcal: 480, protein: 38, carbs: 55, fat: 6 },
    { name: 'Salmon with Quinoa', category: 'Dinner', kcal: 550, protein: 40, carbs: 40, fat: 18 },
    { name: 'Stir-Fry Veggies', category: 'Dinner', kcal: 310, protein: 12, carbs: 38, fat: 9 },
    { name: 'Greek Yogurt & Honey', category: 'Snack', kcal: 150, protein: 10, carbs: 18, fat: 4 },
    { name: 'Banana', category: 'Snack', kcal: 90, protein: 1, carbs: 23, fat: 0 },
];

const CATEGORY_META: Record<Category, { emoji: string; color: string; bg: string }> = {
    Breakfast: { emoji: 'Sunrise', color: 'text-amber-500', bg: 'bg-amber-50' },
    Lunch: { emoji: 'Day', color: 'text-orange-500', bg: 'bg-orange-50' },
    Dinner: { emoji: 'Night', color: 'text-indigo-500', bg: 'bg-indigo-50' },
    Snack: { emoji: 'Snack', color: 'text-emerald-500', bg: 'bg-emerald-50' },
};

const ORDERED_CATEGORIES: Category[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

const uid = () => Math.random().toString(36).slice(2, 9);

export default function NutritionPage() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<{ current_weight?: number; goal_weight?: number; activity_level?: string } | null>(null);
    const [meals, setMeals] = useState<Meal[]>([]);
    const [loggedKcal, setLoggedKcal] = useState(0);
    const [loggedProtein, setLoggedProtein] = useState(0);
    const [loggedCarbs, setLoggedCarbs] = useState(0);
    const [loggedFat, setLoggedFat] = useState(0);
    const [nutritionRecordId, setNutritionRecordId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<Category>('Breakfast');
    const [form, setForm] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
    const [usePreset, setUsePreset] = useState(true);

    useEffect(() => {
        if (!user) return;
        const pb = getPB();

        pb.collection('profiles_db').getFullList({ filter: `user = "${user.id}"` })
            .then((res) => {
                const first = res[0];
                if (!first) {
                    setProfile(null);
                    return;
                }
                setProfile({
                    current_weight: typeof first.current_weight === 'number' ? first.current_weight : undefined,
                    goal_weight: typeof first.goal_weight === 'number' ? first.goal_weight : undefined,
                    activity_level: typeof first.activity_level === 'string' ? first.activity_level : undefined,
                });
            })
            .catch(console.error);

        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        pb.collection('nutrition_targets_db').getFullList({
            filter: `user = "${user.id}" && date >= "${start.toISOString()}" && date < "${end.toISOString()}"`,
        })
            .then((records) => {
                if (records.length > 0) {
                    setNutritionRecordId(records[0].id);
                    setLoggedKcal(records[0].logged_kcal || 0);
                    setLoggedProtein(records[0].logged_protein_g || 0);
                    setLoggedCarbs(records[0].logged_carbs_g || 0);
                    setLoggedFat(records[0].logged_fat_g || 0);
                } else {
                    setNutritionRecordId(null);
                    setLoggedKcal(0);
                    setLoggedProtein(0);
                    setLoggedCarbs(0);
                    setLoggedFat(0);
                }
            })
            .catch(console.error);
    }, [user]);

    const plan = useMemo(() => {
        if (typeof window === 'undefined') return null;
        try {
            return JSON.parse(localStorage.getItem('weeklyPlan') || 'null');
        } catch {
            return null;
        }
    }, []);

    const computed = calcNutritionTargets(profile);
    const targetKcal = plan?.targetKcal || computed.targetKcal;
    const targetProtein = plan?.targetProtein || computed.targetProtein;
    const targetCarbs = plan?.targetCarbs || computed.targetCarbs;
    const targetFat = plan?.targetFat || computed.targetFat;

    const remaining = Math.max(targetKcal - loggedKcal, 0);
    const kcalPct = Math.min((loggedKcal / targetKcal) * 100, 100);

    const mealsByCategory = (cat: Category) => meals.filter((m) => m.category === cat);
    const presetsForCategory = PRESETS.filter((p) => p.category === activeCategory);

    const syncLoggedNutrition = async (
        nextKcal: number,
        nextProtein: number,
        nextCarbs: number,
        nextFat: number
    ) => {
        if (!user) return;
        const pb = getPB();
        if (nutritionRecordId) {
            await pb.collection('nutrition_targets_db').update(nutritionRecordId, {
                logged_kcal: nextKcal,
                logged_protein_g: nextProtein,
                logged_carbs_g: nextCarbs,
                logged_fat_g: nextFat,
            });
            return;
        }

        const created = await pb.collection('nutrition_targets_db').create({
            user: user.id,
            date: new Date().toISOString(),
            target_kcal: targetKcal,
            logged_kcal: nextKcal,
            protein_g: targetProtein,
            carbs_g: targetCarbs,
            fat_g: targetFat,
            logged_protein_g: nextProtein,
            logged_carbs_g: nextCarbs,
            logged_fat_g: nextFat,
        });
        setNutritionRecordId(created.id);
    };

    const updateLoggedNutrition = async (
        deltaKcal: number,
        deltaProtein: number,
        deltaCarbs: number,
        deltaFat: number
    ) => {
        const nextKcal = Math.max(loggedKcal + deltaKcal, 0);
        const nextProtein = Math.max(loggedProtein + deltaProtein, 0);
        const nextCarbs = Math.max(loggedCarbs + deltaCarbs, 0);
        const nextFat = Math.max(loggedFat + deltaFat, 0);

        setLoggedKcal(nextKcal);
        setLoggedProtein(nextProtein);
        setLoggedCarbs(nextCarbs);
        setLoggedFat(nextFat);

        try {
            await syncLoggedNutrition(nextKcal, nextProtein, nextCarbs, nextFat);
        } catch (error) {
            console.error('Failed to sync nutrition log', error);
        }
    };

    const addPreset = async (preset: Omit<Meal, 'id'>) => {
        const meal = { ...preset, id: uid() };
        setMeals((prev) => [...prev, meal]);
        await updateLoggedNutrition(meal.kcal, meal.protein, meal.carbs, meal.fat);
        setIsModalOpen(false);
    };

    const addCustom = async () => {
        if (!form.name || !form.kcal) return;
        const meal: Meal = {
            id: uid(),
            name: form.name,
            category: activeCategory,
            kcal: Number(form.kcal),
            protein: Number(form.protein) || 0,
            carbs: Number(form.carbs) || 0,
            fat: Number(form.fat) || 0,
        };
        setMeals((prev) => [...prev, meal]);
        await updateLoggedNutrition(meal.kcal, meal.protein, meal.carbs, meal.fat);
        setForm({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
        setIsModalOpen(false);
    };

    const removeMeal = async (id: string) => {
        const meal = meals.find((m) => m.id === id);
        setMeals((prev) => prev.filter((m) => m.id !== id));
        if (meal) await updateLoggedNutrition(-meal.kcal, -meal.protein, -meal.carbs, -meal.fat);
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-28 font-sans">
            <div className="bg-white px-6 pt-12 pb-6 border-b border-slate-100 shadow-sm sticky top-0 z-10">
                <div className="flex justify-between items-start mb-5">
                    <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today</p>
                        <h1 className="text-2xl font-extrabold text-slate-900 mt-0.5">Nutrition Diary</h1>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-10 h-10 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-md shadow-primary-500/30"
                    >
                        <Plus size={20} strokeWidth={3} />
                    </button>
                </div>

                <div className="flex justify-between text-xs font-semibold mb-2">
                    <span className="text-slate-500">Consumed</span>
                    <span className="text-slate-900 font-bold">{loggedKcal} <span className="text-slate-400 font-medium">/ {targetKcal} kcal</span></span>
                    <span className="text-primary-600">{remaining} left</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full transition-all duration-500 ease-out" style={{ width: `${kcalPct}%` }} />
                </div>

                <div className="flex gap-3 mt-4">
                    {[
                        { label: 'Protein', val: loggedProtein, target: targetProtein, color: 'bg-blue-500' },
                        { label: 'Carbs', val: loggedCarbs, target: targetCarbs, color: 'bg-orange-400' },
                        { label: 'Fat', val: loggedFat, target: targetFat, color: 'bg-red-400' },
                    ].map(({ label, val, target, color }) => (
                        <div key={label} className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl p-2.5 flex flex-col items-center">
                            <div className="w-full h-1 bg-slate-200 rounded-full mb-2 overflow-hidden">
                                <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${Math.min((val / target) * 100, 100)}%` }} />
                            </div>
                            <span className="text-[11px] font-semibold text-slate-400">{label}</span>
                            <span className="text-sm font-bold text-slate-900">{val}g <span className="text-slate-300 font-medium text-xs">/ {target}g</span></span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="px-6 pt-6 space-y-6">
                {ORDERED_CATEGORIES.map((cat) => {
                    const catMeals = mealsByCategory(cat);
                    const { color, bg } = CATEGORY_META[cat];
                    const catKcal = catMeals.reduce((s, m) => s + m.kcal, 0);

                    return (
                        <div key={cat}>
                            <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-2">
                                    <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center text-[10px] font-bold text-slate-500`}>{cat}</div>
                                    <span className="font-extrabold text-slate-900">{cat}</span>
                                    {catKcal > 0 && (
                                        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                                            <Flame size={11} className="text-orange-400" />
                                            {catKcal} kcal
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => { setActiveCategory(cat); setIsModalOpen(true); }} className={`text-xs font-bold ${color} flex items-center gap-0.5`}>
                                    Add <Plus size={13} strokeWidth={3} />
                                </button>
                            </div>

                            {catMeals.length > 0 ? (
                                <div className="space-y-2">
                                    {catMeals.map((meal) => (
                                        <div key={meal.id} className="bg-white rounded-2xl px-4 py-3 flex items-center justify-between border border-slate-100 shadow-sm">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-slate-900 text-sm truncate">{meal.name}</p>
                                                <p className="text-xs text-slate-400 mt-0.5">
                                                    {meal.kcal} kcal · P {meal.protein}g · C {meal.carbs}g · F {meal.fat}g
                                                </p>
                                            </div>
                                            <button onClick={() => removeMeal(meal.id)} className="ml-4 w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-400">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <button onClick={() => { setActiveCategory(cat); setIsModalOpen(true); }} className="w-full bg-white border border-dashed border-slate-200 rounded-2xl py-4 text-xs font-semibold text-slate-400">
                                    <Plus size={13} strokeWidth={3} className="inline mr-1" /> Log {cat}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 z-[60] flex items-end justify-center backdrop-blur-sm">
                    <div className="bg-white rounded-t-3xl w-full max-w-md p-6 pb-10 shadow-2xl">
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="font-extrabold text-lg text-slate-900">Add to {activeCategory}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">×</button>
                        </div>

                        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
                            {ORDERED_CATEGORIES.map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setActiveCategory(cat)}
                                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeCategory === cat ? 'bg-primary-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        <div className="flex bg-slate-100 rounded-2xl p-1 mb-5">
                            <button onClick={() => setUsePreset(true)} className={`flex-1 py-2 rounded-xl text-xs font-bold ${usePreset ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Quick Picks</button>
                            <button onClick={() => setUsePreset(false)} className={`flex-1 py-2 rounded-xl text-xs font-bold ${!usePreset ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Custom</button>
                        </div>

                        {usePreset && (
                            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                {presetsForCategory.map((preset, i) => (
                                    <button
                                        key={i}
                                        onClick={() => addPreset(preset)}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-left"
                                    >
                                        <p className="font-bold text-slate-900 text-sm">{preset.name}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">{preset.kcal} kcal · P {preset.protein}g · C {preset.carbs}g · F {preset.fat}g</p>
                                    </button>
                                ))}
                            </div>
                        )}

                        {!usePreset && (
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    placeholder="Meal name"
                                    value={form.name}
                                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900"
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="number" placeholder="Calories" value={form.kcal} onChange={(e) => setForm((f) => ({ ...f, kcal: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900" />
                                    <input type="number" placeholder="Protein (g)" value={form.protein} onChange={(e) => setForm((f) => ({ ...f, protein: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900" />
                                    <input type="number" placeholder="Carbs (g)" value={form.carbs} onChange={(e) => setForm((f) => ({ ...f, carbs: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900" />
                                    <input type="number" placeholder="Fat (g)" value={form.fat} onChange={(e) => setForm((f) => ({ ...f, fat: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900" />
                                </div>
                                <button onClick={addCustom} disabled={!form.name || !form.kcal} className="w-full mt-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold py-4 rounded-xl">
                                    Save Meal
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
