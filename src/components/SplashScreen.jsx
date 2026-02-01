import React, { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';

export const SplashScreen = ({ onFinish }) => {
    const [fading, setFading] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setFading(true);
            setTimeout(onFinish, 300); // Wait for fade out
        }, 1500); // Show for 1.5s
        return () => clearTimeout(timer);
    }, [onFinish]);

    if (fading && !onFinish) return null; // Should not happen if parent handles unmount

    return (
        <div className={`fixed inset-0 bg-[var(--surface)] z-[500] flex flex-col items-center justify-center transition-opacity duration-300 ${fading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <div className="relative">
                <Fingerprint className="w-20 h-20 text-[var(--primary)] animate-pulse" />
            </div>
            <p className="mt-6 font-light tracking-[0.3em] text-[var(--primary)] opacity-40 uppercase text-xs">Pronto</p>
        </div>
    );
};
