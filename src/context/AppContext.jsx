import React, { createContext, useContext, useState } from 'react';
import { getTodayISO } from '../services/db';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
    // Global State
    const [activeDateISO, setActiveDateISO] = useState(getTodayISO());

    const changeDate = (days) => {
        const d = new Date(activeDateISO);
        d.setDate(d.getDate() + days);
        setActiveDateISO(d.toISOString().split('T')[0]);
    };

    const setDate = (iso) => setActiveDateISO(iso);

    return (
        <AppContext.Provider value={{ activeDateISO, changeDate, setDate }}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => useContext(AppContext);
