import React from 'react';
import { X } from 'lucide-react';

export const Card = ({ children, className = '', onClick }) => (
    <div onClick={onClick} className={`m3-card ${className} ${onClick ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}>
        {children}
    </div>
);

export const Fab = ({ children, onClick, className = '' }) => (
    <button onClick={onClick} className={`m3-fab ${className}`}>
        {children}
    </button>
);

export const Modal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="m3-card bg-[var(--surface)] p-6 w-full max-w-xs space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center">
                    <h3 className="text-xl font-medium">{title}</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5"><X size={20} /></button>
                </div>
                <div>{children}</div>
            </div>
        </div>
    );
};
