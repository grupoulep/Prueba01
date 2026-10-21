import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { HelpPanelModal } from './HelpPanelModal';

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
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
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

  if (!currentUser) {
    return null;
  }

  const firstName = currentUser?.fullName
    ? currentUser.fullName.trim().split(/\s+/)[0]
    : 'Usuario';

  return (
    <>
      <header className="relative w-full bg-[#fcfaff] border-b border-purple-100/80">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          {/* Logo sin bordes ni burbujas sobre fondo claro con saludo ¡Hola <nombre>! en morado */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <img
              src={`${import.meta.env.BASE_URL}assets/aistudio/52878_14fa00e9.png`}
              alt="Logo"
              className="h-5 sm:h-6 w-auto object-contain select-none shrink-0"
            />
            <span className="text-xs sm:text-sm font-extrabold text-purple-900 truncate tracking-tight">
              ¡Hola {firstName}!
            </span>
          </div>

          {/* Lado derecho: Signo de interrogación dentro de un círculo de color gris pequeño sin letras y sin nada de más */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setIsHelpOpen(true)}
              aria-label="Panel de Ayuda"
              title="Panel de Ayuda"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-200 hover:bg-gray-300 active:scale-95 text-gray-800 text-xs sm:text-sm font-extrabold flex items-center justify-center transition cursor-pointer shadow-2xs border border-gray-300 focus:outline-none"
            >
              <span className="leading-none select-none">?</span>
            </button>
          </div>
        </div>
      </header>

      {/* Panel de Ayuda Modal */}
      <HelpPanelModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        currentUser={currentUser}
        onLogout={onLogout}
        onOpenPrivacyModal={onOpenPrivacyModal}
      />
    </>
  );
};

