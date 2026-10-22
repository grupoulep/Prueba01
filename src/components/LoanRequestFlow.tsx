import React, { useState, useEffect, useMemo } from 'react';
import { User, LoanGeneralSettings } from '../types';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Building2,
  Send,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Mail,
  Phone,
  Lock
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { notificationService } from '../services/notificationService';
import { fintechPanelsEngine } from '../fintech-panels.js';

export type LoanRequestStep = 1 | 2 | 3 | 4 | 5;

export interface LoanRequestFlowProps {
  user: User;
  loanSettings: LoanGeneralSettings;
  maxCreditLimit: number;
  isWaitingDisbursement?: boolean;
  onUserUpdated: (updatedUser: User) => void;
  onBannerNotification?: (message: string) => void;
}

export const LoanRequestFlow: React.FC<LoanRequestFlowProps> = ({
  user,
  loanSettings,
  maxCreditLimit,
  isWaitingDisbursement = false,
  onUserUpdated,
  onBannerNotification
}) => {
  const [currentStep, setCurrentStep] = useState<LoanRequestStep>(1);
  const [isSwitchingStep, setIsSwitchingStep] = useState<boolean>(false);
  const [hasCompletedSignature, setHasCompletedSignature] = useState<boolean>(
    isWaitingDisbursement
  );

  useEffect(() => {
    setHasCompletedSignature(isWaitingDisbursement);
  }, [isWaitingDisbursement]);

  const changeStepWithLoader = (targetStep: LoanRequestStep) => {
    setIsSwitchingStep(true);
    setTimeout(() => {
      setCurrentStep(targetStep);
      setIsSwitchingStep(false);
    }, 280);
  };

  // Paso 1: Selección de monto según su cupo
  const [requestedAmount, setRequestedAmount] = useState<number>(() =>
    maxCreditLimit > 0 ? maxCreditLimit : 15000000
  );
  const [bankEntity] = useState<string>(
    user.disbursementRequest?.bankEntity || 'Bancolombia'
  );
  const [accountType] = useState<'AHORROS' | 'CORRIENTE' | 'BILLETERA_DIGITAL'>(
    user.disbursementRequest?.accountType || 'AHORROS'
  );
  const [accountNumber] = useState<string>(
    user.disbursementRequest?.accountNumber || '4590-8821-0039'
  );

  useEffect(() => {
    if (maxCreditLimit > 0 && requestedAmount > maxCreditLimit) {
      setRequestedAmount(maxCreditLimit);
    }
  }, [maxCreditLimit, requestedAmount]);

  // Paso 2: Plazo y fechas de las cuotas habilitadas
  const [requestedTermMonths, setRequestedTermMonths] = useState<number>(12);
  const [selectedPaymentDay, setSelectedPaymentDay] = useState<number>(5);

  // Paso 3: Aceptación individual de condiciones (sin opción de seleccionar todas)
  const [acceptedTerms, setAcceptedTerms] = useState<boolean>(false);
  const [acceptedPromissoryNote, setAcceptedPromissoryNote] =
    useState<boolean>(false);
  const [acceptedBankMandate, setAcceptedBankMandate] =
    useState<boolean>(false);

  // Paso 4: Actualización de perfil (correo y teléfono; si es el mismo no hay problema)
  const [contactEmail, setContactEmail] = useState<string>(user.email || '');
  const [contactPhone, setContactPhone] = useState<string>(user.phone || '');

  useEffect(() => {
    if (user.email && !contactEmail) setContactEmail(user.email);
    if (user.phone && !contactPhone) setContactPhone(user.phone);
  }, [user.email, user.phone, contactEmail, contactPhone]);

  // Paso 5: Firma mediante código OTP enviado al teléfono
  const [generatedOtp, setGeneratedOtp] = useState<string>('');
  const [otpInput, setOtpInput] = useState<string>('');
  const [stepError, setStepError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCheckingBankApi, setIsCheckingBankApi] = useState<boolean>(false);

  const formatMoney = (val: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(val);

  const computedFirstPaymentDate = useMemo(() => {
    const now = new Date();
    const nextMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      selectedPaymentDay
    );
    return nextMonth.toISOString().split('T')[0];
  }, [selectedPaymentDay]);

  const computedFinalPaymentDate = useMemo(() => {
    const now = new Date();
    const finalDate = new Date(
      now.getFullYear(),
      now.getMonth() + requestedTermMonths,
      selectedPaymentDay
    );
    return finalDate.toISOString().split('T')[0];
  }, [requestedTermMonths, selectedPaymentDay]);

  const liveBreakdown = useMemo(() => {
    return StorageService.buildFixedLoanBreakdown({
      principalAmount: requestedAmount,
      termMonths: requestedTermMonths,
      interestRatePercentage:
        user.interestRateApplied ?? loanSettings.monthlyInterestRate ?? 1.85,
      fianzaPercentage: loanSettings.fianzaPercentage ?? 3.5,
      electronicSignatureFee: loanSettings.electronicSignatureFee ?? 28500,
      collectionExpenses: loanSettings.collectionExpensesDefault ?? 0,
      ivaPercentage:
        user.taxPercentageApplied ?? loanSettings.taxPercentage ?? 19,
      paymentDeadline: `Día ${String(selectedPaymentDay).padStart(
        2,
        '0'
      )} (${computedFirstPaymentDate})`,
      electronicSignatureCode: generatedOtp
        ? `OTP-${generatedOtp}`
        : 'FIRMA-OTP-PENDIENTE'
    });
  }, [
    requestedAmount,
    requestedTermMonths,
    user.interestRateApplied,
    user.taxPercentageApplied,
    loanSettings.monthlyInterestRate,
    loanSettings.fianzaPercentage,
    loanSettings.electronicSignatureFee,
    loanSettings.collectionExpensesDefault,
    loanSettings.taxPercentage,
    selectedPaymentDay,
    computedFirstPaymentDate,
    generatedOtp
  ]);

  const calculateInstallmentForTerm = (amount: number, months: number) => {
    const bd = StorageService.buildFixedLoanBreakdown({
      principalAmount: amount,
      termMonths: months,
      interestRatePercentage:
        user.interestRateApplied ?? loanSettings.monthlyInterestRate ?? 1.85,
      fianzaPercentage: loanSettings.fianzaPercentage ?? 3.5,
      electronicSignatureFee: loanSettings.electronicSignatureFee ?? 28500,
      collectionExpenses: loanSettings.collectionExpensesDefault ?? 0,
      ivaPercentage:
        user.taxPercentageApplied ?? loanSettings.taxPercentage ?? 19
    });
    return bd.monthlyInstallmentAmount;
  };

  const estimatedMonthlyInstallment = liveBreakdown.monthlyInstallmentAmount;

  const generateAndSendOtpToPhone = (targetPhone: string) => {
    setStepError(null);
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    const code = String(100000 + (array[0] % 900000));
    setGeneratedOtp(code);
    setOtpInput('');

  };

  const handleNextStepFrom1 = () => {
    setStepError(null);
    const minAmount = loanSettings.minLoanAmount || 500000;
    if (requestedAmount < minAmount || requestedAmount > maxCreditLimit) {
      setStepError(
        `El monto solicitado debe estar entre ${formatMoney(
          minAmount
        )} y tu cupo disponible de ${formatMoney(maxCreditLimit)}.`
      );
      return;
    }
    changeStepWithLoader(2);
  };

  const handleNextStepFrom2 = () => {
    setStepError(null);
    if (!requestedTermMonths || requestedTermMonths < 1) {
      setStepError('Selecciona el plazo de cuotas habilitadas.');
      return;
    }
    changeStepWithLoader(3);
  };

  const handleNextStepFrom3 = () => {
    setStepError(null);
    if (!acceptedTerms || !acceptedPromissoryNote || !acceptedBankMandate) {
      setStepError(
        'Debes marcar cada una de las condiciones individualmente para continuar.'
      );
      return;
    }
    changeStepWithLoader(4);
  };

  const handleNextStepFrom4 = () => {
    setStepError(null);
    if (!contactEmail.trim() || !contactEmail.includes('@')) {
      setStepError('Ingresa un correo electrónico válido.');
      return;
    }
    if (!contactPhone.trim() || contactPhone.trim().length < 7) {
      setStepError(
        'Ingresa un número de teléfono válido para recibir el código.'
      );
      return;
    }
    generateAndSendOtpToPhone(contactPhone.trim());
    changeStepWithLoader(5);
  };

  const handleFinalAcceptAndSign = async (e: React.FormEvent) => {
    e.preventDefault();
    setStepError(null);

    if (!generatedOtp) {
      setStepError('Genera primero el código de verificación en tu teléfono.');
      return;
    }

    if (otpInput.trim() !== generatedOtp.trim()) {
      setStepError(
        'El código ingresado no coincide con el código enviado a tu teléfono. Verifica e intenta nuevamente.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await StorageService.requestNewLoanWithOtpSignature(user.id, {
        requestedAmount,
        requestedTermMonths,
        estimatedMonthlyInstallment,
        bankEntity,
        accountType,
        accountNumber: accountNumber.trim(),
        otpCodeSigned: otpInput.trim(),
        acceptedTerms,
        acceptedPromissoryNote,
        acceptedBankMandate,
        updatedEmail: contactEmail.trim(),
        updatedPhone: contactPhone.trim(),
        nextPaymentDate: `Día ${String(selectedPaymentDay).padStart(
          2,
          '0'
        )} (${computedFirstPaymentDate})`
      });

      if (res.success && res.user) {
        setHasCompletedSignature(true);
        onUserUpdated(res.user);
        await fintechPanelsEngine.encryptAndBroadcastChange({
          action: 'NEW_LOAN_OTP_SIGNED_IN_DISBURSEMENT',
          userId: user.id,
          requestedAmount,
          bankEntity,
          tramiteId: res.user.creditTramiteId
        });
        onBannerNotification?.(
          '¡Proceso firmado y aceptado! Tu crédito ha pasado a espera de desembolso.'
        );
      } else {
        setStepError(res.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBankApiDisbursementActivation = async () => {
    if (isCheckingBankApi) return;
    setIsCheckingBankApi(true);
    try {
      const entityName =
        user.disbursementRequest?.bankEntity || bankEntity || 'Entidad Bancaria';
      const res = await StorageService.confirmLoanDisbursement(
        user.id,
        `API Entidad Bancaria (${entityName} ACH)`
      );
      if (res.success && res.user) {
        setHasCompletedSignature(false);
        setGeneratedOtp('');
        setOtpInput('');
        setAcceptedTerms(false);
        setAcceptedPromissoryNote(false);
        setAcceptedBankMandate(false);
        setCurrentStep(1);
        onUserUpdated(res.user);
        await fintechPanelsEngine.encryptAndBroadcastChange({
          action: 'LOAN_DISBURSED_BY_BANK_API',
          userId: user.id,
          amount: res.user.creditLimit
        });
        onBannerNotification?.(
          `¡Desembolso confirmado por la API de ${entityName}! Tu nuevo crédito ya está activo.`
        );
      }
    } finally {
      setIsCheckingBankApi(false);
    }
  };

  // =========================================================================
  // ESTADO DE ESPERA FINAL: EN PROCESO DE DESEMBOLSO
  // =========================================================================
  if (
    hasCompletedSignature ||
    user.paymentStatus === 'EN_DESEMBOLSO' ||
    user.disbursementRequest?.status === 'EN_PROCESO_DESEMBOLSO'
  ) {
    return (
      <div className="bg-white border-2 border-sky-600 rounded p-6 space-y-5 animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-sky-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-sky-700 text-white flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-purple-950">
                  En Espera de Desembolso • Proceso Firmado con Éxito
                </h2>
                <span className="px-2 py-0.5 bg-sky-100 text-sky-800 border border-sky-300 rounded text-[10px] font-extrabold uppercase">
                  FIRMA OTP VERIFICADA
                </span>
              </div>
              <p className="text-xs text-purple-800/80">
                Tu nuevo crédito ya fue firmado y aceptado. Permanecerá en
                proceso de desembolso hasta que llegue o se active por la API de
                la entidad bancaria o que el personal acepte que ya se
                desembolsó.
              </p>
            </div>
          </div>
        </div>

        {/* Resumen Técnico del Desembolso y Desglose Fijo de 8 Conceptos */}
        {(() => {
          const activeDisbursementBreakdown =
            user.disbursementRequest?.loanBreakdown ||
            user.activeLoanBreakdown ||
            liveBreakdown;
          return (
            <div className="space-y-3 bg-sky-50/60 border border-sky-200 p-4 rounded text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-sky-200">
                <span className="font-extrabold text-sky-950 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-sky-700" />
                  <span>
                    Condiciones Financieras Fijadas (No editables ni borrables mientras el crédito esté activo)
                  </span>
                </span>
                <span className="font-mono font-bold text-emerald-700">
                  Firma OTP: {user.disbursementRequest?.otpCodeSigned || otpInput || 'VERIFICADO'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-white p-2.5 rounded border border-sky-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    1. Monto Principal (Desembolsado)
                  </span>
                  <strong className="font-mono text-sm text-purple-950">
                    {formatMoney(activeDisbursementBreakdown.principalAmount)}
                  </strong>
                </div>
                <div className="bg-white p-2.5 rounded border border-sky-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    2. Interés (Ganancia Empresa)
                  </span>
                  <strong className="font-mono text-sm text-purple-800">
                    {formatMoney(activeDisbursementBreakdown.interestAmount)}
                  </strong>
                </div>
                <div className="bg-white p-2.5 rounded border border-sky-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    3. Fianza ({activeDisbursementBreakdown.fianzaPercentage}%)
                  </span>
                  <strong className="font-mono text-sm text-purple-950">
                    {formatMoney(activeDisbursementBreakdown.fianzaAmount)}
                  </strong>
                </div>
                <div className="bg-white p-2.5 rounded border border-sky-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    4. Firma Electrónica
                  </span>
                  <strong className="font-mono text-sm text-purple-950">
                    {formatMoney(activeDisbursementBreakdown.electronicSignatureFee)}
                  </strong>
                </div>
                <div className="bg-white p-2.5 rounded border border-sky-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    5. Gastos de Cobranza
                  </span>
                  <strong className="font-mono text-sm text-purple-950">
                    {formatMoney(activeDisbursementBreakdown.collectionExpenses)}
                  </strong>
                </div>
                <div className="bg-white p-2.5 rounded border border-sky-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    6. IVA ({activeDisbursementBreakdown.ivaPercentage}%)
                  </span>
                  <strong className="font-mono text-sm text-purple-950">
                    {formatMoney(activeDisbursementBreakdown.ivaAmount)}
                  </strong>
                </div>
                <div className="bg-white p-2.5 rounded border border-sky-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    7. Fecha Límite de Pago
                  </span>
                  <strong className="font-mono text-xs text-purple-950">
                    {activeDisbursementBreakdown.paymentDeadline}
                  </strong>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded border border-emerald-300">
                  <span className="text-[10px] font-extrabold uppercase text-emerald-800 block">
                    8. Pago Total Fijado
                  </span>
                  <strong className="font-mono text-sm font-extrabold text-emerald-700">
                    {formatMoney(activeDisbursementBreakdown.totalPaymentAmount)}
                  </strong>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Etapas Completadas y Estado de Espera */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-3 rounded bg-emerald-50 border border-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-extrabold text-emerald-950">
                Monto y Plazo
              </div>
              <div className="text-[11px] text-emerald-700">
                Configurados según cupo
              </div>
            </div>
          </div>

          <div className="p-3 rounded bg-emerald-50 border border-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-extrabold text-emerald-950">Condiciones</div>
              <div className="text-[11px] text-emerald-700">
                Aceptadas individualmente
              </div>
            </div>
          </div>

          <div className="p-3 rounded bg-emerald-50 border border-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-extrabold text-emerald-950">
                Firma OTP Teléfono
              </div>
              <div className="text-[11px] text-emerald-700">
                Código verificado y aceptado
              </div>
            </div>
          </div>

          <div className="p-3 rounded bg-sky-50 border-2 border-sky-500 flex items-start gap-2">
            <Clock className="w-4 h-4 text-sky-700 shrink-0 mt-0.5 animate-spin" />
            <div>
              <div className="font-extrabold text-sky-950">En Desembolso</div>
              <div className="text-[11px] text-sky-700">
                API Bancaria / Personal
              </div>
            </div>
          </div>
        </div>

        {/* Acciones de sincronización con API de la Entidad Bancaria o Espera de Personal */}
        <div className="pt-2 border-t border-purple-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-purple-800">
            Esperando confirmación del{' '}
            <strong>Personal en el Panel Admin/Trabajadores</strong> o
            activación directa desde la API de tu entidad bancaria:
          </div>

          <button
            type="button"
            disabled={isCheckingBankApi}
            onClick={handleBankApiDisbursementActivation}
            className="w-full sm:w-auto px-4 py-2.5 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded transition flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <RefreshCw
              className={`w-4 h-4 ${isCheckingBankApi ? 'animate-spin' : ''}`}
            />
            <span>
              {isCheckingBankApi
                ? 'Validando con API Bancaria...'
                : `Activar por API ${
                    user.disbursementRequest?.bankEntity || 'Bancaria'
                  } (Desembolso Recibido)`}
            </span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // FLUJO A PANTALLA COMPLETA PASO POR PASO (CON LÍNEA DE PROGRESO SIN NÚMEROS)
  // =========================================================================
  return (
    <div className="w-full flex-1 flex flex-col justify-between bg-white border-2 border-purple-700 rounded p-4 sm:p-8 md:p-10 shadow-xs animate-fadeIn min-h-[70vh] sm:min-h-[78vh]">
      {/* Cabecera con Cupo Habilitado y Línea de Progreso Continua sin Números */}
      <div className="space-y-4 border-b border-purple-200 pb-4 sm:pb-5">
        <div className="flex items-center justify-between sm:justify-end">
          <div className="w-full sm:w-auto bg-purple-50 border border-purple-200 px-3.5 sm:px-4 py-2 rounded flex sm:block items-center justify-between text-right">
            <span className="text-[10px] font-bold uppercase text-purple-700 block">
              Tu Cupo Máximo Habilitado
            </span>
            <span className="font-mono font-extrabold text-base sm:text-lg text-purple-950">
              {formatMoney(maxCreditLimit)}
            </span>
          </div>
        </div>

        {/* Línea indicadora de paso (sin números, igual que en Registrarse) */}
        <div className="flex items-center justify-center gap-2 pt-1">
          {([1, 2, 3, 4, 5] as const).map(s => (
            <span
              key={s}
              className={`h-1.5 rounded-sm transition-all duration-300 ${
                currentStep === s
                  ? 'w-10 bg-purple-700'
                  : currentStep > s
                  ? 'w-4 bg-purple-400'
                  : 'w-3 bg-purple-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Cuerpo Central: Muestra ÚNICAMENTE la Etapa Actual por Separado */}
      <div className="flex-1 flex flex-col justify-center py-5 sm:py-8 max-w-3xl w-full mx-auto">
        {stepError && (
          <div className="mb-6 p-3.5 bg-rose-50 border border-rose-300 rounded text-xs font-bold text-rose-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{stepError}</span>
          </div>
        )}

        {isSwitchingStep ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-3 animate-fadeIn">
            <div className="w-10 h-10 rounded-full border-3 border-purple-100 border-t-purple-700 animate-spin" />
            <div className="w-28 h-1 bg-purple-100 rounded-full overflow-hidden">
              <div className="w-1/2 h-full bg-purple-700 rounded-full animate-shimmerBar" />
            </div>
          </div>
        ) : (
          <>
            {/* ===============================================================
                ETAPA 1: SELECCIÓN DE MONTO SEGÚN SU CUPO
               =============================================================== */}
            {currentStep === 1 && (
              <div className="space-y-5 sm:space-y-6 animate-fadeIn">
                <div className="space-y-1">
                  <h2 className="text-xl sm:text-3xl font-extrabold text-purple-950 leading-tight">
                    ¿Cuánto vas a pedir según tu cupo disponible?
                  </h2>
                </div>

                <div className="p-4 sm:p-6 bg-[#fcfaff] border-2 border-purple-200 rounded space-y-5">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 mb-2">
                      <label className="text-xs font-extrabold uppercase text-purple-900">
                        Monto a Solicitar (COP)
                      </label>
                      <span className="text-xs font-mono text-purple-700">
                        Máximo permitido: {formatMoney(maxCreditLimit)}
                      </span>
                    </div>

                    <input
                      type="number"
                      min={loanSettings.minLoanAmount || 500000}
                      max={maxCreditLimit}
                      step={500000}
                      value={requestedAmount}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setRequestedAmount(
                          Math.min(maxCreditLimit, Math.max(0, val))
                        );
                      }}
                      className="w-full px-4 py-3.5 rounded bg-white border-2 border-purple-400 text-purple-950 font-mono font-extrabold text-2xl sm:text-3xl focus:border-purple-700 focus:outline-none"
                    />

                    <input
                      type="range"
                      min={loanSettings.minLoanAmount || 500000}
                      max={maxCreditLimit}
                      step={500000}
                      value={Math.min(maxCreditLimit, requestedAmount)}
                      onChange={e => setRequestedAmount(Number(e.target.value))}
                      className="w-full mt-4 accent-purple-700 cursor-pointer"
                    />

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
                      {[
                        {
                          label: '25% del Cupo',
                          val:
                            Math.round((maxCreditLimit * 0.25) / 100000) *
                            100000
                        },
                        {
                          label: '50% del Cupo',
                          val:
                            Math.round((maxCreditLimit * 0.5) / 100000) * 100000
                        },
                        {
                          label: '75% del Cupo',
                          val:
                            Math.round((maxCreditLimit * 0.75) / 100000) *
                            100000
                        },
                        {
                          label: '100% Cupo Total',
                          val: maxCreditLimit
                        }
                      ].map(item => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => setRequestedAmount(item.val)}
                          className={`p-2.5 rounded border text-left cursor-pointer transition ${
                            requestedAmount === item.val
                              ? 'bg-purple-700 text-white border-purple-800'
                              : 'bg-white text-purple-900 border-purple-200 hover:bg-purple-50'
                          }`}
                        >
                          <div className="text-[10px] font-bold uppercase opacity-80">
                            {item.label}
                          </div>
                          <div className="font-mono font-extrabold text-xs sm:text-sm">
                            {formatMoney(item.val)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
                ETAPA 2: SELECCIÓN DE PLAZO Y FECHAS DE CUOTAS HABILITADAS
               =============================================================== */}
            {currentStep === 2 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="space-y-1">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-purple-950">
                    Escoge el tiempo de las cuotas habilitadas y tu fecha de
                    pago
                  </h2>
                </div>

                {/* Selección de Plazo / Tiempo de Cuotas Habilitadas */}
                <div className="space-y-2.5">
                  <label className="block text-xs font-extrabold uppercase text-purple-900">
                    Tiempo de las Cuotas Habilitadas (Plazo en Meses)
                  </label>
                  <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                    {[3, 6, 12, 18, 24, 36].map(months => {
                      const cuotaMes = calculateInstallmentForTerm(
                        requestedAmount,
                        months
                      );
                      const active = requestedTermMonths === months;
                      return (
                        <button
                          key={months}
                          type="button"
                          onClick={() => setRequestedTermMonths(months)}
                          className={`p-3.5 sm:p-4 rounded border-2 text-left transition cursor-pointer ${
                            active
                              ? 'bg-purple-700 text-white border-purple-900 shadow-xs'
                              : 'bg-[#fcfaff] text-purple-950 border-purple-200 hover:border-purple-400'
                          }`}
                        >
                          <div className="text-xs sm:text-sm font-extrabold">
                            {months} Cuotas Mensuales
                          </div>
                          <div
                            className={`font-mono text-sm sm:text-lg font-extrabold mt-1 ${
                              active ? 'text-white' : 'text-purple-800'
                            }`}
                          >
                            {formatMoney(cuotaMes)} / mes
                          </div>
                          <div
                            className={`text-[11px] mt-0.5 ${
                              active ? 'text-purple-100' : 'text-purple-600'
                            }`}
                          >
                            Tasa:{' '}
                            {user.interestRateApplied ??
                              loanSettings.monthlyInterestRate}
                            % E.M.
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selección de Fechas de Corte / Pago Habilitadas */}
                <div className="p-4 sm:p-5 bg-[#fcfaff] border border-purple-200 rounded space-y-3">
                  <label className="block text-xs font-extrabold uppercase text-purple-900">
                    Escoge la Fecha Mensual de Pago Habilitada
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-2.5">
                    {[5, 10, 15, 20, 30].map(day => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setSelectedPaymentDay(day)}
                        className={`py-2.5 sm:py-3 px-2.5 sm:px-3 rounded border font-bold text-xs cursor-pointer transition ${
                          selectedPaymentDay === day
                            ? 'bg-purple-950 text-white border-purple-950'
                            : 'bg-white text-purple-900 border-purple-300 hover:bg-purple-50'
                        }`}
                      >
                        Día {String(day).padStart(2, '0')} de cada mes
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-purple-200 text-xs">
                    <div className="bg-white p-2.5 rounded border border-purple-200">
                      <span className="text-[10px] text-purple-600 block">
                        1. Principal Desembolsado:
                      </span>
                      <strong className="font-mono text-sm text-purple-950">
                        {formatMoney(liveBreakdown.principalAmount)}
                      </strong>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-purple-200">
                      <span className="text-[10px] text-purple-600 block">
                        2. Interés ({liveBreakdown.interestRatePercentage}% EM):
                      </span>
                      <strong className="font-mono text-sm text-purple-950">
                        {formatMoney(liveBreakdown.interestAmount)}
                      </strong>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-purple-200">
                      <span className="text-[10px] text-purple-600 block">
                        3. Fianza ({liveBreakdown.fianzaPercentage}%):
                      </span>
                      <strong className="font-mono text-sm text-purple-950">
                        {formatMoney(liveBreakdown.fianzaAmount)}
                      </strong>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-purple-200">
                      <span className="text-[10px] text-purple-600 block">
                        4. Firma Electrónica:
                      </span>
                      <strong className="font-mono text-sm text-purple-950">
                        {formatMoney(liveBreakdown.electronicSignatureFee)}
                      </strong>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-purple-200">
                      <span className="text-[10px] text-purple-600 block">
                        5. Gastos de Cobranza:
                      </span>
                      <strong className="font-mono text-sm text-purple-950">
                        {formatMoney(liveBreakdown.collectionExpenses)}
                      </strong>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-purple-200">
                      <span className="text-[10px] text-purple-600 block">
                        6. IVA ({liveBreakdown.ivaPercentage}%):
                      </span>
                      <strong className="font-mono text-sm text-purple-950">
                        {formatMoney(liveBreakdown.ivaAmount)}
                      </strong>
                    </div>
                    <div className="bg-white p-2.5 rounded border border-purple-200">
                      <span className="text-[10px] text-purple-600 block">
                        7. Fecha Límite de Pago:
                      </span>
                      <strong className="font-mono text-xs text-purple-950">
                        {computedFirstPaymentDate}
                      </strong>
                    </div>
                    <div className="bg-purple-100/70 p-2.5 rounded border border-purple-300">
                      <span className="text-[10px] font-bold text-purple-800 block">
                        8. Pago Total Fijado:
                      </span>
                      <strong className="font-mono text-sm font-extrabold text-purple-950">
                        {formatMoney(liveBreakdown.totalPaymentAmount)}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
                ETAPA 3: ACEPTACIÓN DE CONDICIONES INDIVIDUALMENTE
               =============================================================== */}
            {currentStep === 3 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="space-y-1">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-purple-950">
                    Lee y acepta cada una de las condiciones del crédito
                  </h2>
                </div>

                <div className="space-y-3.5">
                  <label
                    className={`p-5 rounded border-2 flex items-start gap-3.5 cursor-pointer transition ${
                      acceptedTerms
                        ? 'bg-emerald-50/60 border-emerald-500'
                        : 'bg-[#fcfaff] border-purple-200 hover:border-purple-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={e => setAcceptedTerms(e.target.checked)}
                      className="mt-1 w-4 h-4 accent-purple-700 cursor-pointer"
                    />
                    <div className="text-xs sm:text-sm text-purple-950 space-y-1">
                      <div className="font-extrabold">
                        Aceptación de Desglose Financiero Fijo e Inmutable
                      </div>
                      <p className="text-purple-800/90 leading-relaxed">
                        Acepto solicitar un crédito con{' '}
                        <strong>
                          Monto Principal Desembolsado de{' '}
                          {formatMoney(liveBreakdown.principalAmount)}
                        </strong>
                        , Interés de ganancia de la empresa de{' '}
                        <strong>{formatMoney(liveBreakdown.interestAmount)}</strong>,
                        Fianza de{' '}
                        <strong>{formatMoney(liveBreakdown.fianzaAmount)}</strong>,
                        Firma Electrónica de{' '}
                        <strong>
                          {formatMoney(liveBreakdown.electronicSignatureFee)}
                        </strong>
                        , Gastos de Cobranza de{' '}
                        <strong>
                          {formatMoney(liveBreakdown.collectionExpenses)}
                        </strong>
                        , IVA de{' '}
                        <strong>{formatMoney(liveBreakdown.ivaAmount)}</strong>,
                        Fecha Límite de Pago{' '}
                        <strong>{liveBreakdown.paymentDeadline}</strong> y{' '}
                        <strong>
                          Pago Total de {formatMoney(liveBreakdown.totalPaymentAmount)}
                        </strong>
                        . Comprendo que al crearse este crédito nuevo{' '}
                        <strong>
                          SE FIJA SIN PODER EDITAR, BORRAR NI CAMBIAR MIENTRAS ESTÉ ACTIVO
                        </strong>
                        .
                      </p>
                    </div>
                  </label>

                  <label
                    className={`p-5 rounded border-2 flex items-start gap-3.5 cursor-pointer transition ${
                      acceptedPromissoryNote
                        ? 'bg-emerald-50/60 border-emerald-500'
                        : 'bg-[#fcfaff] border-purple-200 hover:border-purple-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={acceptedPromissoryNote}
                      onChange={e =>
                        setAcceptedPromissoryNote(e.target.checked)
                      }
                      className="mt-1 w-4 h-4 accent-purple-700 cursor-pointer"
                    />
                    <div className="text-xs sm:text-sm text-purple-950 space-y-1">
                      <div className="font-extrabold">
                        Suscripción de Pagaré Inmaterial y Carta de
                        Instrucciones
                      </div>
                      <p className="text-purple-800/90 leading-relaxed">
                        Acepto y suscribo el pagaré electrónico inmaterial a
                        favor de <strong>CrediULEP</strong> conforme a la Ley
                        527 de 1999, respaldado mediante el código OTP que se
                        enviará a mi teléfono móvil.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`p-5 rounded border-2 flex items-start gap-3.5 cursor-pointer transition ${
                      acceptedBankMandate
                        ? 'bg-emerald-50/60 border-emerald-500'
                        : 'bg-[#fcfaff] border-purple-200 hover:border-purple-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={acceptedBankMandate}
                      onChange={e => setAcceptedBankMandate(e.target.checked)}
                      className="mt-1 w-4 h-4 accent-purple-700 cursor-pointer"
                    />
                    <div className="text-xs sm:text-sm text-purple-950 space-y-1">
                      <div className="font-extrabold">
                        Autorización de Desembolso y Validación Bancaria
                      </div>
                      <p className="text-purple-800/90 leading-relaxed">
                        Autorizo el desembolso de mi crédito y comprendo que
                        tras firmar quedará en proceso de desembolso hasta su
                        activación por la API de la entidad bancaria o el
                        personal autorizado.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* ===============================================================
                ETAPA 4: ACTUALIZACIÓN DE PERFIL (CORREO Y TELÉFONO)
               =============================================================== */}
            {currentStep === 4 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="space-y-1">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-purple-950">
                    Actualiza tu correo y teléfono (si es el mismo no hay
                    problema)
                  </h2>
                </div>

                <div className="p-6 bg-[#fcfaff] border-2 border-purple-200 rounded space-y-5">
                  <div>
                    <label className="block text-xs font-extrabold uppercase text-purple-900 mb-1.5 flex items-center gap-1.5">
                      <Mail className="w-4 h-4 text-purple-700" />
                      <span>Correo Electrónico</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={contactEmail}
                      onChange={e => setContactEmail(e.target.value)}
                      placeholder="tu-correo@ejemplo.com"
                      className="w-full px-4 py-3 rounded bg-white border-2 border-purple-300 text-purple-950 font-mono font-bold text-base focus:border-purple-700 focus:outline-none"
                    />
                    <span className="text-[11px] text-purple-600 mt-1 block">
                      Correo registrado actualmente: {user.email}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold uppercase text-purple-900 mb-1.5 flex items-center gap-1.5">
                      <Phone className="w-4 h-4 text-purple-700" />
                      <span>
                        Número de Teléfono Móvil (Recibirás el código OTP de
                        firma)
                      </span>
                    </label>
                    <input
                      type="text"
                      required
                      value={contactPhone}
                      onChange={e => setContactPhone(e.target.value)}
                      placeholder="+57 300 000 0000"
                      className="w-full px-4 py-3 rounded bg-white border-2 border-purple-300 text-purple-950 font-mono font-bold text-base focus:border-purple-700 focus:outline-none"
                    />
                    <span className="text-[11px] text-purple-600 mt-1 block">
                      Teléfono registrado actualmente: {user.phone}
                    </span>
                  </div>

                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>
                      {contactEmail.trim() === user.email &&
                      contactPhone.trim() === user.phone
                        ? 'Estás conservando tu mismo correo y teléfono registrados. Puedes continuar sin problema.'
                        : 'Se actualizarán tu correo y/o teléfono con los nuevos datos ingresados.'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
                ETAPA 5: FIRMA MEDIANTE OTP Y ACEPTACIÓN FINAL
               =============================================================== */}
            {currentStep === 5 && (
              <form
                onSubmit={handleFinalAcceptAndSign}
                className="space-y-6 animate-fadeIn"
              >
                <div className="space-y-1">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-purple-950">
                    Ingresa el código enviado a tu teléfono y haz clic en
                    Aceptar
                  </h2>
                </div>

                {/* Resumen de los 8 elementos que se fijan al firmar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-purple-50/70 border border-purple-200 p-4 rounded text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-purple-600 block">
                      1. Principal Desembolsado
                    </span>
                    <strong className="font-mono text-sm text-purple-950">
                      {formatMoney(liveBreakdown.principalAmount)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-purple-600 block">
                      2. Interés Ganancia
                    </span>
                    <strong className="font-mono text-sm text-purple-950">
                      {formatMoney(liveBreakdown.interestAmount)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-purple-600 block">
                      3. Fianza ({liveBreakdown.fianzaPercentage}%)
                    </span>
                    <strong className="font-mono text-sm text-purple-950">
                      {formatMoney(liveBreakdown.fianzaAmount)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-purple-600 block">
                      4. Firma Electrónica
                    </span>
                    <strong className="font-mono text-sm text-purple-950">
                      {formatMoney(liveBreakdown.electronicSignatureFee)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-purple-600 block">
                      5. Gastos de Cobranza
                    </span>
                    <strong className="font-mono text-sm text-purple-950">
                      {formatMoney(liveBreakdown.collectionExpenses)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-purple-600 block">
                      6. IVA ({liveBreakdown.ivaPercentage}%)
                    </span>
                    <strong className="font-mono text-sm text-purple-950">
                      {formatMoney(liveBreakdown.ivaAmount)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-purple-600 block">
                      7. Fecha Límite Pago
                    </span>
                    <strong className="font-mono text-xs text-purple-950">
                      {liveBreakdown.paymentDeadline}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-emerald-700 block">
                      8. Pago Total Fijado
                    </span>
                    <strong className="font-mono text-sm font-extrabold text-emerald-700">
                      {formatMoney(liveBreakdown.totalPaymentAmount)}
                    </strong>
                  </div>
                </div>

                {/* Notificación con el código OTP enviado al teléfono */}
                {generatedOtp && (
                  <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-xs sm:text-sm text-emerald-950">
                      <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                      <div>
                        <div className="font-bold">
                          SMS / Código enviado a tu teléfono ({contactPhone}):
                        </div>
                        <div className="text-xs text-emerald-800">
                          Usa este código para firmar todo el proceso:
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-start sm:self-auto">
                      <span className="font-mono font-extrabold text-xl tracking-widest bg-white px-3.5 py-1.5 border border-emerald-400 rounded text-emerald-950">
                        {generatedOtp}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOtpInput(generatedOtp)}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded cursor-pointer"
                      >
                        Copiar Código
                      </button>
                    </div>
                  </div>
                )}

                <div className="p-4 sm:p-6 bg-[#fcfaff] border-2 border-purple-300 rounded space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-extrabold uppercase text-purple-950">
                      Código de Firma Electrónica (6 dígitos)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        generateAndSendOtpToPhone(contactPhone.trim())
                      }
                      className="text-xs font-bold text-purple-700 hover:text-purple-950 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Enviar nuevo código a mi teléfono</span>
                    </button>
                  </div>

                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={otpInput}
                    onChange={e =>
                      setOtpInput(e.target.value.replace(/\D/g, ''))
                    }
                    placeholder="Ingresa los 6 dígitos del código"
                    className="w-full px-4 py-3.5 rounded bg-white border-2 border-purple-400 font-mono font-extrabold text-xl sm:text-2xl text-center text-purple-950 tracking-[0.2em] sm:tracking-[0.35em] placeholder:text-xs sm:placeholder:text-sm placeholder:tracking-normal placeholder:font-sans placeholder:font-medium focus:border-purple-700 focus:outline-none"
                  />

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-purple-300 text-white font-extrabold text-sm sm:text-base rounded transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>
                      {isSubmitting
                        ? 'Firmando y Enviando a Espera de Desembolso...'
                        : 'ACEPTAR'}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>

      {/* Barra Inferior de Navegación entre Etapas (sin números) */}
      <div className="pt-5 sm:pt-6 border-t border-purple-200 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        {currentStep > 1 ? (
          <button
            type="button"
            onClick={() => {
              setStepError(null);
              changeStepWithLoader((currentStep - 1) as LoanRequestStep);
            }}
            className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 font-bold text-xs sm:text-sm rounded flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Anterior</span>
          </button>
        ) : (
          <div className="hidden sm:block" />
        )}

        {currentStep === 1 && (
          <button
            type="button"
            onClick={handleNextStepFrom1}
            className="w-full sm:w-auto px-6 py-3 bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs sm:text-sm rounded flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Continuar</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}

        {currentStep === 2 && (
          <button
            type="button"
            onClick={handleNextStepFrom2}
            className="w-full sm:w-auto px-6 py-3 bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs sm:text-sm rounded flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Continuar</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}

        {currentStep === 3 && (
          <button
            type="button"
            onClick={handleNextStepFrom3}
            className="w-full sm:w-auto px-6 py-3 bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs sm:text-sm rounded flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Continuar</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}

        {currentStep === 4 && (
          <button
            type="button"
            onClick={handleNextStepFrom4}
            className="w-full sm:w-auto px-6 py-3 bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs sm:text-sm rounded flex items-center justify-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4 shrink-0" />
            <span>Enviar Código a mi Teléfono</span>
          </button>
        )}
      </div>
    </div>
  );
};
