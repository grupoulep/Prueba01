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
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-purple-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-md bg-purple-700 flex items-center justify-center text-white shadow-xs border border-purple-800">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="font-extrabold text-lg text-purple-950 tracking-tight">
            Credi<span className="text-purple-700">ULEP</span>
          </span>
        </div>

        {/* Right Section */}
        <div className="flex items-center space-x-3">
          {currentUser ? (
            <>
              <div 
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-50 border border-purple-200 text-xs text-purple-900"
                title="Sesión segura"
              >
                <Clock className="w-3.5 h-3.5 text-purple-700" />
                <span className="text-purple-700 font-medium">Sesión:</span>
                <span className="font-mono font-bold text-purple-950">{formatTime(sessionSeconds)}</span>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition cursor-pointer"
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
                  className="px-4 py-2 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-300 rounded-md transition cursor-pointer"
                >
                  Crear usuario
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onSwitchView('LOGIN')}
                  className="px-4 py-2 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-md shadow-xs border border-purple-800 transition cursor-pointer"
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
