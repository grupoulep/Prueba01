import React, { useState, useEffect } from 'react';
import { Lock, CreditCard, ShieldCheck, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { User } from '../types';

interface LoginFormProps {
  onSuccessCredentials: (user: User) => void;
  onOpenRecovery: () => void;
  onSwitchToRegister: () => void;
  onOpenPrivacyModal?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSuccessCredentials,
  onOpenRecovery,
  onSwitchToRegister,
  onOpenPrivacyModal: _onOpenPrivacyModal
}) => {
  const [cedula, setCedula] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lockCountdown, setLockCountdown] = useState<number | null>(null);

  // Lockout countdown timer
  useEffect(() => {
    if (lockCountdown === null || lockCountdown <= 0) return;
    const timer = setInterval(() => {
      setLockCountdown(prev => {
        if (prev === null || prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockCountdown]);

  useEffect(() => {
    if (lockCountdown === 0) {
      setLockCountdown(null);
      setErrorMessage(null);
    }
  }, [lockCountdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockCountdown && lockCountdown > 0) return;

    setErrorMessage(null);
    if (!cedula.trim()) {
      setErrorMessage('Por favor ingrese su Cédula de ciudadanía.');
      return;
    }
    if (!password) {
      setErrorMessage('Por favor ingrese su Clave.');
      return;
    }

    setIsSubmitting(true);
    const result = await StorageService.validateCredentials(cedula, password);
    setIsSubmitting(false);

    if (result.success && result.user) {
      onSuccessCredentials(result.user);
    } else {
      if (result.errorType === 'LOCKED' && result.lockSecondsLeft) {
        setLockCountdown(result.lockSecondsLeft);
      }
      setErrorMessage(result.message);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-7 sm:p-9 bg-white border border-purple-100 rounded-3xl shadow-[0_10px_35px_rgba(107,33,168,0.08)] font-sans">
      {/* Logo */}
      <div className="text-center mb-6">
        <div className="w-13 h-13 rounded-2xl bg-purple-700 flex items-center justify-center text-white mx-auto mb-2.5 shadow-sm border border-purple-800/40">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <div className="font-extrabold text-2xl text-purple-950 tracking-tight">
          Credi<span className="text-purple-700">ULEP</span>
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span>{errorMessage}</span>
            {lockCountdown && lockCountdown > 0 && (
              <div className="mt-1 font-bold text-rose-900">
                Espere: {lockCountdown}s
              </div>
            )}
          </div>
        </div>
      )}

      {/* Formulario / Casillas */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Casilla Cédula */}
        <div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-400">
              <CreditCard className="w-4 h-4" />
            </div>
            <input
              type="text"
              required
              aria-label="cédula"
              value={cedula}
              onChange={e => setCedula(e.target.value.trim())}
              placeholder="cédula"
              className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-purple-50/30 border border-purple-200 text-purple-950 text-sm placeholder:text-purple-300 focus:bg-white focus:border-purple-700 focus:ring-2 focus:ring-purple-700/20 focus:outline-none lowercase transition"
              autoComplete="username"
            />
          </div>
        </div>

        {/* Casilla Clave */}
        <div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              aria-label="Clave"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Clave"
              className="w-full pl-10 pr-10 py-3.5 rounded-xl bg-purple-50/30 border border-purple-200 text-purple-950 text-sm placeholder:text-purple-300 focus:bg-white focus:border-purple-700 focus:ring-2 focus:ring-purple-700/20 focus:outline-none transition"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-4 text-purple-400 hover:text-purple-950 cursor-pointer"
              aria-label={showPassword ? 'Ocultar clave' : 'Ver clave'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex justify-end mt-1.5">
            <button
              type="button"
              onClick={onOpenRecovery}
              className="text-xs font-semibold text-purple-700 hover:text-purple-950 hover:underline cursor-pointer"
            >
              ¿Olvidaste tu clave?
            </button>
          </div>
        </div>

        {/* Botón Iniciar Sesión - Estilo Pill en Morado y Blanco */}
        <button
          type="submit"
          disabled={isSubmitting || (lockCountdown !== null && lockCountdown > 0)}
          className="w-full py-3.5 px-4 bg-purple-700 hover:bg-purple-800 active:bg-purple-900 disabled:opacity-50 text-white font-bold text-sm rounded-full shadow-sm flex items-center justify-center gap-2 cursor-pointer mt-3 transition"
        >
          {isSubmitting ? (
            <span>Verificando credenciales...</span>
          ) : (
            <>
              <span>Iniciar Sesión</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {/* Enlace de registro */}
        <div className="pt-2 text-center">
          <p className="text-xs text-purple-900/70">
            ¿No tienes una cuenta?{' '}
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="font-bold text-purple-700 hover:text-purple-950 hover:underline cursor-pointer"
            >
              Crear usuario
            </button>
          </p>
        </div>
      </form>

      {/* Usuarios de Prueba (Al Día, En Mora, Sin Aceptar, Admin y Trabajador) */}
      <div className="mt-6 pt-5 border-t border-purple-100 space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-purple-800/60 text-center">
          Cuentas de Prueba Disponibles
        </div>

        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => {
              setCedula('1020304050');
              setPassword('Password123!');
              setErrorMessage(null);
            }}
            className="w-full px-3.5 py-2.5 rounded-xl bg-purple-50/40 hover:bg-purple-100/60 border border-purple-200/70 text-left flex items-center justify-between cursor-pointer transition"
          >
            <div>
              <div className="text-xs font-bold text-purple-950">Cliente: Crédito Al Día</div>
              <div className="text-[11px] text-purple-700/80">Valentina Ríos • C.C. 1020304050</div>
            </div>
            <span className="px-2.5 py-0.5 bg-purple-700 text-white text-[10px] font-bold rounded-full">
              AL DÍA
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCedula('1030405060');
              setPassword('Password123!');
              setErrorMessage(null);
            }}
            className="w-full px-3.5 py-2.5 rounded-xl bg-purple-50/40 hover:bg-purple-100/60 border border-purple-200/70 text-left flex items-center justify-between cursor-pointer transition"
          >
            <div>
              <div className="text-xs font-bold text-purple-950">Cliente: Crédito En Mora</div>
              <div className="text-[11px] text-purple-700/80">Andrés Morales • C.C. 1030405060</div>
            </div>
            <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold rounded-full">
              EN MORA (45d)
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCedula('9876543210');
              setPassword('Password123!');
              setErrorMessage(null);
            }}
            className="w-full px-3.5 py-2.5 rounded-xl bg-purple-50/40 hover:bg-purple-100/60 border border-purple-200/70 text-left flex items-center justify-between cursor-pointer transition"
          >
            <div>
              <div className="text-xs font-bold text-purple-950">Cliente: Crédito Sin Aceptar</div>
              <div className="text-[11px] text-purple-700/80">Mateo Restrepo • C.C. 9876543210</div>
            </div>
            <span className="px-2.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold rounded-full">
              SIN ACEPTAR
            </span>
          </button>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setCedula('ADMINIULEP');
                setPassword('ADMINIULEP');
                setErrorMessage(null);
              }}
              className="px-3 py-2 rounded-xl bg-purple-50/40 hover:bg-purple-100/60 border border-purple-200/70 text-left cursor-pointer transition"
            >
              <div className="text-xs font-bold text-purple-950">Panel Admin</div>
              <div className="text-[11px] text-purple-700/80">ADMINIULEP</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setCedula('OP-2001');
                setPassword('Worker123!');
                setErrorMessage(null);
              }}
              className="px-3 py-2 rounded-xl bg-purple-50/40 hover:bg-purple-100/60 border border-purple-200/70 text-left cursor-pointer transition"
            >
              <div className="text-xs font-bold text-purple-950">Panel Trabajador</div>
              <div className="text-[11px] text-purple-700/80">OP-2001</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
