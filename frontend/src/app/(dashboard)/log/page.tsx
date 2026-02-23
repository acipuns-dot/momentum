'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, Pause, StopCircle, Flame, Clock, Activity, MessageSquare, CheckCircle2, Zap, Wind, Bike, Dumbbell, PersonStanding, Timer, ChevronRight, ChevronLeft, ChevronRightIcon, CheckCircle, Info, Volume2, VolumeX } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
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

const GUIDED_PLAYLIST = [
    '/audio/tabata-bg.mp3',
    '/audio/tabata-bg-2.mp3',
    '/audio/tabata-bg-3.mp3',
];
const GUIDED_MODIFIERS = {
    easy: { workSecs: 15, restSecs: 20, rounds: 6, label: 'Easy' },
    standard: { workSecs: 20, restSecs: 20, rounds: 8, label: 'Standard' },
    hard: { workSecs: 30, restSecs: 15, rounds: 10, label: 'Hard' },
} as const;
type GuidedModifierKey = keyof typeof GUIDED_MODIFIERS;
type GuidedExerciseMode = 'auto' | 'reps' | 'timed';

const fmt = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

interface Exercise {
    name: string;
    durationOrReps: string;
    sets?: number;
    gifUrl?: string;
    instructions?: string[];
    isLoadingGif?: boolean;
}

interface DailyPlan {
    focusArea: string;
    exercises: Exercise[];
}

const inferExerciseMode = (exercise: Exercise): 'reps' | 'timed' => {
    const text = (exercise.durationOrReps || '').toLowerCase();
    if (/(rep|reps)\b/.test(text)) return 'reps';
    if (/(sec|second|min|minute)\b/.test(text)) return 'timed';
    return 'reps';
};

const parseDurationSeconds = (text: string): number | null => {
    const t = text.toLowerCase();
    const minuteMatch = t.match(/(\d+)\s*(min|minute)/);
    if (minuteMatch) return parseInt(minuteMatch[1], 10) * 60;
    const secondMatch = t.match(/(\d+)\s*(sec|second)/);
    if (secondMatch) return parseInt(secondMatch[1], 10);
    return null;
};

const parseRepCount = (text: string): number | null => {
    const t = text.toLowerCase();
    const rangeMatch = t.match(/(\d+)\s*[-–]\s*(\d+)\s*reps?/);
    if (rangeMatch) {
        return Math.max(parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10));
    }
    const singleMatch = t.match(/(\d+)\s*reps?/);
    if (singleMatch) return parseInt(singleMatch[1], 10);
    return null;
};

const roundUpToFive = (secs: number): number => Math.ceil(secs / 5) * 5;

