'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronRight, Flame } from 'lucide-react';
import { calcNutritionTargets } from '@/lib/nutritionTargets';
import { getPB } from '@/lib/pb';
import { useAuth } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type Meal = {
    id: string;
    name: string;
    category: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
    kcal: number;
    protein: number; // grams
    carbs: number;
    fat: number;
};

type Category = Meal['category'];

// ─── Quick-pick presets ───────────────────────────────────────────────────────

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
    Breakfast: { emoji: '🌅', color: 'text-amber-500', bg: 'bg-amber-50' },
    Lunch: { emoji: '☀️', color: 'text-orange-500', bg: 'bg-orange-50' },
    Dinner: { emoji: '🌙', color: 'text-indigo-500', bg: 'bg-indigo-50' },
    Snack: { emoji: '🍎', color: 'text-emerald-500', bg: 'bg-emerald-50' },
};

const ORDERED_CATEGORIES: Category[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);
const today = new Date().toISOString().slice(0, 10);
const STORAGE_KEY = `nutrition_log_${today}`;

const loadMeals = (): Meal[] => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};

const saveMeals = (meals: Meal[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meals));
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function NutritionPage() {
    const [meals, setMeals] = useState<Meal[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<Category>('Breakfast');

    // Modal form state
    const [form, setForm] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
    const [usePreset, setUsePreset] = useState(true);

    // Load from localStorage on mount
    useEffect(() => {
        setMeals(loadMeals());
    }, []);

    // Persist whenever meals changes
    useEffect(() => {
        if (meals.length >= 0) saveMeals(meals);
    }, [meals]);

    // Derived totals
    const totalKcal = meals.reduce((s, m) => s + m.kcal, 0);
    const totalProtein = meals.reduce((s, m) => s + m.protein, 0);
    const totalCarbs = meals.reduce((s, m) => s + m.carbs, 0);
    const totalFat = meals.reduce((s, m) => s + m.fat, 0);

    const { user } = useAuth();
    const [profile, setProfile] = useState<any>(null);

    useEffect(() => {
        if (!user) return;
        getPB().collection('profiles_db').getFullList({ filter: `user = "${user.id}"` })
            .then(res => setProfile(res[0] || null))
            .catch(console.error);
    }, [user]);

    // AI plan takes priority; fallback to profile-based BMR calculation
    const plan = (() => {
        try { return JSON.parse(localStorage.getItem('weeklyPlan') || 'null'); } catch { return null; }
    })();
    const computed = calcNutritionTargets(profile);
    const targetKcal = plan?.targetKcal || computed.targetKcal;
    const targetProtein = plan?.targetProtein || computed.targetProtein;
    const targetCarbs = plan?.targetCarbs || computed.targetCarbs;
    const targetFat = plan?.targetFat || computed.targetFat;

    const remaining = Math.max(targetKcal - totalKcal, 0);
    const kcalPct = Math.min((totalKcal / targetKcal) * 100, 100);

    const addPreset = (preset: Omit<Meal, 'id'>) => {
        const next = [...meals, { ...preset, id: uid() }];
        setMeals(next);
    };

    const addCustom = () => {
        if (!form.name || !form.kcal) return;
        const next: Meal = {
            id: uid(),
            name: form.name,
            category: activeCategory,
            kcal: Number(form.kcal),
            protein: Number(form.protein) || 0,
            carbs: Number(form.carbs) || 0,
            fat: Number(form.fat) || 0,
        };
        setMeals(prev => [...prev, next]);
        setForm({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
        setIsModalOpen(false);
    };

    const removeMeal = (id: string) => setMeals(prev => prev.filter(m => m.id !== id));

    const mealsByCategory = (cat: Category) => meals.filter(m => m.category === cat);
    const presetsForCategory = PRESETS.filter(p => p.category === activeCategory);

    return (
        <div className="min-h-screen bg-slate-50 pb-28 font-sans">

            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="bg-white px-6 pt-12 pb-6 border-b border-slate-100 shadow-sm sticky top-0 z-10">
                <div className="flex justify-between items-start mb-5">
                    <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today</p>
                        <h1 className="text-2xl font-extrabold text-slate-900 mt-0.5">Nutrition Diary</h1>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-10 h-10 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-md shadow-primary-500/30 hover:bg-primary-600 active:scale-95 transition-all"
                    >
                        <Plus size={20} strokeWidth={3} />
                    </button>
                </div>

                {/* Calorie summary bar */}
                <div className="flex justify-between text-xs font-semibold mb-2">
                    <span className="text-slate-500">Consumed</span>
                    <span className="text-slate-900 font-bold">{totalKcal} <span className="text-slate-400 font-medium">/ {targetKcal} kcal</span></span>
                    <span className="text-primary-600">{remaining} left</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary-500 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${kcalPct}%` }}
                    />
                </div>

                {/* Macro pills */}
                <div className="flex gap-3 mt-4">
                    {[
                        { label: 'Protein', val: totalProtein, target: targetProtein, color: 'bg-blue-500' },
                        { label: 'Carbs', val: totalCarbs, target: targetCarbs, color: 'bg-orange-400' },
                        { label: 'Fat', val: totalFat, target: targetFat, color: 'bg-red-400' },
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

            {/* ── Meal Sections ─────────────────────────────────────────────── */}
            <div className="px-6 pt-6 space-y-6">
                {ORDERED_CATEGORIES.map(cat => {
                    const catMeals = mealsByCategory(cat);
                    const { emoji, color, bg } = CATEGORY_META[cat];
                    const catKcal = catMeals.reduce((s, m) => s + m.kcal, 0);

                    return (
                        <div key={cat}>
                            {/* Section header */}
                            <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-2">
                                    <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center text-base`}>{emoji}</div>
                                    <span className="font-extrabold text-slate-900">{cat}</span>
                                    {catKcal > 0 && (
                                        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                                            <Flame size={11} className="text-orange-400" />
                                            {catKcal} kcal
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => { setActiveCategory(cat); setIsModalOpen(true); }}
                                    className={`text-xs font-bold ${color} flex items-center gap-0.5`}
                                >
                                    Add <Plus size={13} strokeWidth={3} />
                                </button>
                            </div>

                            {/* Meal items */}
                            {catMeals.length > 0 ? (
                                <div className="space-y-2">
                                    {catMeals.map(meal => (
                                        <div key={meal.id} className="bg-white rounded-2xl px-4 py-3 flex items-center justify-between border border-slate-100 shadow-sm">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-slate-900 text-sm truncate">{meal.name}</p>
                                                <p className="text-xs text-slate-400 mt-0.5">
                                                    {meal.kcal} kcal &nbsp;·&nbsp; P {meal.protein}g &nbsp;·&nbsp; C {meal.carbs}g &nbsp;·&nbsp; F {meal.fat}g
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => removeMeal(meal.id)}
                                                className="ml-4 w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-400 transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <button
                                    onClick={() => { setActiveCategory(cat); setIsModalOpen(true); }}
                                    className="w-full bg-white border border-dashed border-slate-200 rounded-2xl py-4 text-xs font-semibold text-slate-400 hover:border-primary-300 hover:text-primary-500 transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Plus size={13} strokeWidth={3} /> Log {cat}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Add Meal Modal ────────────────────────────────────────────── */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 z-[60] flex items-end justify-center backdrop-blur-sm">
                    <div className="bg-white rounded-t-3xl w-full max-w-md p-6 pb-10 shadow-2xl">

                        {/* Modal Header */}
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="font-extrabold text-lg text-slate-900">Add to {activeCategory}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-700">
                                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Category Switcher */}
                        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
                            {ORDERED_CATEGORIES.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setActiveCategory(cat)}
                                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeCategory === cat ? 'bg-primary-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}
                                >
                                    {CATEGORY_META[cat].emoji} {cat}
                                </button>
                            ))}
                        </div>

                        {/* Toggle: Presets / Custom */}
                        <div className="flex bg-slate-100 rounded-2xl p-1 mb-5">
                            <button onClick={() => setUsePreset(true)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${usePreset ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Quick Picks</button>
                            <button onClick={() => setUsePreset(false)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${!usePreset ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Custom</button>
                        </div>

                        {/* Quick Pick Presets */}
                        {usePreset && (
                            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                {presetsForCategory.length === 0 && (
                                    <p className="text-sm text-center text-slate-400 py-6">No presets for this category.</p>
                                )}
                                {presetsForCategory.map((p, i) => (
                                    <button
                                        key={i}
                                        onClick={() => { addPreset(p); setIsModalOpen(false); }}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 flex items-center justify-between hover:bg-primary-50 hover:border-primary-200 active:scale-[0.98] transition-all"
                                    >
                                        <div className="text-left">
                                            <p className="font-bold text-slate-900 text-sm">{p.name}</p>
                                            <p className="text-xs text-slate-400 mt-0.5">{p.kcal} kcal · P {p.protein}g · C {p.carbs}g · F {p.fat}g</p>
                                        </div>
                                        <ChevronRight size={16} className="text-slate-300 flex-shrink-0 ml-2" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Custom Entry Form */}
                        {!usePreset && (
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    placeholder="Meal name (e.g. Chicken Wrap)"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-primary-400 focus:outline-none"
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Calories *</label>
                                        <input type="number" placeholder="e.g. 450" value={form.kcal} onChange={e => setForm(f => ({ ...f, kcal: e.target.value }))}
                                            className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-primary-400 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Protein (g)</label>
                                        <input type="number" placeholder="e.g. 35" value={form.protein} onChange={e => setForm(f => ({ ...f, protein: e.target.value }))}
                                            className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-primary-400 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Carbs (g)</label>
                                        <input type="number" placeholder="e.g. 45" value={form.carbs} onChange={e => setForm(f => ({ ...f, carbs: e.target.value }))}
                                            className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-primary-400 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Fat (g)</label>
                                        <input type="number" placeholder="e.g. 12" value={form.fat} onChange={e => setForm(f => ({ ...f, fat: e.target.value }))}
                                            className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-primary-400 focus:outline-none" />
                                    </div>
                                </div>
                                <button
                                    onClick={addCustom}
                                    disabled={!form.name || !form.kcal}
                                    className="w-full mt-2 bg-primary-600 hover:bg-primary-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold py-4 rounded-xl transition-colors shadow-lg shadow-primary-500/20"
                                >
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
