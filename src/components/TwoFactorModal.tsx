import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Smartphone, RefreshCw, KeyRound, ArrowRight, X } from 'lucide-react';

interface TwoFactorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: (otp: string) => boolean;
  expectedOtp: string;
  userPhone: string;
  userEmail: string;
  onResendOtp: () => string;
}

export const TwoFactorModal: React.FC<TwoFactorModalProps> = ({
  isOpen,
  onClose,
  onVerify,
  expectedOtp,
  userPhone,
  userEmail,
  onResendOtp
}) => {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [currentExpectedOtp, setCurrentExpectedOtp] = useState<string>(expectedOtp);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setCurrentExpectedOtp(expectedOtp);
    setDigits(['', '', '', '', '', '']);
    setTimeLeft(60);
    setErrorMsg(null);
    if (isOpen) {
      setTimeout(() => inputRefs.current[0]?.focus(), 150);
    }
  }, [isOpen, expectedOtp]);

  useEffect(() => {
    if (!isOpen || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, timeLeft]);

  if (!isOpen) return null;

  const handleDigitChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      const copy = [...digits];
      copy[index] = '';
      setDigits(copy);
      return;
    }

    const singleDigit = cleaned.slice(-1);
    const copy = [...digits];
    copy[index] = singleDigit;
    setDigits(copy);
    setErrorMsg(null);

    if (index < 5 && singleDigit) {
      inputRefs.current[index + 1]?.focus();
    }

    const fullCode = copy.join('');
    if (fullCode.length === 6 && !copy.includes('')) {
      triggerVerification(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const triggerVerification = (code: string) => {
    setIsVerifying(true);
    setErrorMsg(null);

    setTimeout(() => {
      const isValid = onVerify(code);
      setIsVerifying(false);
      if (!isValid) {
        setErrorMsg('Código 2FA incorrecto o expirado.');
      }
    }, 300);
  };

  const handleResend = () => {
    const newOtp = onResendOtp();
    setCurrentExpectedOtp(newOtp);
    setDigits(['', '', '', '', '', '']);
    setTimeLeft(60);
    setErrorMsg(null);
    inputRefs.current[0]?.focus();
  };

  const maskPhone = (ph: string) => {
    if (!ph || ph.length < 8) return 'móvil registrado';
    return ph.slice(0, 4) + ' ••• ' + ph.slice(-3);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-purple-950/40 backdrop-blur-sm animate-fadeIn">
      <div 
        className="relative w-full max-w-sm max-h-[92vh] overflow-y-auto bg-white border border-purple-200 rounded-lg shadow-xl p-5 sm:p-7 text-purple-950"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 text-purple-400 hover:text-purple-700 p-1 rounded-md transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-4 sm:mb-5">
          <div className="inline-flex p-2.5 sm:p-3 rounded-lg bg-purple-50 text-purple-700 mb-2 border border-purple-200">
            <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-purple-950">
            Verificación 2FA
          </h3>
          <p className="text-xs text-purple-700/80 mt-0.5">
            Ingrese el código enviado a su número:
          </p>
          <div className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 bg-purple-50 border border-purple-200 rounded text-xs font-mono text-purple-900">
            <Smartphone className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            <span>{maskPhone(userPhone)}</span>
          </div>
        </div>

        {/* Notificación de transmisión de código */}
        <div className="mb-4 p-2.5 rounded-md bg-purple-50/80 border border-purple-200 text-xs text-purple-900 flex items-center justify-between gap-2 font-mono">
          <span className="text-[11px] text-purple-700 font-sans">Código de seguridad transmitido:</span>
          <span className="font-bold text-purple-950 tracking-wider text-sm shrink-0">{currentExpectedOtp}</span>
        </div>

        {/* 6 Digits */}
        <div className="flex justify-center gap-1.5 sm:gap-2 my-4">
          {digits.map((digit, idx) => (
            <input
              key={idx}
              ref={el => { inputRefs.current[idx] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleDigitChange(idx, e.target.value)}
              onKeyDown={e => handleKeyDown(idx, e)}
              className={`w-9 h-11 sm:w-10 sm:h-12 text-center font-mono text-lg sm:text-xl font-bold rounded-md border bg-white text-purple-950 focus:outline-none transition ${
                errorMsg 
                  ? 'border-rose-400' 
                  : digit 
                    ? 'border-purple-700 bg-purple-50/50' 
                    : 'border-purple-300 focus:border-purple-700 focus:ring-1 focus:ring-purple-700'
              }`}
            />
          ))}
        </div>

        {errorMsg && (
          <div className="mb-3 text-center text-xs font-medium text-rose-600">
            {errorMsg}
          </div>
        )}

        <button
          type="button"
          disabled={digits.join('').length !== 6 || isVerifying}
          onClick={() => triggerVerification(digits.join(''))}
          className="w-full py-3 px-4 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold text-xs rounded-md shadow-xs border border-purple-800 flex items-center justify-center gap-2 transition cursor-pointer"
        >
          {isVerifying ? (
            <span>Verificando...</span>
          ) : (
            <>
              <span>Confirmar Código</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleResend}
            disabled={timeLeft > 30}
            className="text-xs font-medium text-purple-700 hover:text-purple-950 disabled:text-purple-300 transition"
          >
            Reenviar código ({timeLeft}s)
          </button>
        </div>
      </div>
    </div>
  );
};
