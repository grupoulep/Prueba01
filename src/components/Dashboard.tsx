import React, { useState, useEffect, useMemo } from 'react';
import { User } from '../types';
import {
  Eye,
  EyeOff,
  CheckCircle2,
  CreditCard,
  Banknote,
  Receipt,
  Wallet,
  Clock,
  Sparkles,
  History,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { verifyUserIntegrity } from '../services/cryptoService';
import { fintechPanelsEngine } from '../fintech-panels.js';
import { LoanRequestFlow } from './LoanRequestFlow';

interface DashboardProps {
  currentUser: User;
  onLogout: () => void;
  onOpenPrivacyModal: () => void;
  onOpenAuditModal?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  currentUser: initialUser
}) => {
  const [user, setUser] = useState<User>(initialUser);
  const [loanSettings, setLoanSettings] = useState(() =>
    StorageService.getLoanSettings()
  );
  const [isPanelEntering, setIsPanelEntering] = useState<boolean>(true);
  const [hideBalance, setHideBalance] = useState<boolean>(false);
  const [integrityValid, setIntegrityValid] = useState<boolean>(true);

  // Estado para pago en línea (In-Situ, sin ventanas modales)
  const [paymentModalType, setPaymentModalType] = useState<
    'CUOTA' | 'CUOTA_PERSONALIZADA' | 'CREDITO_COMPLETO' | null
  >(null);
  const [paymentMethod, setPaymentMethod] = useState<string>(
    'PSE - Débito Bancario'
  );
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] =
    useState<boolean>(false);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<
    string | null
  >(null);

  // Monto original otorgado al cliente
  const [loanGrantedAmount] = useState<number>(() => {
    if (initialUser.creditStatus === 'ASIGNADO') {
      return initialUser.creditLimit > 0
        ? initialUser.creditLimit
        : initialUser.availableBalance || 18500000;
    }
    return initialUser.creditLimit || 18500000;
  });

  // Cupo máximo disponible según el perfil del cliente
  const cupoMaximoCliente = useMemo(() => {
    const previousMax = (user.previousLoans || []).reduce(
      (max, l) => Math.max(max, l.amountGranted || 0),
      0
    );
    return Math.max(
      user.creditLimit || 0,
      loanGrantedAmount || 0,
      previousMax,
      18500000
    );
  }, [user.creditLimit, user.previousLoans, loanGrantedAmount]);

  const [disbursementBanner, setDisbursementBanner] = useState<string | null>(
    null
  );

  // Sincronización continua con StorageService y con cambios desde el Panel Admin / Personal
  const syncLatestUser = async () => {
    const { user: freshUser } = await StorageService.getUserByCedula(
      initialUser.cedula
    );
    if (freshUser) {
      setUser(freshUser);
    }
    setLoanSettings(StorageService.getLoanSettings());
  };

  useEffect(() => {
    setIsPanelEntering(true);
    syncLatestUser();

    const unsubscribe = fintechPanelsEngine.subscribe(() => {
      syncLatestUser();
    });

    const pollInterval = setInterval(() => {
      syncLatestUser();
    }, 2500);

    const timer = setTimeout(() => {
      setIsPanelEntering(false);
    }, 300);

    return () => {
      clearTimeout(timer);
      clearInterval(pollInterval);
      unsubscribe();
    };
  }, [initialUser.cedula]);

  const defaultTermMonths = loanSettings.defaultTermMonths || 12;

  const isLoanAssigned =
    user.creditStatus === 'ASIGNADO' && user.paymentStatus !== 'SIN_ACEPTAR';
  const isDisbursementInProcess =
    isLoanAssigned &&
    (user.paymentStatus === 'EN_DESEMBOLSO' ||
      user.disbursementRequest?.status === 'EN_PROCESO_DESEMBOLSO');

  const montoPrestado = isLoanAssigned
    ? Math.max(user.creditLimit || 0, loanGrantedAmount, user.availableBalance)
    : user.creditLimit || 0;
  const saldoPendiente = isDisbursementInProcess
    ? 0
    : isLoanAssigned
    ? user.availableBalance
    : 0;
  const plazoMeses = user.loanTermMonths || defaultTermMonths || 12;

  // Valor de Cuota mensual del crédito activo
  const cuotaBaseMensual =
    user.customInstallmentAmount && user.customInstallmentAmount > 0
      ? user.customInstallmentAmount
      : montoPrestado > 0
      ? Math.round(montoPrestado / plazoMeses)
      : 0;

  const valorCuota =
    saldoPendiente > 0 ? Math.min(saldoPendiente, cuotaBaseMensual) : 0;

  // Estado para el monto de la Cuota Personalizada
  const [customPaymentAmount, setCustomPaymentAmount] = useState<number>(() =>
    saldoPendiente > 0 ? saldoPendiente : 0
  );

  useEffect(() => {
    if (user.availableBalance > 0) {
      setCustomPaymentAmount(prev =>
        prev > 0 && prev <= user.availableBalance ? prev : user.availableBalance
      );
    } else {
      setCustomPaymentAmount(0);
    }
  }, [user.availableBalance]);

  useEffect(() => {
    const checkIntegrity = async () => {
      const valid = await verifyUserIntegrity(user);
      setIntegrityValid(valid);
    };
    checkIntegrity();
  }, [user]);

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Cálculos del estado actual del crédito
  const debtRatio =
    montoPrestado > 0
      ? Math.min(100, Math.round((saldoPendiente / montoPrestado) * 100))
      : 0;
  const daysOverdue = user.daysOverdue || 0;
  const isOverdue =
    isLoanAssigned &&
    !isDisbursementInProcess &&
    (user.paymentStatus === 'EN_MORA' || daysOverdue > 0) &&
    saldoPendiente > 0;
  const isNearDue =
    isLoanAssigned &&
    !isDisbursementInProcess &&
    !isOverdue &&
    (user.paymentStatus === 'PROXIMO_VENCIMIENTO' || debtRatio >= 90) &&
    saldoPendiente > 0;
  const isPaidOff =
    isLoanAssigned && !isDisbursementInProcess && saldoPendiente === 0;

  // Esquema cromático dinámico del Círculo según Estado
  const getCircleTheme = () => {
    if (isDisbursementInProcess) {
      return {
        strokeColor: '#0284c7',
        trackColor: '#e0f2fe',
        badgeClass: 'bg-sky-700 text-white',
        textAccent: 'text-sky-950',
        statusLabel: 'EN PROCESO DE DESEMBOLSO',
        timeDesc: `Firma OTP validada • Esperando activación bancaria o del personal`
      };
    }
    if (isPaidOff) {
      return {
        strokeColor: '#059669',
        trackColor: '#d1fae5',
        badgeClass: 'bg-emerald-700 text-white',
        textAccent: 'text-emerald-950',
        statusLabel: 'CRÉDITO FINALIZADO • PAZ Y SALVO',
        timeDesc: 'Obligación pagada al 100% • Cupo disponible para nuevo crédito'
      };
    }
    if (isOverdue) {
      return {
        strokeColor: '#dc2626',
        trackColor: '#fee2e2',
        badgeClass: 'bg-rose-600 text-white',
        textAccent: 'text-rose-950',
        statusLabel: `EN MORA (${daysOverdue || 30} DÍAS)`,
        timeDesc: `Tiempo vencido • Deuda del ${debtRatio}% activa`
      };
    }
    if (isNearDue && user.paymentStatus === 'PROXIMO_VENCIMIENTO') {
      return {
        strokeColor: '#d97706',
        trackColor: '#fef3c7',
        badgeClass: 'bg-amber-600 text-white',
        textAccent: 'text-amber-950',
        statusLabel: 'PRÓXIMO VENCIMIENTO',
        timeDesc: `Corte cercano • Deuda actual ${debtRatio}%`
      };
    }
    return {
      strokeColor: '#059669',
      trackColor: '#d1fae5',
      badgeClass: 'bg-emerald-700 text-white',
      textAccent: 'text-emerald-950',
      statusLabel: 'CRÉDITO AL DÍA',
      timeDesc: `Pagos puntuales • Deuda vigente ${debtRatio}%`
    };
  };

  const circleTheme = getCircleTheme();
  const radius = 116;
  const circumference = 2 * Math.PI * radius;
  const progressPercent = isDisbursementInProcess
    ? 65
    : isPaidOff
    ? 100
    : Math.max(8, debtRatio);
  const strokeDashoffset =
    circumference - (progressPercent / 100) * circumference;

  const handleOpenPaymentPanel = (
    type: 'CUOTA' | 'CUOTA_PERSONALIZADA' | 'CREDITO_COMPLETO'
  ) => {
    setPaymentSuccessMessage(null);
    setPaymentReference(
      'REC-' + Math.floor(100000 + Math.random() * 900000)
    );
    if (type === 'CREDITO_COMPLETO') {
      setCustomPaymentAmount(saldoPendiente);
    } else if (
      type === 'CUOTA_PERSONALIZADA' &&
      (customPaymentAmount <= 0 || customPaymentAmount > saldoPendiente)
    ) {
      setCustomPaymentAmount(saldoPendiente);
    }
    setPaymentModalType(type);
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalType || isProcessingPayment) return;

    const amountToPay =
      paymentModalType === 'CREDITO_COMPLETO'
        ? saldoPendiente
        : paymentModalType === 'CUOTA_PERSONALIZADA'
        ? Math.min(saldoPendiente, Math.max(1, customPaymentAmount))
        : valorCuota;
    if (amountToPay <= 0) return;

    setIsProcessingPayment(true);
    try {
      const storagePayType =
        paymentModalType === 'CREDITO_COMPLETO'
          ? 'TOTALIDAD'
          : paymentModalType;
      const result = await StorageService.payLoan(
        user.id,
        amountToPay,
        storagePayType,
        paymentMethod
      );
      if (result.success && result.user) {
        setUser(result.user);
        setPaymentSuccessMessage(result.message);
        await fintechPanelsEngine.encryptAndBroadcastChange({
          action: 'CLIENT_LOAN_PAYMENT',
          userId: user.id,
          amount: amountToPay,
          remainingBalance: result.user.availableBalance
        });
        setTimeout(() => {
          setPaymentModalType(null);
          setPaymentSuccessMessage(null);
        }, 1000);
      }
    } catch {
      // Manejo silencioso conforme a Zero-Plaintext Policy
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const previousLoans = user.previousLoans || [];

  if (isPanelEntering) {
    return (
      <div className="w-full min-h-[65vh] bg-[#fcfaff] flex flex-col items-center justify-center p-6 animate-fadeIn">
        <div className="flex flex-col items-center space-y-3 max-w-xs w-full text-center">
          <div className="w-10 h-10 rounded border-3 border-purple-200 border-t-purple-700 animate-spin" />
          <span className="text-xs font-extrabold text-purple-950 tracking-tight">
            Sincronizando tu Panel de Cliente...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-64px)] bg-[#fcfaff] text-purple-950 flex flex-col font-sans animate-fadeIn">
      {/* Alerta de Integridad */}
      {!integrityValid && (
        <div className="bg-rose-600 text-white px-4 py-2.5 text-xs font-semibold flex items-center justify-between">
          <span>
            ALERTA: Se detectó una inconsistencia en los datos del usuario.
          </span>
          <button
            onClick={() => {
              StorageService.restoreUserIntegrity(user.cedula);
              window.location.reload();
            }}
            className="px-2.5 py-1 bg-white text-rose-700 rounded text-xs font-bold"
          >
            Restaurar
          </button>
        </div>
      )}

      {/* Aviso de Desembolso / Firma OTP */}
      {disbursementBanner && (
        <div className="bg-emerald-700 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{disbursementBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setDisbursementBanner(null)}
            className="px-2 py-0.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded text-[11px] cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Main Content: Se expande a toda la pantalla cuando el cliente terminó su crédito y solicita otro */}
      <main
        className={`flex-1 w-full mx-auto ${
          isPaidOff
            ? 'max-w-6xl px-4 sm:px-8 py-6 flex flex-col justify-between'
            : 'max-w-3xl px-4 sm:px-6 py-6 sm:py-10 space-y-8'
        }`}
      >
        {/* =========================================================================
            CASO A: CLIENTE EN VALIDACIÓN INICIAL (PENDIENTE / SIN ACEPTAR)
           ========================================================================= */}
        {!isLoanAssigned ? (
          <div className="py-10 text-center space-y-5 animate-fadeIn">
            <div className="relative w-16 h-16 mx-auto rounded bg-purple-100/80 flex items-center justify-center text-purple-700">
              <Clock className="w-8 h-8" />
            </div>

            <div className="pt-1 text-center animate-fadeIn">
              <div className="text-xs font-semibold text-purple-700 mb-0.5">
                Bienvenido/a
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-purple-950 tracking-tight">
                {user.fullName}
              </h1>
            </div>

            <div className="inline-flex items-center gap-1.5 text-purple-800 text-[11px] font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-purple-700" />
              <span>Solicitud en Validación • Ref. {user.creditTramiteId}</span>
            </div>

            <div className="max-w-xl mx-auto space-y-3">
              <h2 className="text-xl sm:text-2xl font-extrabold text-purple-950 tracking-tight">
                ¡Muy pronto podrás acceder a tu crédito aprobado!
              </h2>
              <p className="text-xs sm:text-sm text-purple-800/90 leading-relaxed">
                Tu solicitud se encuentra actualmente en etapa de validación y
                estudio financiero por parte de nuestro equipo en{' '}
                <strong>CrediULEP</strong>. Estamos verificando tu información
                para habilitar tu desembolso con total seguridad; tan pronto sea
                autorizado, verás reflejado tu cupo y tus opciones de pago en
                este panel.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-2 text-[11px] font-semibold text-purple-700">
              <span className="w-2 h-2 rounded bg-amber-500" />
              <span>Estado actual: Estudio y verificación en curso</span>
            </div>
          </div>
        ) : isPaidOff ? (
          <LoanRequestFlow
            user={user}
            loanSettings={loanSettings}
            maxCreditLimit={cupoMaximoCliente}
            isWaitingDisbursement={false}
            onUserUpdated={setUser}
            onBannerNotification={msg => {
              setDisbursementBanner(msg);
              setTimeout(() => setDisbursementBanner(null), 4000);
            }}
          />
        ) : (
          <>
            {/* =========================================================================
                CASO C: CRÉDITO EN PROCESO DE DESEMBOLSO O CRÉDITO ACTIVO CON SALDO
                1. CÍRCULO DE ESTADO FINANCIERO + NOMBRE DEL CLIENTE ABAJO
               ========================================================================= */}
            <div className="py-2 flex flex-col items-center justify-center animate-fadeIn space-y-5">
              <div className="relative flex items-center justify-center shrink-0 mx-auto">
                <svg
                  className="w-68 h-68 sm:w-76 sm:h-76 -rotate-90 transform"
                  viewBox="0 0 260 260"
                >
                  <circle
                    cx="130"
                    cy="130"
                    r={radius}
                    fill="transparent"
                    stroke={circleTheme.trackColor}
                    strokeWidth="14"
                  />
                  <circle
                    cx="130"
                    cy="130"
                    r={radius}
                    fill="transparent"
                    stroke={circleTheme.strokeColor}
                    strokeWidth="14"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                  <span
                    className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${circleTheme.badgeClass} mb-2`}
                  >
                    {circleTheme.statusLabel}
                  </span>

                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                    <span>
                      {isDisbursementInProcess
                        ? 'Monto en Desembolso'
                        : 'Préstamo / Deuda'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setHideBalance(!hideBalance)}
                      className="text-purple-600 hover:text-purple-950 transition cursor-pointer"
                      title="Mostrar / Ocultar valor"
                    >
                      {hideBalance ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <div
                    className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight my-1 ${circleTheme.textAccent}`}
                  >
                    {hideBalance
                      ? '••••••••••'
                      : isDisbursementInProcess
                      ? formatMoney(
                          user.disbursementRequest?.requestedAmount ||
                            user.creditLimit
                        )
                      : formatMoney(saldoPendiente)}
                  </div>

                  <div className="text-xs text-purple-800 font-mono">
                    {isDisbursementInProcess ? (
                      <>
                        Ref:{' '}
                        <strong>
                          {user.disbursementRequest?.bankApiReference ||
                            user.creditTramiteId}
                        </strong>
                      </>
                    ) : (
                      <>
                        Otorgado:{' '}
                        <strong>
                          {hideBalance ? '••••••' : formatMoney(montoPrestado)}
                        </strong>
                      </>
                    )}
                  </div>

                  <div className="text-[11px] font-semibold text-purple-700 mt-1">
                    {circleTheme.timeDesc}
                  </div>
                </div>
              </div>

              {/* Nombre del cliente abajo del círculo */}
              <div className="text-center animate-fadeIn pt-1">
                <div className="text-xs font-semibold text-purple-700 mb-0.5">
                  Bienvenido/a
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-purple-950 tracking-tight">
                  {user.fullName}
                </h1>
              </div>
            </div>

            {isDisbursementInProcess ? (
              <LoanRequestFlow
                user={user}
                loanSettings={loanSettings}
                maxCreditLimit={cupoMaximoCliente}
                isWaitingDisbursement={true}
                onUserUpdated={setUser}
                onBannerNotification={msg => {
                  setDisbursementBanner(msg);
                  setTimeout(() => setDisbursementBanner(null), 4000);
                }}
              />
            ) : (
              /* =========================================================================
                 SUBCASO C2: CRÉDITO ACTIVO CON SALDO PENDIENTE -> CUADRO DE PAGO EN LÍNEA
                 ========================================================================= */
              <div className="bg-white border border-purple-200 rounded p-6 sm:p-7 shadow-xs space-y-5 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-purple-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded bg-purple-700 flex items-center justify-center text-white">
                      <Banknote className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm sm:text-base font-extrabold text-purple-950 tracking-tight">
                        Opciones de Pago de tu Crédito
                      </h2>
                      <p className="text-xs text-purple-700/80">
                        {isOverdue
                          ? 'Por presentar estado en mora, únicamente está habilitado el pago total del crédito'
                          : 'Realiza el pago de tu cuota mensual o abona el total para terminar tu crédito y habilitar uno nuevo'}
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold text-purple-900 bg-purple-50 px-3 py-1 rounded border border-purple-200 self-start sm:self-center">
                    Obligación Vigente
                  </span>
                </div>

                {isOverdue ? (
                  <div className="p-5 rounded bg-rose-50/50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-rose-700">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-extrabold uppercase tracking-wider">
                          Pagar Crédito Completo (Obligación en Mora)
                        </span>
                      </div>
                      <p className="text-xs text-purple-800/80">
                        Cancela la totalidad del saldo vencido para normalizar
                        tu estado y habilitar un nuevo crédito.
                      </p>
                      <div className="pt-1 flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-purple-700 uppercase">
                          Total a Pagar:
                        </span>
                        <span className="text-2xl sm:text-3xl font-extrabold text-rose-700 font-mono tracking-tight">
                          {hideBalance
                            ? '••••••••••'
                            : formatMoney(saldoPendiente)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={saldoPendiente <= 0}
                      onClick={() => handleOpenPaymentPanel('CREDITO_COMPLETO')}
                      className="w-full sm:w-72 py-3.5 px-5 bg-rose-600 hover:bg-rose-700 disabled:bg-purple-200 disabled:text-purple-500 text-white font-bold text-xs rounded transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shrink-0"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>
                        Pagar Crédito Completo (
                        {hideBalance ? '••••••' : formatMoney(saldoPendiente)})
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col space-y-4">
                    {/* Opción 1: Pagar Cuota */}
                    <div className="w-full p-5 rounded bg-[#fcfaff] border border-purple-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                          <Receipt className="w-4 h-4 text-purple-700" />
                          <span>Pagar Cuota</span>
                        </span>

                        <div className="pt-1 flex items-baseline gap-2">
                          <span className="text-[11px] font-semibold text-purple-700 uppercase">
                            Valor de la Cuota:
                          </span>
                          <span className="text-2xl font-extrabold text-purple-950 font-mono tracking-tight">
                            {hideBalance
                              ? '••••••••••'
                              : formatMoney(valorCuota)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={valorCuota <= 0}
                        onClick={() => handleOpenPaymentPanel('CUOTA')}
                        className="w-full sm:w-64 py-3 px-4 bg-purple-700 hover:bg-purple-800 disabled:bg-purple-200 disabled:text-purple-500 text-white font-bold text-xs rounded transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shrink-0"
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>
                          Pagar Cuota (
                          {hideBalance ? '••••••' : formatMoney(valorCuota)})
                        </span>
                      </button>
                    </div>

                    {/* Opción 2: Pagar Cuota Personalizada o Terminar Crédito */}
                    <div className="w-full p-5 rounded bg-purple-50/40 border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-purple-950 flex items-center gap-1.5">
                          <Wallet className="w-4 h-4 text-purple-700" />
                          <span>
                            Pagar Cuota Personalizada / Terminar Crédito
                          </span>
                        </span>

                        <div className="pt-1 flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-purple-700 uppercase">
                              Monto a Abonar (COP):
                            </span>
                            <input
                              type="number"
                              min={10000}
                              max={
                                saldoPendiente > 0 ? saldoPendiente : undefined
                              }
                              step={50000}
                              disabled={saldoPendiente <= 0}
                              value={customPaymentAmount || ''}
                              onChange={e => {
                                const val = Number(e.target.value);
                                setCustomPaymentAmount(
                                  saldoPendiente > 0
                                    ? Math.min(
                                        saldoPendiente,
                                        Math.max(0, val)
                                      )
                                    : 0
                                );
                              }}
                              className="w-40 px-3 py-1.5 rounded bg-white border border-purple-300 text-purple-950 font-mono font-extrabold text-sm focus:border-purple-700 focus:outline-none disabled:opacity-50"
                              placeholder="Ingrese valor"
                            />
                          </div>

                          {saldoPendiente > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setCustomPaymentAmount(saldoPendiente)
                              }
                              className="text-[11px] font-bold text-purple-800 hover:text-purple-950 bg-white hover:bg-purple-100 px-2.5 py-1 rounded border border-purple-300 transition cursor-pointer"
                            >
                              Usar Saldo Total (
                              {hideBalance
                                ? '••••••'
                                : formatMoney(saldoPendiente)}
                              )
                            </button>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={
                          saldoPendiente <= 0 || customPaymentAmount <= 0
                        }
                        onClick={() =>
                          handleOpenPaymentPanel('CUOTA_PERSONALIZADA')
                        }
                        className="w-full sm:w-64 py-3 px-4 bg-purple-950 hover:bg-purple-900 disabled:bg-purple-200 disabled:text-purple-500 text-white font-bold text-xs rounded transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shrink-0"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          Pagar ({hideBalance
                            ? '••••••'
                            : formatMoney(customPaymentAmount)}
                          )
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Panel Integrado de Confirmación de Pago en Línea (Cero Modales) */}
                {paymentModalType && (
                  <div className="mt-4 p-5 bg-purple-50/70 border-2 border-purple-600 rounded space-y-4 animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-purple-200 pb-2">
                      <div>
                        <h3 className="text-sm font-extrabold text-purple-950">
                          {paymentModalType === 'CREDITO_COMPLETO'
                            ? 'Confirmar Pago de Crédito Completo'
                            : paymentModalType === 'CUOTA_PERSONALIZADA'
                            ? 'Confirmar Pago Personalizado'
                            : 'Confirmar Pago de Cuota'}
                        </h3>
                        <p className="text-[11px] text-purple-700">
                          Recaudo en línea aplicado al trámite Ref:{' '}
                          <strong>{user.creditTramiteId}</strong>
                        </p>
                      </div>
                      <span className="font-mono text-xs font-bold text-purple-900 bg-white px-2.5 py-1 border border-purple-200 rounded">
                        {paymentReference}
                      </span>
                    </div>

                    {paymentSuccessMessage ? (
                      <div className="py-4 text-center space-y-2 animate-fadeIn">
                        <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                        <h4 className="text-sm font-bold text-purple-950">
                          {paymentSuccessMessage}
                        </h4>
                      </div>
                    ) : (
                      <form
                        onSubmit={handleConfirmPayment}
                        className="space-y-4"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div className="p-3 bg-white border border-purple-200 rounded">
                            <span className="text-purple-700 block">
                              Deuda Actual:
                            </span>
                            <strong className="font-mono text-sm text-purple-950">
                              {formatMoney(saldoPendiente)}
                            </strong>
                          </div>

                          <div className="p-3 bg-white border border-purple-200 rounded">
                            <span className="text-purple-700 block">
                              Valor a Pagar Ahora:
                            </span>
                            <strong className="font-mono text-sm text-emerald-700">
                              {formatMoney(
                                paymentModalType === 'CREDITO_COMPLETO'
                                  ? saldoPendiente
                                  : paymentModalType === 'CUOTA_PERSONALIZADA'
                                  ? customPaymentAmount
                                  : valorCuota
                              )}
                            </strong>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-purple-900 mb-1">
                              Medio de Pago Autorizado
                            </label>
                            <select
                              value={paymentMethod}
                              onChange={e => setPaymentMethod(e.target.value)}
                              className="w-full px-3 py-2 rounded bg-white border border-purple-300 text-xs text-purple-950 focus:border-purple-700 focus:outline-none"
                            >
                              <option value="PSE - Débito Bancario">
                                PSE - Débito Bancario
                              </option>
                              <option value="Bancolombia">
                                Transferencia Bancolombia
                              </option>
                              <option value="Nequi">Nequi</option>
                              <option value="Davivienda">Davivienda</option>
                              <option value="Banco de Bogotá">
                                Banco de Bogotá
                              </option>
                            </select>
                          </div>
                        </div>

                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setPaymentModalType(null)}
                            className="px-4 py-2 bg-white text-purple-800 text-xs font-semibold rounded border border-purple-300 hover:bg-purple-100 cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={isProcessingPayment}
                            className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded border border-purple-800 cursor-pointer"
                          >
                            {isProcessingPayment
                              ? 'Procesando...'
                              : 'Confirmar Pago en Línea'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* =========================================================================
            4. REGISTRO DE CRÉDITOS ANTERIORES (OCULTO MIENTRAS ESTÁ EN EL WIZARD A PANTALLA COMPLETA)
           ========================================================================= */}
        {!isPaidOff && previousLoans.length > 0 && (
          <div className="pt-2 space-y-3 animate-fadeIn">
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-purple-300/80">
              <History className="w-4 h-4 text-purple-700" />
              <h2 className="text-sm sm:text-base font-extrabold text-purple-950 tracking-tight uppercase">
                Registro de Créditos Anteriores
              </h2>
              <div className="flex-1 h-px bg-purple-200/70 ml-2" />
            </div>

            <div className="divide-y divide-purple-200/90 border-b border-purple-200/90">
              {previousLoans.map(prev => (
                <div
                  key={prev.id}
                  className="py-3.5 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-4 h-0.5 bg-purple-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-purple-600 font-semibold uppercase block">
                        Monto Otorgado ({prev.tramiteId})
                      </span>
                      <span className="font-mono font-extrabold text-purple-950 text-base sm:text-lg">
                        {hideBalance
                          ? '••••••••'
                          : formatMoney(prev.amountGranted)}
                      </span>
                    </div>
                  </div>

                  <div className="hidden sm:block flex-1 max-w-28 border-t border-dashed border-purple-300/80 mx-4" />

                  <div className="text-right">
                    <span className="text-[10px] text-purple-600 font-semibold uppercase block">
                      Fecha Finalización ({prev.finalStatus})
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-mono font-bold text-purple-900">
                      <Calendar className="w-3.5 h-3.5 text-purple-600" />
                      <span>{prev.closedDate || prev.startDate}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
