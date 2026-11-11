import React from 'react';
import { X } from 'lucide-react';

export const Card = ({ children, className = '', onClick }) => (
    <div 
        onClick={onClick} 
        className={`theme-card p-4.5 ${className} ${onClick ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
    >
        {children}
    </div>
);

export const Fab = ({ children, onClick, className = '' }) => (
    <button 
        onClick={onClick} 
        className={`theme-action-btn ${className}`}
    >
        {children}
    </button>
);

export const Modal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-6 backdrop-blur-md animate-in fade-in duration-200">
            <div className="theme-card p-6 w-full max-w-xs space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-white">{title}</h3>
                    <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-white"><X size={18} /></button>
                </div>
                <div>{children}</div>
            </div>
        </div>
    );
};
