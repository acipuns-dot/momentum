'use client';

import { useState, useEffect, useRef } from 'react';
import {
    ArrowLeft, Play, Pause, StopCircle, Flame, Clock, Activity,
    MessageSquare, CheckCircle2, Zap, Wind, Bike, Dumbbell,
    PersonStanding, Timer, ChevronRight, ChevronLeft
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { getPB } from '@/lib/pb';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityType = {
    id: string; label: string; icon: React.ReactNode;
    color: string; bg: string; intensity: string; kcalPerMin: number;
};

type LogEntry = {
    id: string; activity: string; icon: string;
    durationMins: number; effort: number; kcalBurned: number; notes: string; time: string;
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const ACTIVITIES: ActivityType[] = [
    { id: 'walk', label: 'Walking', icon: <PersonStanding size={26} />, color: 'text-teal-600', bg: 'bg-teal-50', intensity: 'Low', kcalPerMin: 4 },
    { id: 'run', label: 'Running', icon: <Zap size={26} />, color: 'text-red-500', bg: 'bg-red-50', intensity: 'High', kcalPerMin: 10 },
    { id: 'cycle', label: 'Cycling', icon: <Bike size={26} />, color: 'text-blue-500', bg: 'bg-blue-50', intensity: 'Cardio', kcalPerMin: 7 },
    { id: 'hiit', label: 'HIIT', icon: <Flame size={26} />, color: 'text-orange-500', bg: 'bg-orange-50', intensity: 'Intense', kcalPerMin: 12 },
    { id: 'jump', label: 'Jump Rope', icon: <Wind size={26} />, color: 'text-primary-600', bg: 'bg-primary-50', intensity: 'High', kcalPerMin: 11 },
    { id: 'strength', label: 'Strength', icon: <Dumbbell size={26} />, color: 'text-purple-500', bg: 'bg-purple-50', intensity: 'Build', kcalPerMin: 6 },
    { id: 'yoga', label: 'Yoga', icon: <Timer size={26} />, color: 'text-indigo-500', bg: 'bg-indigo-50', intensity: 'Low', kcalPerMin: 3 },
    { id: 'other', label: 'Other', icon: <Activity size={26} />, color: 'text-slate-500', bg: 'bg-slate-100', intensity: 'Mixed', kcalPerMin: 5 },
];

const ACTIVITY_EMOJIS: Record<string, string> = {
    walk: '🚶', run: '🏃', cycle: '🚴', hiit: '🔥', jump: '🪢', strength: '💪', yoga: '🧘', other: '⚡️'
};

// ─── Jump Rope Config ─────────────────────────────────────────────────────────
// defaultRpm = typical jumps per minute for a recreational user per style

const SESSION_TYPES = [
    { id: 'single', label: 'Single Under', emoji: '🔵', desc: 'Beginner', kcalMult: 1.0, defaultRpm: 120 },
    { id: 'double', label: 'Double Under', emoji: '🟠', desc: 'Intermediate', kcalMult: 1.3, defaultRpm: 80 },
    { id: 'triple', label: 'Triple Under', emoji: '🔴', desc: 'Advanced', kcalMult: 1.7, defaultRpm: 55 },
    { id: 'crossover', label: 'Crossover', emoji: '🟣', desc: 'Skill', kcalMult: 1.2, defaultRpm: 90 },
];

const INTERVAL_MODES = [
    { id: 'free', label: 'Free Run', desc: 'No intervals · Go at your own pace', workSecs: 0, restSecs: 0, rounds: 0, kcalRange: 'Depends on time' },
    { id: 'tabata', label: 'Tabata', desc: '20s on / 10s rest × 8 rounds (~4 min)', workSecs: 20, restSecs: 10, rounds: 8, kcalRange: '~44–75 kcal (warm-up)' },
    { id: 'boxing', label: 'Boxing Rounds', desc: '3 min / 1 min rest × 8 rounds (~32 min)', workSecs: 180, restSecs: 60, rounds: 8, kcalRange: '~350–590 kcal' },
    { id: 'endurance', label: 'Endurance', desc: '5 min / 90s rest × 5 rounds (~32 min)', workSecs: 300, restSecs: 90, rounds: 5, kcalRange: '~360–600 kcal' },
];

const fmt = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkoutLoggerPage() {
    const { user } = useAuth();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [selected, setSelected] = useState<ActivityType | null>(null);
    const [phase, setPhase] = useState<'pick' | 'jump_setup' | 'jump_countdown' | 'active' | 'done'>('pick');

    // Generic timer
    const [elapsed, setElapsed] = useState(0);
    const [running, setRunning] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Post-workout form
    const [effort, setEffort] = useState(7);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    // Jump Rope state
    const [sessionType, setSessionType] = useState(SESSION_TYPES[0]);
    const [intervalMode, setIntervalMode] = useState(INTERVAL_MODES[0]);
    const [jumpGifUrl, setJumpGifUrl] = useState<string | null>(null);
    const [jumpCount, setJumpCount] = useState(0); // editable in post-workout
    // Countdown
    const [countdown, setCountdown] = useState(15);
    // Interval tracking
    const [intervalState, setIntervalState] = useState<'work' | 'rest'>('work');
    const [intervalElapsed, setIntervalElapsed] = useState(0);
    const [currentRound, setCurrentRound] = useState(1);
    const [jumpWorkSecs, setJumpWorkSecs] = useState(0); // only counts during work phase

    // Fetch jump rope GIF once on mount
    useEffect(() => {
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/exercises?name=jump+rope&limit=1`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.gifUrl) setJumpGifUrl(data.gifUrl); })
            .catch(() => { });
    }, []);

    // Load today's logs
    useEffect(() => {
        if (!user) return;
        (async () => {
            const pb = getPB();
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
            try {
                const records = await pb.collection('activity_logs_db').getFullList({
                    filter: `user = "${user.id}" && date >= "${today.toISOString()}" && date < "${tomorrow.toISOString()}"`,
                    sort: '-created',
                });
                setLogs(records.map(r => {
                    const at = ACTIVITIES.find(a => a.label === r.activity);
                    return {
                        id: r.id, activity: r.activity,
                        icon: at ? ACTIVITY_EMOJIS[at.id] : '⚡️',
                        durationMins: r.duration_mins, effort: r.effort_level,
                        kcalBurned: r.kcal_burned || 0, notes: r.notes || '',
                        time: new Date(r.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                    };
                }));
            } catch (e) { console.error(e); }
        })();
    }, [user]);

    // Main timer (only when active and running)
    useEffect(() => {
        if (running && phase === 'active') {
            intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [running, phase]);

    // 15-second countdown timer
    useEffect(() => {
        if (phase !== 'jump_countdown') return;
        if (countdown <= 0) {
            // Start the real session
            setPhase('active');
            setRunning(true);
            return;
        }
        const t = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [phase, countdown]);

    // Interval sub-timer (Tabata / Boxing / Custom)
    useEffect(() => {
        if (!running || intervalMode.id === 'free' || phase !== 'active') return;
        const mode = intervalMode;
        const tick = setInterval(() => {
            setIntervalElapsed(prev => {
                const limit = intervalState === 'work' ? mode.workSecs : mode.restSecs;
                if (prev + 1 >= limit) {
                    if (intervalState === 'work') {
                        setIntervalState('rest');
                    } else {
                        setCurrentRound(r => {
                            if (r >= mode.rounds) { setRunning(false); setPhase('done'); return r; }
                            return r + 1;
                        });
                        setIntervalState('work');
                    }
                    return 0;
                }
                return prev + 1;
            });
        }, 1000);
        return () => clearInterval(tick);
    }, [running, intervalMode, intervalState, phase]);

    // Jump-work-only timer — pauses during REST so estimate is accurate
    useEffect(() => {
        if (!running || phase !== 'active') return;
        const countingDown = intervalMode.id !== 'free' && intervalState === 'rest';
        if (countingDown) return;
        const t = setInterval(() => setJumpWorkSecs(s => s + 1), 1000);
        return () => clearInterval(t);
    }, [running, phase, intervalMode.id, intervalState]);

    const startActivity = (activity: ActivityType) => {
        if (activity.id === 'jump') { setSelected(activity); setPhase('jump_setup'); return; }
        setSelected(activity); setElapsed(0); setRunning(true); setPhase('active');
    };

    const startJumpRope = () => {
        setElapsed(0);
        setJumpWorkSecs(0);
        setIntervalState('work'); setIntervalElapsed(0); setCurrentRound(1);
        setCountdown(15);
        setPhase('jump_countdown');
    };

    const stopWorkout = () => {
        setRunning(false);
        const estimatedJumps = Math.round((jumpWorkSecs / 60) * sessionType.defaultRpm);
        setJumpCount(estimatedJumps);
        setPhase('done');
    };

    const resetAll = () => {
        setPhase('pick'); setSelected(null); setElapsed(0);
        setEffort(7); setNotes(''); setJumpCount(0); setJumpWorkSecs(0);
        setIntervalState('work'); setIntervalElapsed(0); setCurrentRound(1);
    };

    const saveLog = async () => {
        if (!selected || !user) return;
        setSaving(true);
        const durationMins = Math.max(Math.round(elapsed / 60), 1);
        const kcalMult = selected.id === 'jump' ? sessionType.kcalMult : 1;
        const kcalBurned = Math.round(selected.kcalPerMin * durationMins * kcalMult);
        const rpm = jumpCount > 0 && elapsed > 0 ? Math.round((jumpCount / elapsed) * 60) : 0;
        const extraNotes = selected.id === 'jump'
            ? `[${sessionType.label} · ${intervalMode.label}] Jumps: ${jumpCount}${rpm > 0 ? ` · RPM: ${rpm}` : ''}${notes ? ` | ${notes}` : ''}`
            : notes;

        try {
            const pb = getPB();
            const record = await pb.collection('activity_logs_db').create({
                user: user.id, date: new Date().toISOString(),
                activity: selected.label, duration_mins: durationMins,
                effort_level: effort, kcal_burned: kcalBurned, notes: extraNotes,
            });
            setLogs(prev => [{
                id: record.id, activity: selected.label,
                icon: ACTIVITY_EMOJIS[selected.id] || '⚡️',
                durationMins, effort, kcalBurned, notes: extraNotes,
                time: new Date(record.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            }, ...prev]);
        } catch (e) { console.error('Failed to save log', e); }
        finally { setSaving(false); resetAll(); }
    };

    const totalKcal = logs.reduce((s, l) => s + l.kcalBurned, 0);
    const totalMins = logs.reduce((s, l) => s + l.durationMins, 0);
    const estimatedJumps = Math.round((elapsed / 60) * sessionType.defaultRpm);
    const rpm = jumpCount > 0 && elapsed > 0 ? Math.round((jumpCount / elapsed) * 60) : 0;
    const isJump = selected?.id === 'jump';

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-28">

            {/* Header */}
            <div className="bg-white px-6 pt-12 pb-5 border-b border-slate-100 shadow-sm sticky top-0 z-10">
                <div className="flex items-center gap-3 mb-1">
                    {phase === 'jump_setup' ? (
                        <button onClick={() => setPhase('pick')} className="text-slate-400 hover:text-slate-700">
                            <ChevronLeft size={22} />
                        </button>
                    ) : (
                        <Link href="/" className="text-slate-400 hover:text-slate-700 transition-colors">
                            <ArrowLeft size={22} />
                        </Link>
                    )}
                    <h1 className="text-2xl font-extrabold text-slate-900">
                        {phase === 'jump_setup' ? 'Jump Rope Setup' : 'Activity Logger'}
                    </h1>
                </div>
                <div className="flex gap-3 mt-4">
                    <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-100 rounded-full px-3 py-1.5">
                        <Flame size={14} className="text-orange-400" />
                        <span className="text-xs font-bold text-orange-600">{totalKcal} kcal</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-full px-3 py-1.5">
                        <Clock size={14} className="text-blue-400" />
                        <span className="text-xs font-bold text-blue-600">{totalMins} min</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-primary-50 border border-primary-100 rounded-full px-3 py-1.5">
                        <Activity size={14} className="text-primary-500" />
                        <span className="text-xs font-bold text-primary-600">{logs.length} sessions</span>
                    </div>
                </div>
            </div>

            <div className="px-6 pt-6 space-y-8">

                {/* ══ PHASE: PICK ══════════════════════════════════════════════ */}
                {phase === 'pick' && (
                    <>
                        <div>
                            <h2 className="text-base font-extrabold text-slate-900 mb-1">Quick Log</h2>
                            <p className="text-xs text-slate-400 font-medium mb-4">Tap an activity to start the timer</p>
                            <div className="grid grid-cols-4 gap-3">
                                {ACTIVITIES.map(act => (
                                    <button key={act.id} onClick={() => startActivity(act)}
                                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl ${act.bg} border border-transparent hover:border-slate-200 active:scale-95 transition-all`}>
                                        <span className={act.color}>{act.icon}</span>
                                        <span className="text-[10px] font-bold text-slate-700 leading-tight text-center">{act.label}</span>
                                        <span className="text-[9px] font-semibold text-slate-400">{act.intensity}</span>
                                    </button>
                                ))}
                            </div>
                            <Link href="/exercises"
                                className="mt-3 flex items-center justify-between w-full bg-white border border-slate-200 rounded-2xl px-4 py-3.5 hover:border-primary-300 transition-colors shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-lg">🎯</div>
                                    <div>
                                        <p className="font-bold text-slate-900 text-sm">Exercise Library</p>
                                        <p className="text-xs text-slate-400">Browse 1,300+ exercises with GIFs</p>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
                            </Link>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-base font-extrabold text-slate-900">Recent Logs</h2>
                                {logs.length > 0 && <span className="text-xs font-semibold text-slate-400">Today</span>}
                            </div>
                            {logs.length === 0 ? (
                                <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-10 flex flex-col items-center justify-center text-center">
                                    <span className="text-4xl mb-3">🏃</span>
                                    <p className="font-bold text-slate-700">No workouts logged yet</p>
                                    <p className="text-xs text-slate-400 mt-1">Pick an activity above to get started</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {logs.map(log => (
                                        <div key={log.id} className="bg-white rounded-2xl px-4 py-3.5 flex items-center justify-between border border-slate-100 shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center text-xl">{log.icon}</div>
                                                <div>
                                                    <p className="font-bold text-slate-900 text-sm">{log.activity}</p>
                                                    <p className="text-xs text-slate-400 mt-0.5">{log.time}&nbsp;·&nbsp;{log.durationMins} mins</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 bg-orange-50 rounded-full px-2.5 py-1">
                                                <Flame size={12} className="text-orange-400" />
                                                <span className="text-xs font-bold text-orange-500">+{log.kcalBurned}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* ══ PHASE: JUMP ROPE SETUP ════════════════════════════════════ */}
                {phase === 'jump_setup' && (
                    <div className="space-y-6">
                        <div className="flex flex-col items-center py-4">
                            {jumpGifUrl && (
                                <div className="w-32 h-32 rounded-3xl overflow-hidden border-2 border-primary-100 mb-3 bg-white shadow-sm">
                                    <img src={jumpGifUrl} alt="Jump Rope" className="w-full h-full object-cover" />
                                </div>
                            )}
                            <p className="text-xs font-semibold text-slate-400">Configure your session before jumping</p>
                        </div>

                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Session Type</p>
                            <div className="grid grid-cols-2 gap-2">
                                {SESSION_TYPES.map(st => (
                                    <button key={st.id} onClick={() => setSessionType(st)}
                                        className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${sessionType.id === st.id ? 'border-primary-500 bg-primary-50' : 'border-slate-100 bg-white'}`}>
                                        <span className="text-2xl">{st.emoji}</span>
                                        <div className="text-left">
                                            <p className={`text-xs font-bold ${sessionType.id === st.id ? 'text-primary-700' : 'text-slate-800'}`}>{st.label}</p>
                                            <p className="text-[10px] text-slate-400">{st.desc} · ~{st.defaultRpm} RPM</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Interval Mode</p>
                            <div className="space-y-2">
                                {INTERVAL_MODES.map(mode => (
                                    <button key={mode.id} onClick={() => setIntervalMode(mode)}
                                        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 transition-all ${intervalMode.id === mode.id ? 'border-primary-500 bg-primary-50' : 'border-slate-100 bg-white'}`}>
                                        <div className="text-left">
                                            <p className={`text-sm font-bold ${intervalMode.id === mode.id ? 'text-primary-700' : 'text-slate-800'}`}>{mode.label}</p>
                                            <p className="text-xs text-slate-400">{mode.desc}</p>
                                            <p className={`text-xs font-bold mt-0.5 ${intervalMode.id === mode.id ? 'text-primary-500' : 'text-slate-500'}`}>{mode.kcalRange}</p>
                                        </div>
                                        {intervalMode.id === mode.id && (
                                            <div className="w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                                                <CheckCircle2 size={12} className="text-white" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button onClick={startJumpRope}
                            className="w-full py-4 bg-primary-600 hover:bg-primary-500 text-white font-extrabold rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-primary-500/30 text-base active:scale-95">
                            <Play size={20} /> Start Jumping
                        </button>
                    </div>
                )}

                {/* ══ PHASE: 15s COUNTDOWN ══════════════════════════════════════ */}
                {phase === 'jump_countdown' && (
                    <div className="flex flex-col items-center justify-center py-16 gap-6">
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Get Ready!</p>
                        <div className="relative w-48 h-48 flex items-center justify-center">
                            {/* Animated ring */}
                            <svg className="absolute w-48 h-48 -rotate-90" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="44" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                                <circle cx="50" cy="50" r="44" fill="none" stroke="#f97316" strokeWidth="8"
                                    strokeLinecap="round"
                                    strokeDasharray={`${2 * Math.PI * 44}`}
                                    strokeDashoffset={`${2 * Math.PI * 44 * (countdown / 15)}`}
                                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                                />
                            </svg>
                            <span className="text-7xl font-black text-slate-900 tabular-nums">{countdown}</span>
                        </div>
                        <div className="text-center">
                            <p className="text-base font-bold text-slate-700">{sessionType.emoji} {sessionType.label}</p>
                            <p className="text-xs text-slate-400 mt-1">{intervalMode.label} · Pick up your rope!</p>
                        </div>
                        <button onClick={resetAll} className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors mt-2">
                            Cancel
                        </button>
                    </div>
                )}

                {/* ══ PHASE: ACTIVE TIMER ══════════════════════════════════════ */}
                {phase === 'active' && selected && (
                    <div className="flex flex-col items-center">

                        {isJump ? (
                            <>
                                <div className="flex gap-2 mb-5">
                                    <span className="bg-primary-50 text-primary-700 text-xs font-bold px-3 py-1.5 rounded-full border border-primary-100">
                                        {sessionType.emoji} {sessionType.label}
                                    </span>
                                    <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-full">
                                        {intervalMode.label}
                                    </span>
                                </div>

                                {/* Interval banner */}
                                {intervalMode.id !== 'free' && (
                                    <div className={`w-full rounded-2xl px-5 py-3 mb-4 flex items-center justify-between ${intervalState === 'work' ? 'bg-primary-500' : 'bg-slate-700'}`}>
                                        <div>
                                            <p className="text-white text-xs font-bold uppercase tracking-widest">
                                                {intervalState === 'work' ? '🏃 JUMP' : '😮‍💨 REST'}
                                            </p>
                                            <p className="text-white/70 text-[10px]">Round {currentRound} / {intervalMode.rounds}</p>
                                        </div>
                                        <span className="text-3xl font-black text-white tabular-nums">
                                            {fmt((intervalState === 'work' ? intervalMode.workSecs : intervalMode.restSecs) - intervalElapsed)}
                                        </span>
                                    </div>
                                )}

                                {/* Stats strip */}
                                <div className="w-full grid grid-cols-3 gap-3 mb-6">
                                    <div className="bg-white rounded-2xl p-4 text-center border border-slate-100 shadow-sm">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Time</p>
                                        <p className="text-xl font-black text-slate-900 tabular-nums">{fmt(elapsed)}</p>
                                    </div>
                                    <div className="bg-white rounded-2xl p-4 text-center border border-slate-100 shadow-sm">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Est. Jumps</p>
                                        <p className="text-xl font-black text-primary-600 tabular-nums">{estimatedJumps}</p>
                                    </div>
                                    <div className="bg-white rounded-2xl p-4 text-center border border-slate-100 shadow-sm">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Kcal</p>
                                        <p className="text-xl font-black text-orange-500 tabular-nums">
                                            ~{Math.round(selected.kcalPerMin * sessionType.kcalMult * Math.max(elapsed / 60, 0.1))}
                                        </p>
                                    </div>
                                </div>

                                <div className="bg-primary-50 border border-primary-100 rounded-2xl px-5 py-3 w-full text-center mb-6">
                                    <p className="text-xs font-semibold text-primary-600">
                                        Est. {sessionType.defaultRpm} RPM · Jumps auto-counted. Correct after done.
                                    </p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={`w-20 h-20 rounded-3xl ${selected.bg} flex items-center justify-center mb-4`}>
                                    <span className={selected.color}>{selected.icon}</span>
                                </div>
                                <h2 className="text-xl font-extrabold text-slate-900 mb-1">{selected.label}</h2>
                                <p className="text-xs font-semibold text-slate-400 mb-10">{selected.intensity} Intensity</p>
                                <div className="bg-white rounded-3xl px-12 py-8 shadow-sm border border-slate-100 text-center mb-8 w-full">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Duration</p>
                                    <span className="text-6xl font-black text-slate-900 tabular-nums tracking-tight">{fmt(elapsed)}</span>
                                    <p className="text-sm font-semibold text-slate-400 mt-3">
                                        ~{Math.round(selected.kcalPerMin * Math.max(elapsed / 60, 0.1))} kcal burned
                                    </p>
                                </div>
                            </>
                        )}

                        <div className="flex gap-4 w-full">
                            <button onClick={() => setRunning(r => !r)}
                                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold text-sm shadow-sm hover:bg-slate-50 transition-colors">
                                {running ? <><Pause size={18} /> Pause</> : <><Play size={18} /> Resume</>}
                            </button>
                            <button onClick={stopWorkout}
                                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-900 text-white font-bold text-sm shadow-lg hover:bg-slate-700 transition-colors">
                                <StopCircle size={18} /> Done
                            </button>
                        </div>
                        <button onClick={resetAll} className="mt-4 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors">
                            Cancel session
                        </button>
                    </div>
                )}

                {/* ══ PHASE: POST-WORKOUT FORM ════════════════════════════════ */}
                {phase === 'done' && selected && (
                    <div className="space-y-5">
                        {/* Summary */}
                        <div className="bg-slate-900 rounded-3xl p-5 text-white">
                            <p className="text-xs font-semibold text-slate-400 mb-3">Session Complete 🎉</p>
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-2xl font-black">{selected.label}</p>
                                    <p className="text-slate-400 text-sm mt-1">
                                        {fmt(elapsed)}&nbsp;·&nbsp;
                                        ~{Math.round(selected.kcalPerMin * (isJump ? sessionType.kcalMult : 1) * Math.max(elapsed / 60, 0.1))} kcal
                                    </p>
                                </div>
                                <div className={`w-14 h-14 rounded-2xl ${selected.bg} flex items-center justify-center text-2xl`}>
                                    {ACTIVITY_EMOJIS[selected.id]}
                                </div>
                            </div>
                        </div>

                        {/* Jump Rope — editable jump count */}
                        {isJump && (
                            <>
                                <div className="bg-primary-50 rounded-2xl p-4 border border-primary-100 flex gap-4">
                                    <div className="text-center flex-1">
                                        <p className="text-[10px] font-bold text-primary-400 uppercase tracking-wider">Style</p>
                                        <p className="text-sm font-black text-primary-700 mt-1">{sessionType.emoji} {sessionType.label}</p>
                                    </div>
                                    <div className="text-center flex-1">
                                        <p className="text-[10px] font-bold text-primary-400 uppercase tracking-wider">Mode</p>
                                        <p className="text-sm font-black text-primary-700 mt-1">{intervalMode.label}</p>
                                    </div>
                                    {rpm > 0 && (
                                        <div className="text-center flex-1">
                                            <p className="text-[10px] font-bold text-primary-400 uppercase tracking-wider">RPM</p>
                                            <p className="text-sm font-black text-primary-700 mt-1">{rpm}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                                        Total Jumps
                                    </label>
                                    <p className="text-[11px] text-slate-400 mb-3">Auto-estimated from your session. Correct if needed.</p>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setJumpCount(c => Math.max(0, c - 10))}
                                            className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 font-bold text-lg flex items-center justify-center hover:bg-slate-200 transition-colors">−</button>
                                        <input
                                            type="number"
                                            value={jumpCount}
                                            onChange={e => setJumpCount(Math.max(0, parseInt(e.target.value) || 0))}
                                            className="flex-1 text-center text-3xl font-black text-primary-600 bg-primary-50 border border-primary-100 rounded-2xl py-3 focus:outline-none focus:ring-2 focus:ring-primary-300"
                                        />
                                        <button onClick={() => setJumpCount(c => c + 10)}
                                            className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 font-bold text-lg flex items-center justify-center hover:bg-slate-200 transition-colors">+</button>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Effort */}
                        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                            <div className="flex justify-between items-end mb-4">
                                <label className="flex items-center gap-2 font-extrabold text-slate-900">
                                    <Activity size={18} className="text-orange-500" /> Effort Level
                                </label>
                                <span className="text-xs font-semibold text-slate-400">1 Easy → 10 Max</span>
                            </div>
                            <div className="flex gap-1.5">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(l => (
                                    <button key={l} onClick={() => setEffort(l)}
                                        className={`flex-1 h-11 rounded-xl font-bold text-sm transition-all ${effort >= l
                                            ? l > 7 ? 'bg-orange-500 text-white' : l > 4 ? 'bg-primary-500 text-white' : 'bg-blue-500 text-white'
                                            : 'bg-slate-100 text-slate-400'}`}>
                                        {l}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                            <label className="flex items-center gap-2 font-extrabold text-slate-900 mb-3">
                                <MessageSquare size={18} className="text-indigo-500" /> Notes & Soreness
                            </label>
                            <p className="text-xs text-slate-400 font-medium mb-3">Help the AI adapt your next session.</p>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)}
                                placeholder="E.g., Felt great! Calves are a bit tight."
                                className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-medium text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-primary-400 focus:outline-none resize-none transition-all" />
                        </div>

                        <button onClick={saveLog} disabled={saving}
                            className="w-full bg-primary-600 hover:bg-primary-500 disabled:bg-primary-300 text-white font-extrabold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-primary-500/30 text-base">
                            {saving ? 'Saving...' : <><CheckCircle2 size={20} /> Save Session</>}
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
}
