/**
 * CrediPortal - Portal Financiero Seguro
 * Diseño simplificado en blanco y tonos de morado con bordes suavizados y animaciones de carga
 */

import React, { useState, useEffect } from 'react';
import { User, CreditStatus } from './types';
import { StorageService } from './services/storageService';
import { notificationService } from './services/notificationService';
import { Navbar } from './components/Navbar';
import { LoginForm } from './components/LoginForm';
import { RegisterForm } from './components/RegisterForm';
import { Dashboard } from './components/Dashboard';
import { AdminPanel } from './components/AdminPanel';
import { PasswordRecoveryModal } from './components/PasswordRecoveryModal';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { PushNotificationToast } from './components/PushNotificationToast';
import { Footer } from './components/Footer';
import { ShieldCheck } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Estados de animación de carga al inicio y al cambiar de bloques
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isBlockTransitioning, setIsBlockTransitioning] = useState<boolean>(false);

  // Modals state
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState<boolean>(false);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        await StorageService.initializeDefaultData();
      } catch (err) {
        console.warn('Advertencia en inicialización de bóveda:', err);
      } finally {
        if (isMounted) {
          setTimeout(() => {
            setIsInitialLoading(false);
          }, 350);
        }
      }
    };
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  const triggerBlockTransition = React.useCallback((callback: () => void) => {
    setIsBlockTransitioning(true);
    setTimeout(() => {
      callback();
      setIsBlockTransitioning(false);
    }, 360);
  }, []);

  // El código OTP es exclusivo para el Registro; el inicio de sesión ingresa directamente con transición de bloque
  const handleCredentialsSuccess = React.useCallback((user: User) => {
    triggerBlockTransition(() => {
      setCurrentUser(user);

      StorageService.addAuditEntry(
        'SESSION_AUTHENTICATED',
        user.id,
        user.cedula,
        `Ingreso directo autenticado al portal (${user.role || 'CLIENT'}).`
      );

      if (user.creditStatus === 'PENDIENTE' && (!user.role || user.role === 'CLIENT')) {
        notificationService.sendPush({
          title: 'CrediULEP - Crédito en Evaluación',
          message: 'Pronto validaremos tus datos para que puedas disfrutar de tu crédito.',
          type: 'credit_pending'
        });
      } else {
        notificationService.sendPush({
          title: 'Sesión Iniciada',
          message: `Hola ${user.fullName}, bienvenido/a a tu portal CrediULEP.`,
          type: 'login_2fa'
        });
      }
    });
  }, [triggerBlockTransition]);

  const handleRegisterSubmit = async (formData: {
    cedula: string;
    fullName: string;
    email: string;
    phone: string;
    password: string;
    creditStatus: CreditStatus;
    initialBalance: number;
    legalSignature?: any;
  }): Promise<{ success: boolean; message?: string }> => {
    try {
      const result = await StorageService.registerUser(formData);
      if (result.success && result.user) {
        const registeredUser = result.user;
        triggerBlockTransition(() => {
          setCurrentUser(registeredUser);
          notificationService.sendPush({
            title: '¡Bienvenido/a a CrediULEP!',
            message: 'Pronto validaremos tus datos para que puedas disfrutar de tu crédito.',
            type: 'credit_pending'
          });
        });
        return { success: true };
      } else {
        return {
          success: false,
          message: result.message || 'No fue posible completar el registro. Verifique sus datos.'
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Ocurrió un error inesperado al procesar el registro.'
      };
    }
  };

  const handleLogout = React.useCallback(() => {
    if (currentUser) {
      StorageService.addAuditEntry(
        'SESSION_LOGOUT',
        currentUser.id,
        currentUser.cedula,
        'Cierre de sesión finalizado.'
      );
    }
    triggerBlockTransition(() => {
      setCurrentUser(null);
      setActiveView('LOGIN');
    });
  }, [currentUser, triggerBlockTransition]);

  const handleSwitchView = React.useCallback((view: 'LOGIN' | 'REGISTER') => {
    setActiveView(prev => {
      if (prev === view) return prev;
      triggerBlockTransition(() => {
        setActiveView(view);
      });
      return prev;
    });
  }, [triggerBlockTransition]);

  const isAdminOrWorker = currentUser?.role === 'ADMIN' || currentUser?.role === 'WORKER';

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-[#fcfaff] flex flex-col items-center justify-center p-6 font-sans">
        <div className="bg-white/90 border border-purple-200 rounded-2xl p-8 shadow-xs flex flex-col items-center space-y-4 max-w-xs w-full animate-fadeIn">
          <img
            src={`${import.meta.env.BASE_URL}assets/aistudio/52878_14fa00e9.png`}
            alt="Logo"
            className="h-6 sm:h-7 w-auto object-contain select-none mx-auto block"
          />
          <div className="text-center">
            <p className="text-xs text-purple-700/80 font-medium">
              Cargando plataforma financiera...
            </p>
          </div>
          <div className="w-full h-1.5 bg-purple-100 rounded-full overflow-hidden">
            <div className="w-1/2 h-full bg-purple-700 rounded-full animate-shimmerBar" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcfaff] text-purple-950 flex flex-col font-sans selection:bg-purple-600 selection:text-white">
      {/* Top Navbar solo cuando el usuario está autenticado */}
      {currentUser && !isAdminOrWorker && (
        <Navbar
          currentUser={currentUser}
          onLogout={handleLogout}
          onOpenPrivacyModal={() => setIsPrivacyModalOpen(true)}
          activeView={activeView}
          onSwitchView={handleSwitchView}
        />
      )}

      {/* Main Container con fondo animado de 3 cintas deslizándose tipo serpientes */}
      <div className={`flex-1 flex flex-col relative overflow-hidden ${isAdminOrWorker ? '' : currentUser ? 'justify-start' : 'justify-center py-5 sm:py-8 md:py-12 px-3 sm:px-6'}`}>
        {/* Fondo: 3 cintas gruesas redondeadas, nítidas sin desenfoque, deslizándose y pausadas atrás */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
          <svg
            className="w-full h-full absolute inset-0 opacity-90"
            viewBox="0 0 1600 900"
            fill="none"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="crispRibbon1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6b21a8" />
                <stop offset="30%" stopColor="#9333ea" />
                <stop offset="70%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#7e22ce" />
              </linearGradient>

              <linearGradient id="crispRibbon2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4c1d95" />
                <stop offset="35%" stopColor="#7c3aed" />
                <stop offset="70%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#5b21b6" />
              </linearGradient>

              <linearGradient id="crispRibbon3" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7e22ce" />
                <stop offset="35%" stopColor="#c084fc" />
                <stop offset="70%" stopColor="#e879f9" />
                <stop offset="100%" stopColor="#9333ea" />
              </linearGradient>
            </defs>

            {/* Cinta 1: Gruesa, redondeada, superior (sin línea de centro) */}
            <g>
              <path
                d="M -200 220 C 180 80, 480 370, 850 200 C 1220 30, 1500 340, 1880 180"
                stroke="url(#crispRibbon1)"
                strokeWidth="38"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-ribbon1"
                opacity="0.95"
              />
            </g>

            {/* Cinta 2: Gruesa, redondeada, inferior (sin línea de centro) */}
            <g>
              <path
                d="M -220 690 C 180 490, 520 830, 920 640 C 1300 450, 1560 760, 1900 580"
                stroke="url(#crispRibbon2)"
                strokeWidth="46"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-ribbon2"
                opacity="0.9"
              />
            </g>

            {/* Cinta 3: Gruesa, redondeada, diagonal central (sin línea de centro) */}
            <g>
              <path
                d="M -200 810 C 180 750, 450 360, 840 450 C 1220 530, 1440 220, 1880 120"
                stroke="url(#crispRibbon3)"
                strokeWidth="32"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-ribbon3"
                opacity="0.92"
              />
            </g>
          </svg>
        </div>

        {isBlockTransitioning ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 animate-fadeIn relative z-10">
            <div className="bg-white border border-purple-200 rounded-2xl p-7 shadow-xs flex flex-col items-center space-y-3.5 max-w-xs w-full">
              <div className="relative flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border-3 border-purple-100 border-t-purple-700 animate-spin" />
                <ShieldCheck className="w-5 h-5 text-purple-700 absolute" />
              </div>
              <span className="text-xs font-bold text-purple-900 tracking-wide">
                Sincronizando sección...
              </span>
              <div className="w-36 h-1 bg-purple-100 rounded-full overflow-hidden">
                <div className="w-1/2 h-full bg-purple-700 rounded-full animate-shimmerBar" />
              </div>
            </div>
          </div>
        ) : currentUser ? (
          isAdminOrWorker ? (
            /* Panel de Administrador / Trabajador */
            <div className="animate-fadeIn flex-1 flex flex-col relative z-10">
              <AdminPanel
                currentUser={currentUser}
                onLogout={handleLogout}
                onOpenPrivacyModal={() => setIsPrivacyModalOpen(true)}
              />
            </div>
          ) : (
            /* Dashboard del Cliente */
            <div className="animate-fadeIn flex-1 flex flex-col relative z-10">
              <Dashboard
                currentUser={currentUser}
                onLogout={handleLogout}
                onOpenPrivacyModal={() => setIsPrivacyModalOpen(true)}
              />
            </div>
          )
        ) : (
          /* Vista de Ingreso / Registro */
          <div className={`w-full ${activeView === 'REGISTER' ? 'max-w-4xl px-2 sm:px-6' : 'max-w-md'} mx-auto transition-all duration-300 animate-fadeIn relative z-10`}>
            {activeView === 'LOGIN' ? (
              <LoginForm
                onSuccessCredentials={handleCredentialsSuccess}
                onOpenRecovery={() => setIsRecoveryModalOpen(true)}
                onSwitchToRegister={() => handleSwitchView('REGISTER')}
                onOpenPrivacyModal={() => setIsPrivacyModalOpen(true)}
              />
            ) : (
              <RegisterForm
                onRegisterSubmit={handleRegisterSubmit}
                onOpenPrivacyModal={() => setIsPrivacyModalOpen(true)}
                onSwitchToLogin={() => handleSwitchView('LOGIN')}
              />
            )}
          </div>
        )}
      </div>

      {/* Push Notification Toast */}
      <PushNotificationToast />

      {isRecoveryModalOpen && (
        <PasswordRecoveryModal
          isOpen={isRecoveryModalOpen}
          onClose={() => setIsRecoveryModalOpen(false)}
          onSuccess={() => handleSwitchView('LOGIN')}
        />
      )}

      <PrivacyPolicyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />

      {/* Pie de Página Institucional */}
      <Footer
        onOpenPrivacyModal={() => setIsPrivacyModalOpen(true)}
      />
    </div>
  );
}

