'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Search, Loader2, ChevronRight, X, Dumbbell } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

// ─── Types ────────────────────────────────────────────────────────────────────

type Exercise = {
    id: string;
    name: string;
    target: string;
    bodyPart: string;
    equipment: string;
    gifUrl: string;
    secondaryMuscles: string[];
    instructions: string[];
};

// ─── Target groups mapped to ExerciseDB target values ────────────────────────
const TARGETS = [
    { label: 'Cardio', value: 'cardiovascular system', emoji: '🏃' },
    { label: 'Abs', value: 'abs', emoji: '🔥' },
    { label: 'Quads', value: 'quads', emoji: '🦵' },
    { label: 'Chest', value: 'pectorals', emoji: '💪' },
    { label: 'Back', value: 'upper back', emoji: '🔙' },
    { label: 'Shoulders', value: 'delts', emoji: '🏋️' },
    { label: 'Glutes', value: 'glutes', emoji: '🍑' },
    { label: 'Calves', value: 'calves', emoji: '🦿' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExercisesPage() {
    const [selected, setSelected] = useState(TARGETS[0]);
    const [exercises, setExercises] = useState<Exercise[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [detail, setDetail] = useState<Exercise | null>(null);
    const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
    const chipRowRef = useRef<HTMLDivElement>(null);

    // Emoji fallback based on body part
    const getBodyPartEmoji = (bodyPart: string) => {
        const map: Record<string, string> = {
            cardio: '🏃', abs: '🔥', waist: '🔥', back: '🔙',
            chest: '💪', shoulders: '🏋️', 'upper legs': '🦵',
            'lower legs': '🦿', 'upper arms': '💪', 'lower arms': '🦾',
        };
        return map[bodyPart?.toLowerCase()] || '🏋️';
    };

    const fetchByTarget = useCallback(async (target: string) => {
        setLoading(true);
        setError('');
        setExercises([]);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/exercises?target=${encodeURIComponent(target)}&limit=12`);
            if (!res.ok) throw new Error('API error');
            const data = await res.json();
            setExercises(Array.isArray(data) ? data : []);
        } catch {
            setError('Could not load exercises. Check your API key.');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchBySearch = useCallback(async (name: string) => {
        if (!name.trim()) return;
        setLoading(true);
        setError('');
        setExercises([]);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/exercises?name=${encodeURIComponent(name.trim())}&limit=12`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            // name search returns a single object, wrap it
            setExercises(Array.isArray(data) ? data : [data]);
        } catch {
            setError('Exercise not found. Try a different name.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Load first target on mount
    useEffect(() => { fetchByTarget(selected.value); }, []);

    const handleTargetClick = (t: typeof TARGETS[0], el?: HTMLButtonElement | null) => {
        setSelected(t);
        setSearch('');
        fetchByTarget(t.value);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    };

    return (
        <div className="min-h-screen momentum-bg dot-grid-subtle font-sans pb-28 ui-page">

            {/* ── Header ───────────────────────────────────────────────── */}
            <div className="ui-glass-strong surface-violet px-6 pt-12 pb-5 border-b border-slate-100 ui-card sticky top-0 z-10">
                <div className="flex items-center gap-3 mb-4">
                    <Link href="/log" className="text-slate-400 hover:text-slate-700 transition-colors">
                        <ArrowLeft size={22} />
                    </Link>
                    <h1 className="text-2xl font-extrabold text-slate-900">Exercise Library</h1>
                </div>

                {/* Search bar */}
                <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search exercise (e.g. push up)"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && fetchBySearch(search)}
                        className="w-full ui-glass rounded-2xl pl-10 pr-10 py-3 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                    {search && (
                        <button onClick={() => { setSearch(''); fetchByTarget(selected.value); }}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                            <X size={15} />
                        </button>
                    )}
                </div>
            </div>

            <div className="px-6 pt-5 space-y-5">
                {/* ── Target chips ────────────────────────────────────────── */}
                {!search && (
                <div ref={chipRowRef} className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                        {TARGETS.map(t => (
                            <button
                                key={t.value}
                                ref={el => { if (selected.value === t.value && el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }}
                                onClick={e => handleTargetClick(t, e.currentTarget)}
                                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${selected.value === t.value
                                    ? 'accent-gradient text-white ui-elevated'
                                    : 'ui-glass border border-slate-200 text-slate-600 hover:border-slate-300'}`}
                            >
                                <span>{t.emoji}</span> {t.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* ── Loading / Error ─────────────────────────────────────── */}
                {loading && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Loader2 size={32} className="text-primary-500 animate-spin" />
                        <p className="text-sm font-semibold text-slate-400">Fetching exercises...</p>
                    </div>
                )}

                {error && !loading && (
                    <div className="surface-rose border rounded-2xl p-5 text-center">
                        <p className="text-sm font-bold text-red-500">{error}</p>
                    </div>
                )}

                {/* ── Search CTA while typing ──────────────────────────────── */}
                {search && !loading && exercises.length === 0 && (
                    <button
                        onClick={() => fetchBySearch(search)}
                        className="w-full accent-gradient text-white font-extrabold py-4 rounded-2xl flex items-center justify-center gap-2 ui-elevated"
                    >
                        <Search size={18} /> Search "{search}"
                    </button>
                )}

                {/* ── Exercise Grid ───────────────────────────────────────── */}
                {!loading && exercises.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                        {exercises.map(ex => (
                            <button
                                key={ex.id}
                                onClick={() => setDetail(ex)}
                            className="ui-glass surface-blue rounded-2xl border border-slate-100 ui-card overflow-hidden text-left active:scale-[0.97] transition-all hover:border-primary-200 hover:-translate-y-0.5"
                            >
                                {/* GIF or Placeholder */}
                                <div className="w-full aspect-square bg-slate-100 relative overflow-hidden">
                                    {!imgErrors[ex.id] ? (
                                        <img
                                            src={`${process.env.NEXT_PUBLIC_API_URL}/exercise-gif?id=${ex.id}`}
                                            alt={ex.name}
                                            className="w-full h-full object-cover"
                                            onError={() => setImgErrors(prev => ({ ...prev, [ex.id]: true }))}
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                                            <span className="text-4xl">{getBodyPartEmoji(ex.bodyPart)}</span>
                                            <span className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider capitalize">{ex.bodyPart}</span>
                                        </div>
                                    )}
                                </div>
                                {/* Info */}
                                <div className="p-3">
                                    <p className="font-bold text-slate-900 text-xs capitalize leading-tight line-clamp-2">{ex.name}</p>
                                    <p className="text-xs font-semibold text-slate-400 mt-1 capitalize">{ex.target} · {ex.equipment}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Detail Modal ──────────────────────────────────────────────── */}
            {detail && (
                <div className="fixed inset-0 bg-slate-900/50 z-[60] flex items-end sm:items-center justify-center backdrop-blur-sm px-3 sm:px-4" onClick={() => setDetail(null)}>
                    <div
                        className="ui-glass-strong surface-violet rounded-t-3xl sm:rounded-[2rem] w-full max-w-md mx-auto p-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] max-h-[90vh] overflow-y-auto ui-elevated border border-slate-100"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Close */}
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="font-extrabold text-lg text-slate-900 capitalize">{detail.name}</h2>
                            <button onClick={() => setDetail(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Big GIF */}
                        <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-slate-100 mb-5">
                            <img
                                src={`${process.env.NEXT_PUBLIC_API_URL}/exercise-gif?id=${detail.id}`}
                                alt={detail.name}
                                className="w-full h-full object-cover"
                            />
                        </div>

                        {/* Meta chips */}
                        <div className="flex flex-wrap gap-2 mb-5">
                            {[detail.bodyPart, detail.target, detail.equipment].map(tag => (
                                <span key={tag} className="ui-glass text-slate-600 text-xs font-bold px-3 py-1 rounded-full capitalize border border-slate-200">{tag}</span>
                            ))}
                        </div>

                        {/* Secondary muscles */}
                        {detail.secondaryMuscles?.length > 0 && (
                            <div className="mb-5">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Also works</p>
                                <div className="flex flex-wrap gap-2">
                                    {detail.secondaryMuscles.map(m => (
                                        <span key={m} className="surface-emerald text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full capitalize border">{m}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Instructions */}
                        {detail.instructions?.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">How to do it</p>
                                <div className="space-y-3">
                                    {detail.instructions.map((step, i) => (
                                        <div key={i} className="flex gap-3">
                                            <div className="w-6 h-6 rounded-full accent-gradient text-white text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
                                            <p className="text-sm text-slate-600 font-medium leading-relaxed">{step}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
