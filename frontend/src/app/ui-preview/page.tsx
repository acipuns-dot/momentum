import { Droplet, Flame, Play, Eye } from 'lucide-react';

export default function UiPreviewPage() {
    return (
        <div className="min-h-screen momentum-bg dot-grid-subtle ui-page pb-[calc(7rem+env(safe-area-inset-bottom))] px-5 pt-10">
            <section className="ui-glass-strong surface-orange rounded-[2rem] p-5 ui-elevated border">
                <p className="text-xs font-bold uppercase tracking-wider text-orange-700">Today&apos;s Focus</p>
                <h1 className="text-3xl font-black text-slate-900 mt-1 leading-tight">Back &amp; Biceps</h1>
                <p className="text-sm text-slate-600 mt-1">5 movements • 25 min • ~425 kcal</p>

                <div className="mt-4 flex gap-2">
                    <button className="flex-1 accent-gradient text-white font-extrabold py-3 rounded-xl inline-flex items-center justify-center gap-2">
                        <Play size={16} /> Start Workout
                    </button>
                    <button className="px-4 py-3 rounded-xl ui-glass border text-slate-700 font-bold inline-flex items-center justify-center gap-2">
                        <Eye size={15} /> Preview
                    </button>
                </div>
            </section>

            <section className="grid grid-cols-2 gap-3 mt-4">
                <div className="ui-glass surface-blue rounded-2xl p-4 ui-card">
                    <p className="text-xs text-slate-500 font-bold uppercase">Energy</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">360 / 2050</p>
                    <p className="text-xs text-slate-500">kcal</p>
                </div>
                <div className="ui-glass surface-emerald rounded-2xl p-4 ui-card">
                    <p className="text-xs text-slate-500 font-bold uppercase">Hydration</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">1.4 / 2.5L</p>
                    <p className="text-xs text-slate-500">56%</p>
                </div>
            </section>

            <section className="mt-5 ui-glass surface-violet rounded-[1.5rem] p-4 ui-card">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Daily Protocol</p>
                <div className="space-y-2">
                    <div className="surface-orange rounded-xl p-3 border flex items-start justify-between">
                        <div>
                            <p className="font-bold text-slate-900">Barbell row</p>
                            <p className="text-xs text-slate-600">4 sets • 8-10 reps</p>
                        </div>
                        <Flame size={16} className="text-orange-600 mt-1" />
                    </div>
                    <div className="surface-blue rounded-xl p-3 border flex items-start justify-between">
                        <div>
                            <p className="font-bold text-slate-900">Lat pulldown</p>
                            <p className="text-xs text-slate-600">3 sets • 10-12 reps</p>
                        </div>
                        <Droplet size={16} className="text-blue-600 mt-1" />
                    </div>
                    <div className="surface-emerald rounded-xl p-3 border">
                        <p className="font-bold text-slate-900">Cable curl</p>
                        <p className="text-xs text-slate-600">3 sets • 10-12 reps</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
