'use client';

import { Crown, X, Sparkles } from 'lucide-react';

type PremiumPaywallModalProps = {
    open: boolean;
    onClose: () => void;
    whatsappUrl: string;
    title?: string;
    subtitle?: string;
};

export default function PremiumPaywallModal({
    open,
    onClose,
    whatsappUrl,
    title = 'Unlock Premium',
    subtitle = 'Get 4-week AI plans, smarter progression, and premium coaching flow.',
}: PremiumPaywallModalProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center px-4">
            <div
                className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md bg-white rounded-[2rem] p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"
                    aria-label="Close premium modal"
                >
                    <X size={16} />
                </button>

                <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4 shadow-inner">
                    <Crown size={28} />
                </div>

                <h3 className="text-2xl font-black text-slate-900 mb-1">{title}</h3>
                <p className="text-sm text-slate-500 font-medium mb-5">{subtitle}</p>

                <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Sparkles size={14} className="text-amber-500" /> 4-week adaptive AI plans
                    </div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Sparkles size={14} className="text-amber-500" /> Faster weekly progression
                    </div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Sparkles size={14} className="text-amber-500" /> Priority feature access
                    </div>
                </div>

                <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full inline-flex items-center justify-center py-3.5 rounded-2xl bg-[#25D366] text-white text-sm font-black shadow-lg shadow-emerald-500/30"
                >
                    Contact on WhatsApp
                </a>
            </div>
        </div>
    );
}