const isStrengthLikeExercise = (name: string): boolean => {
    const n = name.toLowerCase();
    return /(squat|deadlift|bench|press|row|curl|lunge|pull|push|raise|extension|fly)/.test(n);
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkoutLoggerPage() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const router = useRouter();
    const isPlanMode = searchParams.get('plan') === 'today';

    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [selected, setSelected] = useState<ActivityType | null>(null);
    const [phase, setPhase] = useState<'pick' | 'jump_setup' | 'jump_countdown' | 'active' | 'done' | 'guided_intro' | 'guided_active'>('pick');

    // --- Guided AI Workout State ---
    const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
    const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
    const [loadingPlan, setLoadingPlan] = useState(isPlanMode);
    const [guidedTabataEnabled, setGuidedTabataEnabled] = useState(true);
    const [guidedModifier, setGuidedModifier] = useState<GuidedModifierKey>('standard');
    const [guidedVoiceCoachOn, setGuidedVoiceCoachOn] = useState(true);
    const [guidedExerciseModeByIndex, setGuidedExerciseModeByIndex] = useState<Record<number, GuidedExerciseMode>>({});
    const [guidedIntervalState, setGuidedIntervalState] = useState<'work' | 'rest'>('work');
    const [guidedIntervalElapsed, setGuidedIntervalElapsed] = useState(0);
    const [guidedCurrentRound, setGuidedCurrentRound] = useState(1);
    const [guidedStartCountdown, setGuidedStartCountdown] = useState(0);
    const [guidedRoundsCompleted, setGuidedRoundsCompleted] = useState(0);
    const [guidedCompletedExercises, setGuidedCompletedExercises] = useState(0);
    const [showGuidedSummary, setShowGuidedSummary] = useState(false);
    const guidedVoiceRef = useRef<string>('');
    const guidedMilestoneVoiceRef = useRef<string>('');

    // Generic timer
    const [elapsed, setElapsed] = useState(0);
    const [running, setRunning] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const guidedMusicRef = useRef<HTMLAudioElement | null>(null);
    const [guidedMusicOn, setGuidedMusicOn] = useState(true);
    const [guidedPlaylistOrder, setGuidedPlaylistOrder] = useState<number[]>([]);
    const [guidedTrackCursor, setGuidedTrackCursor] = useState(0);

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

    const guidedConfig = GUIDED_MODIFIERS[guidedModifier];
    const currentGuidedExercise = dailyPlan?.exercises[currentExerciseIndex] || null;
    const currentOverrideMode = guidedExerciseModeByIndex[currentExerciseIndex] || 'auto';
    const currentEffectiveMode: 'reps' | 'timed' = currentGuidedExercise
        ? (currentOverrideMode === 'auto' ? inferExerciseMode(currentGuidedExercise) : currentOverrideMode)
        : 'timed';
    const currentStrengthLike = !!currentGuidedExercise && isStrengthLikeExercise(currentGuidedExercise.name);
    const parsedDurationSecs = currentGuidedExercise ? parseDurationSeconds(currentGuidedExercise.durationOrReps) : null;
    const parsedRepCount = currentGuidedExercise ? parseRepCount(currentGuidedExercise.durationOrReps) : null;
    const minWorkSecs = currentStrengthLike ? 40 : 20;
    const repsEstimatedSecs = parsedRepCount ? roundUpToFive(Math.max(20, parsedRepCount * 2.2)) : roundUpToFive(Math.max(20, guidedConfig.workSecs));
    const guidedWorkSecs = currentEffectiveMode === 'timed'
        ? Math.max(guidedConfig.workSecs, minWorkSecs, parsedDurationSecs || 0)
        : repsEstimatedSecs;
    const guidedRestSecs = guidedConfig.restSecs;
    const guidedTargetRounds = currentEffectiveMode === 'reps'
        ? Math.max(currentGuidedExercise?.sets || 3, 1)
        : guidedConfig.rounds;

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

            const todayStr = `${today.toISOString().split('T')[0]} 00:00:00.000Z`;
            const tomorrowStr = `${tomorrow.toISOString().split('T')[0]} 00:00:00.000Z`;
            try {
                const records = await pb.collection('activity_logs_db').getFullList({
                    filter: `user = "${user.id}" && date >= "${todayStr}" && date < "${tomorrowStr}"`,
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

    // --- Fetch AI Plan if ?plan=today ---
    useEffect(() => {
        if (!user || !isPlanMode) return;

        const fetchTodayPlan = async () => {
            try {
                const pb = getPB();
                const now = new Date();

                // Fetch all plans for this user, newest first
                const plans = await pb.collection('weekly_plans_db').getFullList({
                    filter: `user = "${user.id}"`,
                    sort: '-start_date',
                });

                const todayDate = new Date();
                todayDate.setHours(0, 0, 0, 0);

                // Filter in JS to be resilient to missing/null end_date values
                const currentPlan = plans.find((p: any) => {
                    const start = new Date(p.start_date);
                    start.setHours(0, 0, 0, 0);
                    const end = p.end_date ? new Date(p.end_date) : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
                    end.setHours(23, 59, 59, 999);
                    return todayDate >= start && todayDate <= end;
                });

                if (currentPlan) {
                    const planData = currentPlan.plan_data;
                    const startDate = new Date(currentPlan.start_date);
                    startDate.setHours(0, 0, 0, 0);

                    const diffTime = Math.abs(todayDate.getTime() - startDate.getTime());
                    const offset = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                    if (planData.days && planData.days[offset] && planData.days[offset].type === 'workout') {
                        setDailyPlan({
                            focusArea: planData.days[offset].focusArea,
                            exercises: planData.days[offset].exercises.map((e: any) => ({ ...e, isLoadingGif: true, gifUrl: null }))
                        });
                        setPhase('guided_intro');

                        // Treat the guided workout as "Strength" or "HIIT" contextually for saving later. Will default to strength to hit the DB structure cleanly.
                        setSelected(ACTIVITIES.find(a => a.id === 'strength') || null);
                    } else {
                        // It's a rest day, or no valid plan for today. Just fallback.
                        setPhase('pick');
                    }
                }
            } catch (error) {
                console.error("Failed to load today's plan", error);
                setPhase('pick');
            } finally {
                setLoadingPlan(false);
            }
        };

        fetchTodayPlan();
    }, [user, isPlanMode]);

    // --- Fetch GIF for current exercise ---
    useEffect(() => {
        if (phase !== 'guided_active' || !dailyPlan) return;

        const currentExercise = dailyPlan.exercises[currentExerciseIndex];
        if (currentExercise.gifUrl || !currentExercise.isLoadingGif) return; // Already fetched or attempted

        const fetchGif = async () => {
            try {
                // Remove numbers, "Dumbbell", "Barbell" etc to improve search if needed, but the backend is pretty smart
                const searchName = currentExercise.name.replace(/^[0-9]+x\s*/, '').trim();

                // RapidAPI is very specific. Strip trailing "s" for common plurals to improve match rate.
                let queryName = searchName.toLowerCase();
                if (queryName === 'jumping jacks') queryName = 'jumping jack';
                if (queryName === 'burpees') queryName = 'burpee';
                if (queryName === 'mountain climbers') queryName = 'mountain climber';
                if (queryName === 'high knees') queryName = 'high knee';

                const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
                const endpointUrl = `${baseUrl}/exercises?name=${encodeURIComponent(queryName)}&limit=1`;

                const res = await fetch(endpointUrl);

                if (res.ok) {
                    const data = await res.json();

                    setDailyPlan(prev => {
                        if (!prev) return prev;
                        const newExercises = [...prev.exercises];
                        newExercises[currentExerciseIndex] = {
                            ...newExercises[currentExerciseIndex],
                            gifUrl: `${baseUrl}/exercise-gif?id=${data.id}`,
                            instructions: data.instructions,
                            isLoadingGif: false
                        };
                        return { ...prev, exercises: newExercises };
                    });
                } else {
                    setDailyPlan(prev => {
                        if (!prev) return prev;
                        const newExercises = [...prev.exercises];
                        newExercises[currentExerciseIndex].isLoadingGif = false;
                        return { ...prev, exercises: newExercises };
                    });
                }
            } catch (e) {
                console.error("Error fetching GIF", e);
                setDailyPlan(prev => {
                    if (!prev) return prev;
                    const newExercises = [...prev.exercises];
                    newExercises[currentExerciseIndex].isLoadingGif = false;
                    return { ...prev, exercises: newExercises };
                });
            }
        };

        fetchGif();
    }, [phase, currentExerciseIndex, dailyPlan]);


    // Main timer (only when active and running)
    useEffect(() => {
        const guidedIsCounting = phase === 'guided_active' && guidedStartCountdown > 0;
        if (running && (phase === 'active' || (phase === 'guided_active' && !guidedIsCounting))) {
            intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [running, phase, guidedStartCountdown]);

    // Guided background music: play only while guided routine is active and running.
    useEffect(() => {
        const audio = guidedMusicRef.current;
        if (!audio) return;

        const shouldPlay = phase === 'guided_active' && running && guidedMusicOn;
        if (shouldPlay) {
            audio.volume = 0.3;
            audio.play().catch(() => { });
        } else {
            audio.pause();
        }
    }, [phase, running, guidedMusicOn, guidedTrackCursor, guidedPlaylistOrder]);

    const shufflePlaylist = (): number[] => {
        const arr = GUIDED_PLAYLIST.map((_, i) => i);
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    const initShuffledPlaylist = () => {
        const order = shufflePlaylist();
        setGuidedPlaylistOrder(order);
        setGuidedTrackCursor(0);
    };

    const playNextShuffledTrack = () => {
        setGuidedTrackCursor((prev) => {
            if (guidedPlaylistOrder.length === 0) return 0;
            const next = prev + 1;
            if (next < guidedPlaylistOrder.length) return next;
            const reshuffled = shufflePlaylist();
            setGuidedPlaylistOrder(reshuffled);
            return 0;
        });
    };

    const speakCue = (text: string) => {
        if (!guidedVoiceCoachOn || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.02;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
    };

    // 30s pre-start countdown for guided Tabata.
    useEffect(() => {
        if (!guidedTabataEnabled || phase !== 'guided_active' || !running || guidedStartCountdown <= 0) return;
        const t = setTimeout(() => setGuidedStartCountdown(c => Math.max(c - 1, 0)), 1000);
        return () => clearTimeout(t);
    }, [guidedTabataEnabled, phase, running, guidedStartCountdown]);

    // Guided interval engine (timed + reps auto progression).
    useEffect(() => {
        if (!guidedTabataEnabled || !running || phase !== 'guided_active' || !dailyPlan || guidedStartCountdown > 0) return;
        const tick = setInterval(() => {
            setGuidedIntervalElapsed(prev => {
                const limit = guidedIntervalState === 'work' ? guidedWorkSecs : guidedRestSecs;
                if (prev + 1 >= limit) {
                    if (guidedIntervalState === 'work') {
                        setGuidedRoundsCompleted(c => c + 1);
                        speakCue('Switch');
                        setGuidedIntervalState('rest');
                        return 0;
                    }

                    if (guidedCurrentRound >= guidedTargetRounds) {
                        if (currentExerciseIndex < dailyPlan.exercises.length - 1) {
                            setCurrentExerciseIndex(i => i + 1);
                            setGuidedCompletedExercises(c => c + 1);
                            setGuidedCurrentRound(1);
                            setGuidedIntervalState('work');
                            setGuidedStartCountdown(30);
                            guidedMilestoneVoiceRef.current = '';
                            return 0;
                        }
                        setGuidedCompletedExercises(c => c + 1);
                        stopWorkout();
                        return 0;
                    }

                    setGuidedCurrentRound(r => r + 1);
                    setGuidedIntervalState('work');
                    return 0;
                }
                return prev + 1;
            });
        }, 1000);
        return () => clearInterval(tick);
    }, [guidedTabataEnabled, running, phase, dailyPlan, guidedIntervalState, guidedCurrentRound, currentExerciseIndex, guidedStartCountdown, guidedWorkSecs, guidedRestSecs, guidedTargetRounds]);

    // Pre-start voice countdown: 3, 2, 1.
    useEffect(() => {
        if (!guidedTabataEnabled || phase !== 'guided_active' || !running || guidedStartCountdown <= 0 || !guidedVoiceCoachOn) return;
        if (guidedStartCountdown <= 3) {
            const cue = `pre-${guidedStartCountdown}-${currentExerciseIndex}`;
            if (guidedVoiceRef.current !== cue) {
                guidedVoiceRef.current = cue;
                speakCue(String(guidedStartCountdown));
            }
            return;
        }
        guidedVoiceRef.current = '';
    }, [guidedTabataEnabled, phase, running, guidedStartCountdown, currentExerciseIndex]);

    // Guided voice cues for countdown and transitions.
    useEffect(() => {
        if (!guidedTabataEnabled || phase !== 'guided_active' || !running || !guidedVoiceCoachOn) {
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
            guidedVoiceRef.current = '';
            return;
        }

        if (guidedStartCountdown > 0) {
            return;
        }

        const halfwayRound = Math.max(Math.ceil(guidedTargetRounds / 2), 1);
        if (guidedIntervalState === 'work' && guidedIntervalElapsed === 0) {
            const halfwayCueKey = `half-${currentExerciseIndex}-${guidedCurrentRound}`;
            const lastCueKey = `last-${currentExerciseIndex}-${guidedCurrentRound}`;
            if (guidedCurrentRound === halfwayRound && guidedMilestoneVoiceRef.current !== halfwayCueKey) {
                guidedMilestoneVoiceRef.current = halfwayCueKey;
                speakCue('Halfway');
            }
            if (guidedCurrentRound === guidedTargetRounds && guidedMilestoneVoiceRef.current !== lastCueKey) {
                guidedMilestoneVoiceRef.current = lastCueKey;
                speakCue('Last round');
            }
        }

        const limit = guidedIntervalState === 'work' ? guidedWorkSecs : guidedRestSecs;
        const remaining = Math.max(limit - guidedIntervalElapsed, 0);

        if (remaining <= 3 && remaining > 0) {
            const cue = `${guidedIntervalState}-${remaining}-${guidedCurrentRound}-${currentExerciseIndex}`;
            if (guidedVoiceRef.current !== cue) {
                guidedVoiceRef.current = cue;
                speakCue(String(remaining));
            }
            return;
        }

        if (guidedIntervalElapsed === 0) {
            const cue = `start-${guidedIntervalState}-${guidedCurrentRound}-${currentExerciseIndex}`;
            if (guidedVoiceRef.current !== cue) {
                guidedVoiceRef.current = cue;
                speakCue(guidedIntervalState === 'work' ? 'Go' : 'Rest');
            }
            return;
        }

        guidedVoiceRef.current = '';
    }, [guidedTabataEnabled, guidedIntervalState, guidedIntervalElapsed, guidedCurrentRound, currentExerciseIndex, phase, running, guidedStartCountdown, guidedWorkSecs, guidedRestSecs, guidedTargetRounds, guidedVoiceCoachOn]);

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
        setGuidedStartCountdown(0);
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        if (guidedMusicRef.current) {
            guidedMusicRef.current.pause();
        }
        const estimatedJumps = Math.round((jumpWorkSecs / 60) * sessionType.defaultRpm);
        setJumpCount(estimatedJumps);
        setPhase('done');
        if (isPlanMode) {
            setShowGuidedSummary(true);
        }
    };

    const resetAll = () => {
        if (guidedMusicRef.current) {
            guidedMusicRef.current.pause();
            guidedMusicRef.current.currentTime = 0;
        }
        setPhase('pick'); setSelected(null); setElapsed(0); setRunning(false);
        setEffort(7); setNotes(''); setJumpCount(0); setJumpWorkSecs(0);
        setIntervalState('work'); setIntervalElapsed(0); setCurrentRound(1);
        setGuidedIntervalState('work'); setGuidedIntervalElapsed(0); setGuidedCurrentRound(1);
        setGuidedRoundsCompleted(0); setGuidedCompletedExercises(0); setShowGuidedSummary(false);
        setGuidedStartCountdown(0);
        if (isPlanMode) router.replace('/log'); // Clear query param
    };

    const startGuidedRoutine = () => {
        if (guidedPlaylistOrder.length === 0) {
            initShuffledPlaylist();
        }
        setPhase('guided_active');
        setCurrentExerciseIndex(0);
        setElapsed(0);
        setGuidedIntervalState('work');
        setGuidedIntervalElapsed(0);
        setGuidedCurrentRound(1);
        setGuidedRoundsCompleted(0);
        setGuidedCompletedExercises(0);
        setShowGuidedSummary(false);
        guidedMilestoneVoiceRef.current = '';
        setGuidedStartCountdown(guidedTabataEnabled ? 30 : 0);
        setRunning(true);
        if (guidedMusicOn && guidedMusicRef.current) {
            guidedMusicRef.current.currentTime = 0;
            guidedMusicRef.current.volume = 0.3;
            guidedMusicRef.current.play().catch(() => { });
        }
    };

    const nextExercise = () => {
        if (!dailyPlan) return;
        if (currentExerciseIndex < dailyPlan.exercises.length - 1) {
            setCurrentExerciseIndex(prev => prev + 1);
            setGuidedIntervalState('work');
            setGuidedIntervalElapsed(0);
            setGuidedCurrentRound(1);
            guidedMilestoneVoiceRef.current = '';
            if (guidedTabataEnabled) {
                setGuidedStartCountdown(30);
            }
        } else {
            stopWorkout();
        }
    };

    const prevExercise = () => {
        if (currentExerciseIndex > 0) {
            setCurrentExerciseIndex(prev => prev - 1);
            setGuidedIntervalState('work');
            setGuidedIntervalElapsed(0);
            setGuidedCurrentRound(1);
            guidedMilestoneVoiceRef.current = '';
            if (guidedTabataEnabled) {
                setGuidedStartCountdown(30);
            }
        }
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
    const guidedKcalEstimate = selected
        ? Math.round(selected.kcalPerMin * Math.max(Math.round(elapsed / 60), 1))
        : 0;

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-28">

            {/* Header */}
            <div className="bg-white px-6 pt-12 pb-5 border-b border-slate-100 shadow-sm sticky top-0 z-10">
                <div className="flex items-center gap-3 mb-1">
                    {phase === 'jump_setup' || phase === 'guided_intro' ? (
                        <button onClick={resetAll} className="text-slate-400 hover:text-slate-700">
                            <ChevronLeft size={22} />
                        </button>
                    ) : phase === 'guided_active' ? (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setGuidedMusicOn(v => !v)}
                                className={`p-2 rounded-full ${guidedMusicOn ? 'bg-orange-100 text-orange-500' : 'bg-slate-100 text-slate-500'}`}
                                aria-label={guidedMusicOn ? 'Mute music' : 'Play music'}
                            >
                                {guidedMusicOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                            </button>
                            <button onClick={() => setRunning(r => !r)} className={`p-2 rounded-full ${running ? 'bg-orange-100 text-orange-500' : 'bg-green-100 text-green-500'}`}>
                                {running ? <Pause size={16} /> : <Play size={16} />}
                            </button>
                        </div>
                    ) : (
                        <Link href="/" className="text-slate-400 hover:text-slate-700 transition-colors">
                            <ArrowLeft size={22} />
                        </Link>
                    )}
                    <h1 className="text-2xl font-extrabold text-slate-900">
                        {phase === 'jump_setup' ? 'Jump Rope Setup' :
                            phase === 'guided_intro' ? "Today's Routine" :
                                phase === 'guided_active' ? fmt(elapsed) :
                                    'Activity Logger'}
                    </h1>
                </div>
                {phase !== 'guided_active' && phase !== 'guided_intro' && (
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
                )}
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

                {/* ══ PHASE: GUIDED INTRO ════════════════════════════════════ */}
                {phase === 'guided_intro' && dailyPlan && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                        <div className="text-center py-6">
                            <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-inner">
                                🔥
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 leading-tight">{dailyPlan.focusArea}</h2>
                            <p className="text-sm text-slate-500 font-medium mt-2">{dailyPlan.exercises.length} movements scheduled</p>
                        </div>

                        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">The Plan</h3>
                            <div className="space-y-4">
                                {dailyPlan.exercises.map((ex, idx) => (
                                    <div key={idx} className="flex items-center gap-4 border-b border-slate-50 pb-4 last:border-0 last:pb-0">
                                        <div className="w-8 h-8 rounded-xl bg-slate-50 flex flex-shrink-0 items-center justify-center text-xs font-black text-slate-400 border border-slate-100">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-slate-800 truncate">{ex.name}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-[#f97316]">{ex.durationOrReps}</p>
                                            {ex.sets && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{ex.sets} sets</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                            <div className="grid grid-cols-3 gap-2 mb-3">
                                {(Object.keys(GUIDED_MODIFIERS) as GuidedModifierKey[]).map((key) => (
                                    <button
                                        key={key}
                                        onClick={() => setGuidedModifier(key)}
                                        className={`py-2 rounded-xl text-xs font-black border transition-colors ${guidedModifier === key ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                        {GUIDED_MODIFIERS[key].label}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setGuidedTabataEnabled(v => !v)}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${guidedTabataEnabled ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                            >
                                <span className="text-sm font-black">Tabata Style</span>
                                <span className="text-xs font-bold">
                                    {guidedTabataEnabled ? `ON · ${guidedConfig.workSecs}s/${guidedConfig.restSecs}s × ${guidedConfig.rounds}` : 'OFF'}
                                </span>
                            </button>
                            <button
                                onClick={() => setGuidedVoiceCoachOn(v => !v)}
                                className={`w-full mt-2 flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${guidedVoiceCoachOn ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                            >
                                <span className="text-sm font-black">Voice Coach</span>
                                <span className="text-xs font-bold">{guidedVoiceCoachOn ? 'ON' : 'OFF'}</span>
                            </button>
                            <p className="text-[11px] text-slate-400 font-medium mt-2 px-1">
                                Voice countdown says 3, 2, 1, Go during guided timer.
                            </p>
                        </div>

                        <button onClick={startGuidedRoutine}
                            className="w-full py-4 bg-[#f97316] hover:bg-orange-600 text-white font-extrabold rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-orange-500/30 text-lg active:scale-95">
                            <Play size={20} fill="currentColor" /> Let&apos;s Go
                        </button>
                    </div>
                )}


                {/* ══ PHASE: GUIDED ACTIVE ══════════════════════════════════ */}
                {phase === 'guided_active' && dailyPlan && (
                    <div className="flex flex-col h-full animate-in fade-in duration-300">

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-200 h-1.5 rounded-full mb-6 overflow-hidden">
                            <div
                                className="h-full bg-[#f97316] transition-all duration-500 ease-out"
                                style={{ width: `${((currentExerciseIndex) / dailyPlan.exercises.length) * 100}%` }}
                            />
                        </div>

                        <div className="flex-1 flex flex-col items-center">
                            <span className="text-xs font-bold text-orange-500 bg-orange-50 px-3 py-1 rounded-full uppercase tracking-widest mb-4">
                                {currentExerciseIndex + 1} of {dailyPlan.exercises.length}
                            </span>

                            <h2 className="text-2xl font-black text-slate-900 text-center mb-6 leading-tight px-4 w-full">
                                {dailyPlan.exercises[currentExerciseIndex].name}
                            </h2>

                            {guidedTabataEnabled && (
                                <div className={`w-full rounded-3xl p-5 mb-6 border ${guidedIntervalState === 'work' ? 'bg-orange-50 border-orange-200' : 'bg-sky-50 border-sky-200'}`}>
                                    <div className="flex items-center justify-center gap-2 mb-3">
                                        {(['auto', 'reps', 'timed'] as GuidedExerciseMode[]).map((mode) => (
                                            <button
                                                key={mode}
                                                onClick={() => setGuidedExerciseModeByIndex(prev => ({ ...prev, [currentExerciseIndex]: mode }))}
                                                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${currentOverrideMode === mode ? 'bg-slate-900 text-white border-slate-900' : 'bg-white/70 text-slate-600 border-slate-200'}`}
                                            >
                                                {mode}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className={`text-xs font-black uppercase tracking-widest ${guidedIntervalState === 'work' ? 'text-orange-600' : 'text-sky-600'}`}>
                                            {guidedIntervalState === 'work' ? (currentEffectiveMode === 'reps' ? 'Set' : 'Work') : 'Rest'}
                                        </span>
                                        <span className="text-xs font-bold text-slate-500">
                                            {currentEffectiveMode === 'reps' ? 'Set' : 'Round'} {guidedCurrentRound}/{guidedTargetRounds}
                                        </span>
                                    </div>
                                    {guidedStartCountdown > 0 ? (
                                        <div className="text-center">
                                            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Starting In</p>
                                            <p className="text-5xl font-black tracking-tight text-orange-600">{guidedStartCountdown}</p>
                                            <p className="text-[11px] text-slate-500 font-semibold mt-1">
                                                Get ready. Timer starts with voice countdown.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="text-center">
                                            <p className={`text-5xl font-black tracking-tight ${guidedIntervalState === 'work' ? 'text-orange-600' : 'text-sky-600'}`}>
                                                {Math.max((guidedIntervalState === 'work' ? guidedWorkSecs : guidedRestSecs) - guidedIntervalElapsed, 0)}
                                            </p>
                                            <p className="text-[11px] text-slate-500 font-semibold mt-1">
                                                {currentEffectiveMode === 'reps'
                                                    ? `Target: ${currentGuidedExercise?.durationOrReps || 'reps'} · Auto progression`
                                                    : `Auto-advances to next exercise after ${guidedTargetRounds} rounds`}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* GIF Display Container */}
                            <div className="w-full max-w-[280px] aspect-square bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border-4 border-white overflow-hidden relative mb-8 flex items-center justify-center isolate">
                                {dailyPlan.exercises[currentExerciseIndex].isLoadingGif ? (
                                    <div className="flex flex-col items-center gap-3 text-slate-400 animate-pulse">
                                        <Dumbbell size={32} className="opacity-50" />
                                        <span className="text-xs font-bold uppercase tracking-widest">Loading...</span>
                                    </div>
                                ) : dailyPlan.exercises[currentExerciseIndex].gifUrl ? (
                                    <img
                                        src={dailyPlan.exercises[currentExerciseIndex].gifUrl}
                                        alt={dailyPlan.exercises[currentExerciseIndex].name}
                                        className="w-full h-full object-cover mix-blend-multiply"
                                    />
                                ) : (
                                    <div className="flex flex-col items-center gap-3 text-slate-300">
                                        <Dumbbell size={48} className="opacity-20" />
                                        <span className="text-xs font-bold">No Preview Available</span>
                                    </div>
                                )}
                            </div>

                            {/* Sets & Reps Card */}
                            <div className="w-full bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col items-center justify-center mx-6 mb-6 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5 text-8xl font-black -translate-y-4 translate-x-4">
                                    {dailyPlan.exercises[currentExerciseIndex].sets || 1}
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 z-10">Target</p>
                                <span className="text-5xl font-black text-[#f97316] tracking-tighter z-10">
                                    {dailyPlan.exercises[currentExerciseIndex].durationOrReps}
                                </span>
                                {dailyPlan.exercises[currentExerciseIndex].sets && (
                                    <span className="text-sm font-bold text-slate-600 mt-2 z-10 bg-slate-50 px-4 py-1 rounded-full border border-slate-100">
                                        {dailyPlan.exercises[currentExerciseIndex].sets} Sets
                                    </span>
                                )}
                            </div>

                            {/* Instructions Card */}
                            {dailyPlan.exercises[currentExerciseIndex].instructions && dailyPlan.exercises[currentExerciseIndex].instructions!.length > 0 && (
                                <div className="w-full mx-6 mb-8 px-6">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">How to perform</h3>
                                    <ol className="text-sm text-slate-600 space-y-2 list-decimal list-outside pl-4 text-left font-medium">
                                        {dailyPlan.exercises[currentExerciseIndex].instructions!.map((step: string, idx: number) => (
                                            <li key={idx} className="leading-relaxed border-b border-slate-100 pb-2 last:border-0">{step}</li>
                                        ))}
                                    </ol>
                                </div>
                            )}

                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-between w-full mt-auto pt-4 gap-3">
                            <button
                                onClick={prevExercise}
                                disabled={currentExerciseIndex === 0}
                                className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-30 active:scale-95 transition-all shadow-sm flex-shrink-0"
                            >
                                <ChevronLeft size={24} />
                            </button>

                            <button
                                onClick={nextExercise}
                                className="flex-1 py-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-extrabold rounded-2xl flex items-center justify-center gap-2 transition-transform shadow-xl active:scale-95 text-lg"
                            >
                                {currentExerciseIndex === dailyPlan.exercises.length - 1 ? (
                                    <><CheckCircle size={20} /> Finish Workout</>
                                ) : (
                                    <>Next <ChevronRight size={20} /></>
                                )}
                            </button>
                        </div>
                    </div>
                )}


            </div>
            {showGuidedSummary && (
                <div className="fixed inset-0 z-[85] flex items-center justify-center px-5">
                    <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" onClick={() => setShowGuidedSummary(false)} />
                    <div className="relative w-full max-w-md bg-white rounded-[1.5rem] p-5 border border-slate-100 shadow-2xl">
                        <h3 className="text-xl font-black text-slate-900">Workout Summary</h3>
                        <p className="text-sm text-slate-500 font-medium mt-1">Review your session before saving.</p>
                        <div className="grid grid-cols-2 gap-3 mt-4">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Duration</p>
                                <p className="text-lg font-black text-slate-900">{fmt(elapsed)}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Est. Kcal</p>
                                <p className="text-lg font-black text-slate-900">{guidedKcalEstimate}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Exercises</p>
                                <p className="text-lg font-black text-slate-900">{guidedCompletedExercises}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rounds/Sets</p>
                                <p className="text-lg font-black text-slate-900">{guidedRoundsCompleted}</p>
                            </div>
                        </div>
                        <div className="mt-5 flex gap-2">
                            <button
                                onClick={() => { setShowGuidedSummary(false); setPhase('guided_active'); setRunning(false); }}
                                className="flex-1 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold"
                            >
                                Back to Workout
                            </button>
                            <button
                                onClick={() => setShowGuidedSummary(false)}
                                className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold transition-colors"
                            >
                                Continue to Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <audio
                ref={guidedMusicRef}
                src={GUIDED_PLAYLIST[guidedPlaylistOrder[guidedTrackCursor] ?? 0]}
                preload="auto"
                playsInline
                onEnded={playNextShuffledTrack}
            />
        </div>
    );
}
