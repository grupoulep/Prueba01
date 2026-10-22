import React, { useState } from 'react';
import { KeyRound, ShieldAlert, CheckCircle2, ArrowRight, X, Lock, Eye, EyeOff } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { generateSecureOTP } from '../services/cryptoService';
import { FirebaseService, formatE164PhoneNumber } from '../services/firebaseService';

interface PasswordRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PasswordRecoveryModal: React.FC<PasswordRecoveryModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [step, setStep] = useState<'CEDULA' | 'OTP' | 'NEW_PASSWORD' | 'DONE'>('CEDULA');
  const [cedula, setCedula] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [inputOtp, setInputOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCedulaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!cedula.trim()) {
      setErrorMsg('Por favor ingrese su Cédula de ciudadanía.');
      return;
    }

    setIsSubmitting(true);
    const { user, isTampered } = await StorageService.getUserByCedula(cedula);
    setIsSubmitting(false);

    if (isTampered || !user) {
      setErrorMsg('No se encontró ninguna cuenta asociada a este número de cédula.');
      return;
    }

    const otp = generateSecureOTP();
    setGeneratedOtp(otp);
    setStep('OTP');

    const targetPhone = user.phone ? formatE164PhoneNumber(user.phone) : '';
    if (targetPhone) {
      FirebaseService.requestPhoneNumberVerification(targetPhone, otp).catch(() => {});
    }
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (inputOtp.trim() !== generatedOtp.trim()) {
      setErrorMsg('El código de verificación no es válido.');
      return;
    }

    setStep('NEW_PASSWORD');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (newPassword.length < 8) {
      setErrorMsg('La clave debe tener al menos 8 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Las claves no coinciden.');
      return;
    }

    setIsSubmitting(true);
    const result = await StorageService.resetPassword(cedula, newPassword);
    setIsSubmitting(false);

    if (result.success) {
      setStep('DONE');
      setTimeout(() => {
        onSuccess();
        onClose();
        resetModal();
      }, 1500);
    } else {
      setErrorMsg(result.message);
    }
  };

  const resetModal = () => {
    setStep('CEDULA');
    setCedula('');
    setInputOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-purple-950/40 backdrop-blur-sm animate-fadeIn">
      <div 
        className="relative w-full max-w-sm bg-white border border-purple-200 rounded-lg shadow-xl p-6 sm:p-7 text-purple-950"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={() => { onClose(); resetModal(); }}
          className="absolute top-4 right-4 text-purple-400 hover:text-purple-700 p-1 rounded-md transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-5">
          <div className="inline-flex p-3 rounded-lg bg-purple-50 text-purple-700 mb-2 border border-purple-200">
            <KeyRound className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-bold text-purple-950">
            Recuperar Clave
          </h3>
          <p className="text-xs text-purple-700/80 mt-0.5">
            Restablezca su acceso en simples pasos
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-md">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: CEDULA */}
        {step === 'CEDULA' && (
          <form onSubmit={handleCedulaSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                Cédula de ciudadanía
              </label>
              <input
                type="text"
                value={cedula}
                onChange={e => setCedula(e.target.value.replace(/\D/g, ''))}
                placeholder="Cédula de ciudadanía"
                className="w-full px-3.5 py-2.5 rounded-md bg-white border border-purple-300 text-purple-950 font-mono text-sm focus:border-purple-700 focus:outline-none"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !cedula}
              className="w-full py-3 px-4 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold text-xs rounded-md shadow-xs border border-purple-800 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Continuar</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* STEP 2: OTP */}
        {step === 'OTP' && (
          <form onSubmit={handleOtpSubmit} className="space-y-4">
            <div className="p-2.5 rounded-md bg-purple-50/80 border border-purple-200 text-xs text-purple-900 flex items-center justify-between font-mono">
              <span className="text-[11px] text-purple-700 font-sans">Código de recuperación:</span>
              <span className="font-bold text-purple-950 tracking-wider text-sm">{generatedOtp}</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                Código de 6 Dígitos
              </label>
              <input
                type="text"
                maxLength={6}
                value={inputOtp}
                onChange={e => setInputOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full px-3.5 py-2.5 rounded-md bg-white border border-purple-300 text-purple-950 font-mono text-center text-lg tracking-widest focus:border-purple-700 focus:outline-none"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={inputOtp.length !== 6}
              className="w-full py-3 px-4 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold text-xs rounded-md shadow-xs border border-purple-800 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Verificar Código</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* STEP 3: NEW PASSWORD */}
        {step === 'NEW_PASSWORD' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                Nueva Clave
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-3.5 py-2.5 rounded-md bg-white border border-purple-300 text-purple-950 text-sm focus:border-purple-700 focus:outline-none pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-purple-400 hover:text-purple-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                Confirmar Clave
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repetir clave"
                className="w-full px-3.5 py-2.5 rounded-md bg-white border border-purple-300 text-purple-950 text-sm focus:border-purple-700 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !newPassword || !confirmPassword}
              className="w-full py-3 px-4 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold text-xs rounded-md shadow-xs border border-purple-800 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>Guardar Clave</span>
            </button>
          </form>
        )}

        {/* STEP 4: DONE */}
        {step === 'DONE' && (
          <div className="py-6 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-purple-600 mx-auto" />
            <h4 className="text-sm font-bold text-purple-950">¡Clave Actualizada!</h4>
          </div>
        )}
      </div>
    </div>
  );
};
