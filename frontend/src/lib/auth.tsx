'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getPB } from './pb';

export const AuthContext = createContext<{
    user: any | null;
    loading: boolean;
    logout: () => void;
}>({
    user: null,
    loading: true,
    logout: () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const pb = getPB();

        // Set initial state from local storage token
        if (pb.authStore.isValid && pb.authStore.model) {
            setUser(pb.authStore.model);
        }
        setLoading(false);

        // Subscribe to auth state changes anywhere in the app
        const unsubscribe = pb.authStore.onChange((token, model) => {
            setUser(model);
        }, true);

        return () => {
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        const pb = getPB();
        if (!user?.id || !pb.authStore.isValid) return;

        let active = true;
        let unsubscribeRecord = () => { };

        const syncUserRecord = async () => {
            try {
                const fresh = await pb.collection('users').getOne(user.id);
                if (!active) return;
                setUser(fresh);
                pb.authStore.save(pb.authStore.token, fresh);
            } catch {
                // If refresh fails (e.g., token invalidated), clear auth state.
                if (!active) return;
                pb.authStore.clear();
                setUser(null);
            }
        };

        // Pull latest profile flags immediately (e.g. is_premium changed by admin)
        syncUserRecord();

        // Live updates for this user record
        pb.collection('users')
            .subscribe(user.id, (e) => {
                if (!active) return;
                if (e.action === 'delete') {
                    pb.authStore.clear();
                    setUser(null);
                    return;
                }
                const next = e.record;
                setUser(next);
                pb.authStore.save(pb.authStore.token, next);
            })
            .then((unsub) => {
                unsubscribeRecord = unsub;
            })
            .catch(() => {
                // Fallback: ensure state still refreshes when tab regains focus
                const onFocus = () => { syncUserRecord(); };
                window.addEventListener('focus', onFocus);
                unsubscribeRecord = () => window.removeEventListener('focus', onFocus);
            });

        return () => {
            active = false;
            unsubscribeRecord();
        };
    }, [user?.id]);

    const logout = () => {
        getPB().authStore.clear();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
