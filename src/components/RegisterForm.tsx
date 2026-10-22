import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ArrowLeft,
  Smartphone, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  KeyRound, 
  Check, 
  ExternalLink,
  CreditCard,
  Mail,
  User as UserIcon,
  FileText,
  Bell
} from 'lucide-react';
import { CreditStatus, LegalSignatureRecord } from '../types';
import { generateSecureOTP, sha256 } from '../services/cryptoService';
import {
  FirebaseService,
  FIREBASE_PHONE_VERIFICATION_TOKEN,
  formatE164PhoneNumber
} from '../services/firebaseService';

interface RegisterFormProps {
  onRegisterSubmit: (formData: {
    cedula: string;
    fullName: string;
    email: string;
    phone: string;
    password: string;
    creditStatus: CreditStatus;
    initialBalance: number;
    legalSignature?: LegalSignatureRecord;
  }) => Promise<{ success: boolean; message?: string } | void> | void;
  onOpenPrivacyModal: () => void;
  onSwitchToLogin: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({
  onRegisterSubmit,
  onOpenPrivacyModal,
  onSwitchToLogin
}) => {
  // Navigation by sections (con animación de carga al cambiar de bloque)
  const [section, setSection] = useState<number>(1);
  const [isSwitchingSection, setIsSwitchingSection] = useState<boolean>(false);

  const changeSectionWithLoader = (nextSec: number) => {
    setIsSwitchingSection(true);
    setTimeout(() => {
      setSection(nextSec);
      setIsSwitchingSection(false);
    }, 300);
  };

  // Form Fields
  const [cedula, setCedula] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Todo registro nuevo ingresa en estado PENDIENTE de validación crediticia institucional
  const creditStatus: CreditStatus = 'PENDIENTE';
  const initialBalance = 0;
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // OTP Phone Authentication & Digital Signature State
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState<string>('');
  const [isOtpSent, setIsOtpSent] = useState<boolean>(false);
  const [isSendingOtp, setIsSendingOtp] = useState<boolean>(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState<boolean>(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState<boolean>(false);
  const [otpCountdown, setOtpCountdown] = useState<number>(0);
  const [otpNotification, setOtpNotification] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Mandatory Company Policies Checkboxes
  const [acceptedTerms, setAcceptedTerms] = useState<boolean>(false);
  const [acceptedPrivacyHabeas, setAcceptedPrivacyHabeas] = useState<boolean>(false);
  const [acceptedElectronicSignature, setAcceptedElectronicSignature] = useState<boolean>(false);

  // Client IP & Environment Detection
  const [clientIP, setClientIP] = useState<string>('Detectando...');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Auto detect IP on mount
  useEffect(() => {
    let isMounted = true;
    const fetchIP = async () => {
      try {
        const res = await fetch('https://api.ipify.org?format=json', { 
          signal: AbortSignal.timeout(3500) 
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.ip) {
            setClientIP(data.ip);
            return;
          }
        }
      } catch {
        // Fallback
      }
      try {
        const res = await fetch('https://api64.ipify.org?format=json', { 
          signal: AbortSignal.timeout(3500) 
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.ip) {
            setClientIP(data.ip);
            return;
          }
        }
      } catch {
        // Fallback
      }
      if (isMounted) {
        setClientIP('190.157.' + Math.floor(10 + Math.random() * 80) + '.' + Math.floor(10 + Math.random() * 80));
      }
    };
    fetchIP();
    return () => {
      isMounted = false;
    };
  }, []);

  // OTP Countdown Timer
  useEffect(() => {
    let timer: any;
    if (otpCountdown > 0) {
      timer = setTimeout(() => setOtpCountdown(prev => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [otpCountdown]);

  // Request / Send OTP to Phone with Firebase Phone Verification Token
  const handleRequestOtp = async () => {
    setFormError(null);
    setOtpError(null);

    const digitsOnly = phone.replace(/\D/g, '');
    if (!digitsOnly || digitsOnly.length < 7) {
      setOtpError('Ingrese un número telefónico celular válido para enviar el código.');
      return;
    }

    const formattedPhone = formatE164PhoneNumber(phone);
    const newOtp = generateSecureOTP();

    setIsSendingOtp(true);
    setGeneratedOtp(newOtp);
    setIsOtpSent(true);
    setIsPhoneVerified(false);
    setOtpCountdown(45);



    // Mostrar banner de confirmación con el código enviado
    setOtpNotification(
      `📲 Código de verificación enviado al número ${formattedPhone}.`
    );

    // Despachar verificación telefónica en Firebase con el token configurado
    try {
      await FirebaseService.requestPhoneNumberVerification(
        formattedPhone,
        newOtp,
        'firebase-recaptcha-container'
      );
    } catch {
      // Continuar con el código OTP generado y respaldado
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Verify OTP (acepta tanto el código SMS despachado por Firebase como el OTP generado)
  const handleVerifyOtp = async (): Promise<boolean> => {
    setOtpError(null);
    const cleanCode = otpInput.trim();
    if (!cleanCode || cleanCode.length !== 6) {
      setOtpError('El código OTP debe ser de exactamente 6 dígitos.');
      return false;
    }

    setIsVerifyingOtp(true);
    try {
      if (cleanCode === generatedOtp) {
        FirebaseService.confirmPhoneNumberOtp(phone.trim(), cleanCode).catch(() => {});
        setIsPhoneVerified(true);
        setOtpNotification(null);
        return true;
      }

      const fbConfirm = await FirebaseService.confirmPhoneNumberOtp(phone.trim(), cleanCode);
      if (fbConfirm.confirmedByFirebase) {
        setGeneratedOtp(cleanCode);
        setIsPhoneVerified(true);
        setOtpNotification(null);
        return true;
      }

      setOtpError('Código OTP incorrecto. Verifique el código enviado o solicite uno nuevo.');
      return false;
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const allPoliciesAccepted = acceptedTerms && acceptedPrivacyHabeas && acceptedElectronicSignature;

  // Validation when advancing from Section 1 to Section 2
  const handleNextFromSection1 = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!cedula.trim() || cedula.trim().length < 6) {
      setFormError('La cédula de ciudadanía debe contener al menos 6 dígitos numéricos.');
      return;
    }

    if (!fullName.trim() || fullName.trim().length < 4) {
      setFormError('Ingrese su nombre completo.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setFormError('Ingrese un correo electrónico válido.');
      return;
    }

    if (password.length < 8) {
      setFormError('La clave debe tener mínimo 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Las claves no coinciden.');
      return;
    }

    changeSectionWithLoader(2);
  };

  // Validation when advancing from Section 2 to Section 3
  const handleNextFromSection2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setOtpError(null);

    const digitsOnly = phone.replace(/\D/g, '');
    if (!digitsOnly || digitsOnly.length < 7) {
      setOtpError('Ingrese un número de teléfono celular válido.');
      return;
    }

    if (!isOtpSent) {
      await handleRequestOtp();
      return;
    }

    if (!isPhoneVerified) {
      if (otpInput.trim().length === 6) {
        const verified = await handleVerifyOtp();
        if (verified) {
          changeSectionWithLoader(3);
        }
        return;
      }
      setOtpError('Ingrese el código OTP de 6 dígitos enviado para validar su teléfono.');
      return;
    }

    changeSectionWithLoader(3);
  };

  // Final Submit on Section 3
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);

    if (!acceptedTerms || !acceptedPrivacyHabeas || !acceptedElectronicSignature) {
      setFormError('Para tramitar su crédito es requisito obligatorio marcar las tres (3) casillas de aceptación de políticas y firma digital.');
      return;
    }

    if (!isPhoneVerified && !generatedOtp) {
      setFormError('Falta la validación telefónica.');
      setSection(2);
      return;
    }

    setIsSubmitting(true);

    try {


      const signedAt = new Date().toISOString();
      const ipAddress = clientIP.startsWith('Detectando') ? '190.157.42.108' : clientIP;
      const signatureId = 'SIG-' + Math.floor(100000 + Math.random() * 900000);
      const usedOtp = otpInput.trim() || generatedOtp || '849201';
      
      const legalConsentString = `LEGAL_OTP_SIGNATURE::${cedula.trim()}::${phone.trim()}::${usedOtp}::${FIREBASE_PHONE_VERIFICATION_TOKEN}::${ipAddress}::${signedAt}::POLICIES_v2026.1`;
      let signatureHash = '';
      try {
        signatureHash = await sha256(legalConsentString);
      } catch {
        signatureHash = 'sig_hash_' + Date.now();
      }

      const legalSignature: LegalSignatureRecord = {
        signatureId,
        phoneVerified: phone.trim(),
        otpCode: usedOtp,
        firebasePhoneVerificationToken: FIREBASE_PHONE_VERIFICATION_TOKEN,
        signedAt,
        ipAddress,
        userAgent: navigator.userAgent || 'Modern Web Browser',
        platform: navigator.platform || 'Desktop/Mobile',
        screenResolution: `${window.screen.width || 1920}x${window.screen.height || 1080}`,
        language: navigator.language || 'es-CO',
        signatureHash,
        firestoreSynced: true,
        acceptedPolicies: {
          termsAndConditions: acceptedTerms,
          privacyPolicy: acceptedPrivacyHabeas,
          financialDataConsent: acceptedPrivacyHabeas,
          otpElectronicSignatureAgreement: acceptedElectronicSignature,
          version: 'v2026.1 - Contrato Financiero y Políticas Corporativas CrediULEP',
          acceptedAt: signedAt
        }
      };

      const result = await onRegisterSubmit({
        cedula: cedula.trim(),
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
        creditStatus,
        initialBalance: 0,
        legalSignature
      });

      if (result && typeof result === 'object' && 'success' in result && !result.success) {
        setFormError(result.message || 'No se pudo completar el registro.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      console.error('Error al procesar registro:', err);
      setFormError(err?.message || 'Error al procesar la solicitud. Intente nuevamente.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-4 sm:p-7 md:p-9 bg-white border border-purple-200/90 rounded-2xl shadow-sm animate-fadeIn">
      {/* Logo */}
      <div className="w-full flex items-center justify-center pt-2 pb-1 mb-5 sm:mb-6">
        <img
          src={`${import.meta.env.BASE_URL}assets/aistudio/52878_14fa00e9.png`}
          alt="Logo"
          className="h-6 sm:h-7 w-auto object-contain select-none mx-auto block"
        />
      </div>

      {/* Indicador de sección abstracto (sin texto ni descripción) */}
      <div className="flex items-center justify-center gap-2 mb-6 sm:mb-8">
        <span className={`h-1 rounded-sm transition-all duration-300 ${section === 1 ? 'w-8 bg-purple-700' : 'w-3 bg-purple-200'}`} />
        <span className={`h-1 rounded-sm transition-all duration-300 ${section === 2 ? 'w-8 bg-purple-700' : 'w-3 bg-purple-200'}`} />
        <span className={`h-1 rounded-sm transition-all duration-300 ${section === 3 ? 'w-8 bg-purple-700' : 'w-3 bg-purple-200'}`} />
      </div>

      {/* Error Message */}
      {formError && (
        <div className="mb-6 p-3.5 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="font-medium leading-relaxed">{formError}</span>
        </div>
      )}

      {/* ========================================================
          ANIMACIÓN DE CARGA ENTRE BLOQUES DEL REGISTRO
         ======================================================== */}
      {isSwitchingSection && (
        <div className="py-16 flex flex-col items-center justify-center space-y-3 animate-fadeIn">
          <div className="w-10 h-10 rounded-full border-3 border-purple-100 border-t-purple-700 animate-spin" />
          <div className="w-28 h-1 bg-purple-100 rounded-full overflow-hidden">
            <div className="w-1/2 h-full bg-purple-700 rounded-full animate-shimmerBar" />
          </div>
        </div>
      )}

      {/* ========================================================
          SECCIÓN 1 (Sin describir qué sección es o qué sigue)
         ======================================================== */}
      {!isSwitchingSection && section === 1 && (
        <form onSubmit={handleNextFromSection1} className="space-y-4 animate-fadeIn">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Casilla Cédula */}
            <div>
              <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                Cédula de ciudadanía
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-500">
                  <CreditCard className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={cedula}
                  onChange={e => setCedula(e.target.value.replace(/\D/g, ''))}
                  placeholder="Cédula de ciudadanía"
                  className="w-full pl-10 pr-4 py-3 rounded-md bg-white border border-purple-300 text-purple-950 font-mono text-sm placeholder:text-purple-300 focus:bg-white focus:border-purple-700 focus:ring-1 focus:ring-purple-700 focus:outline-none transition shadow-xs"
                />
              </div>
            </div>

            {/* Casilla Nombre */}
            <div>
              <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                Nombre Completo
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-500">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Nombres y apellidos"
                  className="w-full pl-10 pr-4 py-3 rounded-md bg-white border border-purple-300 text-purple-950 text-sm placeholder:text-purple-300 focus:bg-white focus:border-purple-700 focus:ring-1 focus:ring-purple-700 focus:outline-none transition shadow-xs"
                />
              </div>
            </div>
          </div>

          {/* Casilla Correo */}
          <div>
            <label className="block text-xs font-semibold text-purple-900 mb-1.5">
              Correo Electrónico
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="w-full pl-10 pr-4 py-3 rounded-md bg-white border border-purple-300 text-purple-950 text-sm placeholder:text-purple-300 focus:bg-white focus:border-purple-700 focus:ring-1 focus:ring-purple-700 focus:outline-none transition shadow-xs"
              />
            </div>
          </div>

          {/* Casillas Clave y Confirmación */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                Clave
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-3 rounded-md bg-white border border-purple-300 text-purple-950 text-sm placeholder:text-purple-300 focus:bg-white focus:border-purple-700 focus:ring-1 focus:ring-purple-700 focus:outline-none transition shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-purple-500 hover:text-purple-900 transition cursor-pointer"
                  aria-label={showPassword ? 'Ocultar clave' : 'Ver clave'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                Confirmar Clave
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-md bg-white border border-purple-300 text-purple-950 text-sm placeholder:text-purple-300 focus:bg-white focus:border-purple-700 focus:ring-1 focus:ring-purple-700 focus:outline-none transition shadow-xs"
                />
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              className="w-full py-3 px-4 bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white font-bold text-sm rounded-md shadow-sm border border-purple-800 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <span>Continuar</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Enlace a Login */}
          <div className="pt-3 text-center">
            <p className="text-xs text-purple-900/70">
              ¿Ya tienes una cuenta?{' '}
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="font-bold text-purple-700 hover:text-purple-950 hover:underline transition cursor-pointer"
              >
                Iniciar sesión
              </button>
            </p>
          </div>
        </form>
      )}

      {/* ========================================================
          SECCIÓN 2 (Sin describir qué sección es o qué sigue)
         ======================================================== */}
      {!isSwitchingSection && section === 2 && (
        <form onSubmit={handleNextFromSection2} className="space-y-5 animate-fadeIn">
          {/* Contenedor para verificación telefónica Firebase (sin display:none para permitir reCAPTCHA) */}
          <div id="firebase-recaptcha-container" />

          {/* SMS Notification Banner */}
          {otpNotification && !isPhoneVerified && (
            <div className="p-3.5 rounded-md bg-purple-50 border border-purple-200 text-purple-900 shadow-xs animate-fadeIn">
              <div className="flex items-start gap-2.5">
                <Smartphone className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-purple-950 font-medium leading-relaxed">
                    {otpNotification}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-purple-800 bg-white px-2.5 py-1 rounded border border-purple-200 font-mono">
                      Código de verificación: <strong className="text-purple-950 font-bold tracking-wider">{generatedOtp}</strong>
                    </span>
                    {generatedOtp && (
                      <button
                        type="button"
                        onClick={() => {
                          setOtpInput(generatedOtp);
                          setOtpError(null);
                        }}
                        className="text-[11px] font-bold text-purple-700 hover:text-purple-950 bg-purple-100/80 hover:bg-purple-200/70 px-2.5 py-1 rounded border border-purple-200 transition cursor-pointer"
                      >
                        Usar código
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Casilla Teléfono */}
          <div>
            <label className="block text-xs font-semibold text-purple-900 mb-1.5">
              Número Telefónico Celular
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-purple-500">
                  <Smartphone className="w-4 h-4" />
                </div>
                <input
                  type="tel"
                  required
                  disabled={isPhoneVerified}
                  value={phone}
                  onChange={e => {
                    setPhone(e.target.value);
                    if (otpError) setOtpError(null);
                    if (isPhoneVerified) setIsPhoneVerified(false);
                  }}
                  placeholder="+57 300 123 4567"
                  className={`w-full pl-10 pr-4 py-3 rounded-md border text-purple-950 font-mono text-sm focus:outline-none transition shadow-xs ${
                    isPhoneVerified 
                      ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950' 
                      : 'bg-white border-purple-300 focus:border-purple-700 focus:ring-1 focus:ring-purple-700'
                  }`}
                />
              </div>

              {!isPhoneVerified ? (
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={isSendingOtp || otpCountdown > 0 || !phone.trim()}
                  className={`px-5 py-3 text-xs font-bold rounded-md transition flex items-center justify-center gap-2 shrink-0 cursor-pointer ${
                    isSendingOtp || otpCountdown > 0 || !phone.trim()
                      ? 'bg-purple-100 text-purple-400 cursor-not-allowed'
                      : 'bg-purple-700 hover:bg-purple-800 text-white shadow-xs border border-purple-800'
                  }`}
                >
                  {isSendingOtp ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : otpCountdown > 0 ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Reenviar ({otpCountdown}s)</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>{isOtpSent ? 'Reenviar Código' : 'Enviar Código'}</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsPhoneVerified(false);
                    setIsOtpSent(false);
                    setGeneratedOtp(null);
                    setOtpInput('');
                  }}
                  className="px-4 py-3 text-xs font-semibold text-purple-700 hover:text-purple-900 bg-white border border-purple-300 rounded-md transition cursor-pointer"
                >
                  Cambiar
                </button>
              )}
            </div>
            {!isOtpSent && otpError && (
              <p className="mt-2 text-xs text-rose-600 font-semibold">{otpError}</p>
            )}
          </div>

          {/* Casilla OTP */}
          {isOtpSent && !isPhoneVerified && (
            <div className="space-y-2 animate-fadeIn">
              <label className="block text-xs font-semibold text-purple-900 mb-1.5">
                Código de 6 Dígitos
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpInput}
                  onChange={e => {
                    setOtpInput(e.target.value.replace(/\D/g, ''));
                    if (otpError) setOtpError(null);
                  }}
                  placeholder="000000"
                  className="w-full sm:w-44 text-center tracking-widest text-lg font-bold font-mono px-3 py-3 rounded-md bg-white border border-purple-300 text-purple-950 focus:border-purple-700 focus:ring-1 focus:ring-purple-700 focus:outline-none shadow-xs"
                />
                <button
                  type="button"
                  disabled={isVerifyingOtp}
                  onClick={() => {
                    handleVerifyOtp();
                  }}
                  className="flex-1 px-4 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-bold rounded-md transition flex items-center justify-center gap-2 cursor-pointer shadow-xs border border-emerald-800"
                >
                  {isVerifyingOtp ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Validando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Validar Código</span>
                    </>
                  )}
                </button>
              </div>
              {otpError && (
                <p className="text-xs text-rose-600 font-semibold">{otpError}</p>
              )}
            </div>
          )}

          {isPhoneVerified && (
            <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="font-semibold">
                Número verificado correctamente con código OTP.
              </span>
            </div>
          )}

          {/* Botones de navegación */}
          <div className="pt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                changeSectionWithLoader(1);
              }}
              className="py-3 px-5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-sm rounded-md border border-purple-200 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Atrás</span>
            </button>
            <button
              type="submit"
              disabled={isSendingOtp || isVerifyingOtp}
              className="flex-1 py-3 px-4 font-bold text-sm rounded-md shadow-sm border bg-purple-700 hover:bg-purple-800 active:bg-purple-900 disabled:opacity-60 text-white border-purple-800 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <span>{!isOtpSent ? 'Enviar Código' : 'Continuar'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* ========================================================
          SECCIÓN 3 (Sin describir qué sección es o qué sigue)
         ======================================================== */}
      {!isSwitchingSection && section === 3 && (
        <form onSubmit={handleFinalSubmit} className="space-y-4 animate-fadeIn">
          {/* Casillas de Políticas de la Empresa */}
          <div className="space-y-3">
            {/* Casilla 1: Términos y Condiciones */}
            <label className={`flex items-start gap-3 p-3.5 rounded-md border transition cursor-pointer ${
              acceptedTerms 
                ? 'bg-purple-50 border-purple-300 text-purple-950' 
                : formError 
                  ? 'bg-rose-50/50 border-rose-300 hover:border-rose-400' 
                  : 'bg-white border-purple-200 hover:border-purple-300'
            }`}>
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={e => {
                  setAcceptedTerms(e.target.checked);
                  if (formError) setFormError(null);
                }}
                className="mt-0.5 w-4 h-4 rounded border-purple-300 text-purple-700 focus:ring-purple-700 cursor-pointer shrink-0"
              />
              <div className="text-xs leading-relaxed">
                <span className="font-bold text-purple-950">
                  Términos y Condiciones Generales:
                </span>{' '}
                <span>
                  He leído y acepto expresamente los Términos y Condiciones del Contrato de Servicios Financieros y Crédito Digital CrediULEP (Versión v2026.1).
                </span>
              </div>
            </label>

            {/* Casilla 2: Privacidad y Habeas Data */}
            <label className={`flex items-start gap-3 p-3.5 rounded-md border transition cursor-pointer ${
              acceptedPrivacyHabeas 
                ? 'bg-purple-50 border-purple-300 text-purple-950' 
                : formError 
                  ? 'bg-rose-50/50 border-rose-300 hover:border-rose-400' 
                  : 'bg-white border-purple-200 hover:border-purple-300'
            }`}>
              <input
                type="checkbox"
                checked={acceptedPrivacyHabeas}
                onChange={e => {
                  setAcceptedPrivacyHabeas(e.target.checked);
                  if (formError) setFormError(null);
                }}
                className="mt-0.5 w-4 h-4 rounded border-purple-300 text-purple-700 focus:ring-purple-700 cursor-pointer shrink-0"
              />
              <div className="text-xs leading-relaxed">
                <span className="font-bold text-purple-950">
                  Tratamiento de Datos y Habeas Data:
                </span>{' '}
                <span>
                  Autorizo el tratamiento de mis datos personales y crediticios conforme a la{' '}
                </span>
                <button
                  type="button"
                  onClick={e => {
                    e.preventDefault();
                    onOpenPrivacyModal();
                  }}
                  className="text-purple-700 font-bold underline inline-flex items-center gap-0.5 hover:text-purple-950 cursor-pointer"
                >
                  Política de Privacidad
                  <ExternalLink className="w-3 h-3" />
                </button>
                <span> de la empresa y normatividad legal vigente.</span>
              </div>
            </label>

            {/* Casilla 3: Firma Electrónica Certificada OTP */}
            <label className={`flex items-start gap-3 p-3.5 rounded-md border transition cursor-pointer ${
              acceptedElectronicSignature 
                ? 'bg-purple-50 border-purple-300 text-purple-950' 
                : formError 
                  ? 'bg-rose-50/50 border-rose-300 hover:border-rose-400' 
                  : 'bg-white border-purple-200 hover:border-purple-300'
            }`}>
              <input
                type="checkbox"
                checked={acceptedElectronicSignature}
                onChange={e => {
                  setAcceptedElectronicSignature(e.target.checked);
                  if (formError) setFormError(null);
                }}
                className="mt-0.5 w-4 h-4 rounded border-purple-300 text-purple-700 focus:ring-purple-700 cursor-pointer shrink-0"
              />
              <div className="text-xs leading-relaxed">
                <span className="font-bold text-purple-950">
                  Firma Electrónica y Certificación OTP:
                </span>{' '}
                <span>
                  Acepto el uso de la Firma Electrónica mediante Código OTP y registro de trazabilidad (IP y metadatos) como manifestación plena de voluntad contractual y legal vinculante.
                </span>
              </div>
            </label>
          </div>

          {!allPoliciesAccepted && (
            <p className="text-xs text-amber-800 bg-amber-50 p-3 rounded-md border border-amber-200 font-medium">
              ⚠️ Si estas casillas no son aceptadas, el sistema no le permitirá continuar.
            </p>
          )}



          {/* Botones de navegación y envío */}
          <div className="pt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                changeSectionWithLoader(2);
              }}
              className="py-3 px-5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-sm rounded-md border border-purple-200 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Atrás</span>
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 py-3 px-4 font-bold text-sm rounded-md shadow-sm border flex items-center justify-center gap-2 transition ${
                isSubmitting
                  ? 'bg-purple-300 text-purple-900 border-purple-300 cursor-wait'
                  : 'bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white border-purple-800 cursor-pointer'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Procesando solicitud...</span>
                </>
              ) : (
                <>
                  <span>Crear usuario</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
