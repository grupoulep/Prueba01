import React, { useState, useEffect } from 'react';
import { ShieldCheck, LogOut, Clock } from 'lucide-react';
import { User } from '../types';

interface NavbarProps {
  currentUser: User | null;
  onLogout: () => void;
  onOpenPrivacyModal: () => void;
  activeView: 'LOGIN' | 'REGISTER' | 'DASHBOARD';
  onSwitchView: (view: 'LOGIN' | 'REGISTER') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onLogout,
  onOpenPrivacyModal,
  activeView,
  onSwitchView
}) => {
  const [sessionSeconds, setSessionSeconds] = useState<number>(300);
  const onLogoutRef = React.useRef(onLogout);
  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  useEffect(() => {
    setSessionSeconds(300);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(() => {
      setSessionSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    if (currentUser && sessionSeconds === 0) {
      setSessionSeconds(300);
      const timer = setTimeout(() => {
        if (onLogoutRef.current) {
          onLogoutRef.current();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [currentUser, sessionSeconds]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins}:${remSecs.toString().padStart(2, '0')}`;
  };

  if (!currentUser) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 bg-purple-900 border-b border-purple-800 text-purple-100 shadow-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-md bg-white flex items-center justify-center text-purple-900 shadow-xs border border-purple-200">
            <ShieldCheck className="w-5 h-5 text-purple-900" />
          </div>
          <span className="font-extrabold text-lg text-white tracking-tight">
            Credi<span className="text-purple-300">ULEP</span>
          </span>
        </div>

        {/* Right Section */}
        <div className="flex items-center space-x-3">
          {currentUser ? (
            <>
              <div 
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-950/90 border border-purple-700/80 text-xs text-purple-100 shadow-xs"
                title="Sesión segura"
              >
                <Clock className="w-3.5 h-3.5 text-purple-300" />
                <span className="text-purple-300 font-medium">Sesión:</span>
                <span className="font-mono font-bold text-white">{formatTime(sessionSeconds)}</span>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-900 bg-white hover:bg-rose-50 border border-rose-200 rounded-md transition cursor-pointer shadow-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Salir</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              {activeView === 'LOGIN' ? (
                <button
                  type="button"
                  onClick={() => onSwitchView('REGISTER')}
                  className="px-4 py-2 text-xs font-bold text-purple-950 bg-white hover:bg-purple-100 border border-white rounded-md shadow-xs transition cursor-pointer"
                >
                  Crear usuario
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onSwitchView('LOGIN')}
                  className="px-4 py-2 text-xs font-bold text-purple-900 bg-white hover:bg-purple-100 rounded-md shadow-xs border border-white transition cursor-pointer"
                >
                  Iniciar Sesión
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
