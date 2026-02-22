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
