'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getPB } from '@/lib/pb';
import {
    LogOut, Scale, Target, Flame, Droplets, User as UserIcon,
    ChevronRight, Trophy, Calendar, Lock, X, Eye, EyeOff, CheckCircle2, Crown,
    Pencil, Loader2
} from 'lucide-react';

const ACTIVITY_OPTIONS = [
    { key: 'sedentary', label: 'Sedentary' },
    { key: 'lightly_active', label: 'Light' },
    { key: 'moderately_active', label: 'Moderate' },
    { key: 'very_active', label: 'Very Active' },
];

export default function ProfilePage() {
    const { user, logout } = useAuth();
    const router = useRouter();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // ── Edit Profile sheet state ─────────────────────────────────────
    const [editModal, setEditModal] = useState(false);
    const [editName, setEditName] = useState('');
    const [editCurrentWeight, setEditCurrentWeight] = useState('');
    const [editGoalWeight, setEditGoalWeight] = useState('');
    const [editActivity, setEditActivity] = useState('moderately_active');
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState('');
    const [editSuccess, setEditSuccess] = useState(false);

    // ── Change Password modal state ──────────────────────────────────
    const [pwModal, setPwModal] = useState(false);
    const [oldPw, setOldPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [showOld, setShowOld] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [pwLoading, setPwLoading] = useState(false);
    const [pwError, setPwError] = useState('');
    const [pwSuccess, setPwSuccess] = useState(false);

    useEffect(() => {
        if (!user) return;
        const pb = getPB();
        pb.collection('profiles_db').getFullList({ filter: `user = "${user.id}"` })
            .then(res => setProfile(res[0] || null))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user]);

    const openEditModal = () => {
        setEditName(user?.name || user?.email?.split('@')[0] || '');
        setEditCurrentWeight(profile?.current_weight?.toString() || '');
        setEditGoalWeight(profile?.goal_weight?.toString() || '');
        setEditActivity(profile?.activity_level || 'moderately_active');
        setEditError('');
        setEditSuccess(false);
        setEditModal(true);
    };

    const handleSaveProfile = async () => {
        setEditError('');
        const cw = parseFloat(editCurrentWeight);
        const gw = parseFloat(editGoalWeight);
        if (!cw || !gw || isNaN(cw) || isNaN(gw)) { setEditError('Please enter valid weights.'); return; }
        if (cw < 30 || cw > 300) { setEditError('Current weight must be between 30–300 kg.'); return; }
        if (gw < 30 || gw > 300) { setEditError('Goal weight must be between 30–300 kg.'); return; }

        setEditLoading(true);
        try {
            const pb = getPB();
            // Update display name on the user record
            if (editName.trim()) {
                await pb.collection('users').update(user!.id, { name: editName.trim() });
            }
            const updated = await pb.collection('profiles_db').update(profile.id, {
                current_weight: cw,
                goal_weight: gw,
                activity_level: editActivity,
            });
            setProfile(updated);
            setEditSuccess(true);
            setTimeout(() => {
                setEditModal(false);
                setEditSuccess(false);
            }, 1500);
        } catch (e: any) {
            setEditError(e?.message || 'Failed to save profile.');
        } finally {
            setEditLoading(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        router.push('/login');
    };

    const handleChangePassword = async () => {
        setPwError('');
        if (!newPw || !oldPw) { setPwError('Please fill in all fields.'); return; }
        if (newPw !== confirmPw) { setPwError('New passwords do not match.'); return; }
        if (newPw.length < 8) { setPwError('Password must be at least 8 characters.'); return; }

        setPwLoading(true);
        try {
            const pb = getPB();
            await pb.collection('users').update(user!.id, {
                oldPassword: oldPw,
                password: newPw,
                passwordConfirm: confirmPw,
            });
            setPwSuccess(true);
            setTimeout(() => {
                setPwModal(false);
                setPwSuccess(false);
                setOldPw(''); setNewPw(''); setConfirmPw('');
            }, 1800);
        } catch (e: any) {
            setPwError(e?.response?.data?.oldPassword?.message
                || e?.message
                || 'Failed to change password.');
        } finally {
            setPwLoading(false);
        }
    };

    const statCards = [
        {
            icon: <Scale size={18} className="text-[#f97316]" />,
            label: 'Current Weight',
            value: profile?.current_weight ? `${profile.current_weight} kg` : '--',
        },
        {
            icon: <Target size={18} className="text-emerald-500" />,
            label: 'Goal Weight',
            value: profile?.goal_weight ? `${profile.goal_weight} kg` : '--',
        },
        {
            icon: <Flame size={18} className="text-rose-500" />,
            label: 'Activity Level',
            value: profile?.activity_level
                ? profile.activity_level.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                : '--',
        },
        {
            icon: <Droplets size={18} className="text-blue-500" />,
            label: 'Daily Water Goal',
            value: profile?.current_weight
                ? `${((profile.current_weight * 35) / 1000).toFixed(1)} L`
                : '2.5 L',
        },
    ];

    const premiumUntil = user?.premium_until ? new Date(user.premium_until) : null;
    const isPremiumActive = !!user?.is_premium && !!premiumUntil && premiumUntil.getTime() > Date.now();
    const premiumUntilLabel = premiumUntil
        ? premiumUntil.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null;
    const trialStart = user?.created ? new Date(user.created) : null;
    const trialEnd = trialStart ? new Date(trialStart.getTime() + (7 * 24 * 60 * 60 * 1000)) : null;
    const trialDaysLeft = trialEnd
        ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 7;

    return (
        <div className="min-h-screen bg-[#f8f9fa] dot-grid-subtle pb-32 font-sans ui-page">

            {/* Header */}
            <div className="pt-12 px-6 pb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Profile</h1>
                    <p className="text-sm font-medium text-slate-500 mt-1">Your account & goals</p>
                </div>
                <button
                    onClick={openEditModal}
                    className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2 text-xs font-bold text-slate-700 hover:border-[#f97316] hover:text-[#f97316] transition-colors ui-card"
                >
                    <Pencil size={12} />
                    Edit Profile
                </button>
            </div>

            {/* Avatar Card */}
            <div className="mx-6 mb-6 bg-white rounded-[2rem] p-6 ui-card border border-slate-100 flex items-center gap-5">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-[#f97316] flex items-center justify-center ui-elevated  flex-shrink-0">
                    <UserIcon size={28} className="text-white" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-lg font-black text-slate-900 truncate">
                        {user?.name || user?.email?.split('@')[0] || 'User'}
                    </p>
                    <p className="text-xs font-medium text-slate-400 truncate mt-0.5">{user?.email}</p>
                    {isPremiumActive && (
                        <div className="flex items-center gap-1.5 mt-1">
                            <Crown size={12} className="text-amber-500" />
                            <span className="text-xs font-bold text-amber-600">
                                Premium · Expires {premiumUntilLabel}
                            </span>
                        </div>
                    )}
                    {!isPremiumActive && (
                        <div className="flex items-center gap-1.5 mt-1">
                            <Calendar size={12} className="text-slate-500" />
                            <span className="text-xs font-bold text-slate-600">
                                Free Trial · {trialDaysLeft > 0 ? `${trialDaysLeft} day${trialDaysLeft > 1 ? 's' : ''} left` : 'Ended'}
                            </span>
                        </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-2">
                        <Calendar size={12} className="text-[#f97316]" />
                        <span className="text-xs font-bold text-[#f97316]">
                            {profile?.goal_weight && profile?.current_weight
                                ? `${Math.abs(profile.current_weight - profile.goal_weight).toFixed(1)} kg to goal`
                                : 'Set your goal'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="px-6 mb-6">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Your Stats</p>
                <div className="grid grid-cols-2 gap-3">
                    {loading
                        ? Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="bg-white rounded-2xl p-4 ui-card border border-slate-100 h-20 animate-pulse" />
                        ))
                        : statCards.map((s, i) => (
                            <div key={i} className="bg-white rounded-2xl p-4 ui-card border border-slate-100">
                                <div className="flex items-center gap-2 mb-2">{s.icon}<span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{s.label}</span></div>
                                <p className="text-base font-black text-slate-800 capitalize">{s.value}</p>
                            </div>
                        ))
                    }
                </div>
            </div>

            {/* Achievement Badge */}
            <div className="mx-6 mb-6 bg-gradient-to-r from-orange-50 to-amber-50 rounded-[2rem] p-5 border border-orange-100 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center ui-card border border-orange-100 flex-shrink-0">
                    <Trophy size={22} className="text-[#f97316]" />
                </div>
                <div>
                    <p className="text-sm font-black text-slate-900">Keep it up! 🏆</p>
                    <p className="text-xs font-medium text-slate-500 mt-0.5">
                        Stay consistent with your daily protocol to hit your goal.
                    </p>
                </div>
            </div>

            {/* Account Actions */}
            <div className="px-6 mb-6">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Account</p>
                <div className="bg-white rounded-[2rem] ui-card border border-slate-100 overflow-hidden divide-y divide-slate-50">
                    {user?.is_admin && (
                        <button
                            onClick={() => router.push('/admin')}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-[#18A058]/10 group-hover:bg-[#18A058]/20 flex items-center justify-center transition-colors">
                                    <Lock size={16} className="text-[#18A058]" />
                                </div>
                                <span className="text-sm font-bold text-[#18A058]">Admin Centre</span>
                            </div>
                            <ChevronRight size={16} className="text-slate-300 group-hover:text-[#18A058]/60 transition-colors" />
                        </button>
                    )}
                    <button
                        onClick={() => { setPwModal(true); setPwError(''); setPwSuccess(false); }}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center transition-colors">
                                <Lock size={16} className="text-slate-500" />
                            </div>
                            <span className="text-sm font-bold text-slate-700">Change Password</span>
                        </div>
                        <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-400 transition-colors" />
                    </button>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-red-50 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-red-50 group-hover:bg-red-100 flex items-center justify-center transition-colors">
                                <LogOut size={16} className="text-red-500" />
                            </div>
                            <span className="text-sm font-bold text-red-500">Sign Out</span>
                        </div>
                        <ChevronRight size={16} className="text-slate-300 group-hover:text-red-400 transition-colors" />
                    </button>
                </div>
            </div>

            {/* ── Edit Profile Bottom Sheet ────────────────────────────────── */}
            {editModal && (
                <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={() => setEditModal(false)}>
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
                    <div
                        className="relative bg-white rounded-t-[2rem] w-full max-w-md px-6 pt-6 pb-10 ui-elevated animate-in slide-in-from-bottom duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Drag handle */}
                        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-6" />

                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Edit Profile</h3>
                                <p className="text-xs font-medium text-slate-400 mt-0.5">Update your stats & goals</p>
                            </div>
                            <button onClick={() => setEditModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        {editSuccess ? (
                            <div className="flex flex-col items-center py-8 gap-3">
                                <CheckCircle2 size={48} className="text-emerald-500" />
                                <p className="text-sm font-bold text-slate-700">Profile saved!</p>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {/* Name */}
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Display Name</label>
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        placeholder="Your name"
                                        className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#f97316]/30 focus:border-[#f97316] transition-all"
                                    />
                                </div>

                                {/* Weight fields side by side */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Current Weight</label>
                                        <div className="relative mt-1">
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={editCurrentWeight}
                                                onChange={e => setEditCurrentWeight(e.target.value)}
                                                placeholder="70.0"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 pr-10 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#f97316]/30 focus:border-[#f97316] transition-all"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">kg</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Goal Weight</label>
                                        <div className="relative mt-1">
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={editGoalWeight}
                                                onChange={e => setEditGoalWeight(e.target.value)}
                                                placeholder="65.0"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 pr-10 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#f97316]/30 focus:border-[#f97316] transition-all"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">kg</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Activity Level */}
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Activity Level</label>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        {ACTIVITY_OPTIONS.map(opt => (
                                            <button
                                                key={opt.key}
                                                onClick={() => setEditActivity(opt.key)}
                                                className={`py-2.5 rounded-2xl text-xs font-bold border-2 transition-all ${editActivity === opt.key
                                                    ? 'bg-[#f97316] border-[#f97316] text-white ui-elevated'
                                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                                                    }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Error */}
                                {editError && (
                                    <p className="text-xs font-bold text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{editError}</p>
                                )}

                                {/* Save */}
                                <button
                                    onClick={handleSaveProfile}
                                    disabled={editLoading}
                                    className="w-full py-3.5 bg-[#f97316] hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all active:scale-95 ui-elevated  flex items-center justify-center gap-2"
                                >
                                    {editLoading ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : 'Save Changes'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Change Password Modal ───────────────────────────────────── */}
            {pwModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center px-5"
                    onClick={() => setPwModal(false)}>
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
                    <div
                        className="relative bg-white rounded-[2rem] p-6 w-full ui-elevated animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Change Password</h3>
                                <p className="text-xs font-medium text-slate-400 mt-0.5">Keep your account secure</p>
                            </div>
                            <button onClick={() => setPwModal(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        {pwSuccess ? (
                            <div className="flex flex-col items-center py-6 gap-3">
                                <CheckCircle2 size={48} className="text-emerald-500" />
                                <p className="text-sm font-bold text-slate-700">Password updated!</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Current Password</label>
                                    <div className="relative mt-1">
                                        <input
                                            type={showOld ? 'text' : 'password'}
                                            value={oldPw}
                                            onChange={e => setOldPw(e.target.value)}
                                            placeholder="••••••••"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 pr-11 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#f97316]/30 focus:border-[#f97316] transition-all"
                                        />
                                        <button type="button" onClick={() => setShowOld(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                            {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">New Password</label>
                                    <div className="relative mt-1">
                                        <input
                                            type={showNew ? 'text' : 'password'}
                                            value={newPw}
                                            onChange={e => setNewPw(e.target.value)}
                                            placeholder="Min. 8 characters"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 pr-11 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#f97316]/30 focus:border-[#f97316] transition-all"
                                        />
                                        <button type="button" onClick={() => setShowNew(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                            {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Confirm New Password</label>
                                    <input
                                        type="password"
                                        value={confirmPw}
                                        onChange={e => setConfirmPw(e.target.value)}
                                        placeholder="Repeat new password"
                                        className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#f97316]/30 focus:border-[#f97316] transition-all"
                                    />
                                </div>
                                {pwError && (
                                    <p className="text-xs font-bold text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{pwError}</p>
                                )}
                                <button
                                    onClick={handleChangePassword}
                                    disabled={pwLoading}
                                    className="w-full mt-2 py-3.5 bg-[#f97316] hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all active:scale-95 ui-elevated "
                                >
                                    {pwLoading ? 'Updating...' : 'Update Password'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}

