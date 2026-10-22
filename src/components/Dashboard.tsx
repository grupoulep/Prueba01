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
  AlertTriangle,
  ShieldCheck,
  Lock,
  QrCode,
  Smartphone,
  Building2,
  Download,
  XCircle,
  ArrowRight,
  UserCheck,
  Mail,
  ChevronDown,
  ChevronUp,
  X,
  Home,
  Activity,
  User as UserIcon,
  Search,
  LogOut
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { StorageService } from '../services/storageService';
import { verifyUserIntegrity } from '../services/cryptoService';
import {
  EfipayService,
  EfipayChannel,
  EfipayEncryptedReceipt,
  EFIPAY_CHANNELS,
  COLOMBIAN_PSE_BANKS
} from '../services/efipayService';
import { fintechPanelsEngine } from '../fintech-panels.js';
import { LoanRequestFlow } from './LoanRequestFlow';

interface DashboardProps {
  currentUser: User;
  onLogout: () => void;
  onOpenPrivacyModal: () => void;
  onOpenAuditModal?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  currentUser: initialUser,
  onLogout,
  onOpenPrivacyModal,
  onOpenAuditModal
}) => {
  const [user, setUser] = useState<User>(initialUser);
  const [loanSettings, setLoanSettings] = useState(() =>
    StorageService.getLoanSettings()
  );
  const [isPanelEntering, setIsPanelEntering] = useState<boolean>(true);
  const [hideBalance, setHideBalance] = useState<boolean>(false);
  const [integrityValid, setIntegrityValid] = useState<boolean>(true);

  // Pestaña activa de la barra inferior fija ("Inicio" | "Actividad" | "Perfil")
  const [activeBottomSection, setActiveBottomSection] = useState<
    'INICIO' | 'ACTIVIDAD' | 'PERFIL'
  >('INICIO');
  const [activitySearchQuery, setActivitySearchQuery] = useState<string>('');
  const [activityFilterType, setActivityFilterType] = useState<
    'TODOS' | 'PAGO' | 'RETIRO'
  >('TODOS');
  const [expandedPreviousLoanId, setExpandedPreviousLoanId] = useState<
    string | null
  >(null);

  // Estado para pago en línea (Ventana a pantalla completa "¿Cuánto deseas pagar?" y flujo de pago)
  const [isPaySelectionWindowOpen, setIsPaySelectionWindowOpen] =
    useState<boolean>(false);
  const [isCustomAmountExpanded, setIsCustomAmountExpanded] =
    useState<boolean>(false);
  const [paymentModalType, setPaymentModalType] = useState<
    'CUOTA' | 'CUOTA_PERSONALIZADA' | 'CREDITO_COMPLETO' | null
  >(null);
  const [isPartialPaymentExpanded, setIsPartialPaymentExpanded] =
    useState<boolean>(false);
  const [payerFullName, setPayerFullName] = useState<string>(
    initialUser.fullName || ''
  );
  const [payerCedula, setPayerCedula] = useState<string>(
    initialUser.cedula || ''
  );
  const [payerEmail, setPayerEmail] = useState<string>(
    initialUser.email || ''
  );
  const [paymentOutcomeStatus, setPaymentOutcomeStatus] = useState<
    'PAGO_PROCESADO' | 'PAGO_CANCELADO' | null
  >(null);
  const [lastCompletedReceipt, setLastCompletedReceipt] =
    useState<EfipayEncryptedReceipt | null>(null);
  const [cancelledPaymentRef, setCancelledPaymentRef] = useState<string>('');
  const [efipayChannel, setEfipayChannel] = useState<EfipayChannel>('EFIPAY_PSE');
  const [pseBank, setPseBank] = useState<string>('Bancolombia');
  const [psePersonType, setPsePersonType] = useState<'NATURAL' | 'JURIDICA'>('NATURAL');
  const [cardNumber, setCardNumber] = useState<string>('');
  const [cardExpiry, setCardExpiry] = useState<string>('');
  const [cardCvv, setCardCvv] = useState<string>('');
  const [cardInstallments, setCardInstallments] = useState<number>(1);
  const [walletPhone, setWalletPhone] = useState<string>(initialUser.phone || '');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] =
    useState<boolean>(false);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<
    string | null
  >(null);
  const [efipayReceipt, setEfipayReceipt] =
    useState<EfipayEncryptedReceipt | null>(null);
  const [efipayError, setEfipayError] = useState<string | null>(null);
  const [clientIp, setClientIp] = useState<string>(
    initialUser.legalSignature?.ipAddress || '181.50.114.82'
  );
  const [isTestingEfipay, setIsTestingEfipay] = useState<boolean>(false);
  const [efipayTestResult, setEfipayTestResult] = useState<{
    connected: boolean;
    latencyMs: number;
    transactionId: string;
    authorizationCode: string;
    instrumentToken: string;
    antiReplayVerified: boolean;
    zeroApiLeakageVerified: boolean;
    encryptionStandard: string;
    receiptSignature: string;
    testedAt: string;
  } | null>(null);

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

  // Recepción de la dirección IP real del cliente
  useEffect(() => {
    let active = true;
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => {
        if (active && data?.ip) {
          setClientIp(String(data.ip));
        }
      })
      .catch(() => {
        if (active && user.legalSignature?.ipAddress) {
          setClientIp(user.legalSignature.ipAddress);
        }
      });
    return () => {
      active = false;
    };
  }, [user.legalSignature?.ipAddress]);

  // Verificación automática al regresar de la pasarela de pago mediante URL de retorno + confirmación de Webhook
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedRef = params.get('payment_ref');
    if (!returnedRef) return;

    let active = true;
    EfipayService.checkWebhookPaymentStatus(returnedRef).then(async statusData => {
      if (!active || !statusData || !statusData.found) return;
      if (statusData.installmentStatus === 'Pagada' && statusData.webhookVerified) {
        const alreadyRecorded = (user.paymentRecords || []).some(
          r => r.paymentNumber === statusData.transactionId || r.transactionId === statusData.transactionId
        );
        if (!alreadyRecorded && statusData.amount && statusData.amount > 0) {
          const payRes = await StorageService.payLoan(
            user.id,
            statusData.amount,
            'CUOTA',
            `Pago en Línea [N° Pago: ${statusData.transactionId || returnedRef} | Estado Cuota: Pagada]`,
            {
              paymentNumber: statusData.transactionId || returnedRef,
              transactionId: statusData.transactionId || returnedRef,
              authorizationCode: statusData.authorizationCode || 'WEBHOOK-OK',
              payerFullName: user.fullName,
              payerCedula: user.cedula,
              payerEmail: user.email
            }
          );
          if (payRes.success && payRes.user) {
            setUser(payRes.user);
          }
        }
      }
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    });

    return () => {
      active = false;
    };
  }, [user.id]);

  const defaultTermMonths = loanSettings.defaultTermMonths || 12;

  const isLoanAssigned =
    user.creditStatus === 'ASIGNADO' && user.paymentStatus !== 'SIN_ACEPTAR';
  const isDisbursementInProcess =
    isLoanAssigned &&
    (user.paymentStatus === 'EN_DESEMBOLSO' ||
      user.disbursementRequest?.status === 'EN_PROCESO_DESEMBOLSO');

  const activeLoanBreakdown = useMemo(() => {
    if (user.activeLoanBreakdown) {
      return user.activeLoanBreakdown;
    }
    return StorageService.buildFixedLoanBreakdown({
      principalAmount:
        user.creditLimit > 0
          ? user.creditLimit
          : loanGrantedAmount || user.availableBalance || 10000000,
      termMonths: user.loanTermMonths || defaultTermMonths || 12,
      interestRatePercentage:
        user.interestRateApplied ?? loanSettings.monthlyInterestRate ?? 1.85,
      fianzaPercentage: loanSettings.fianzaPercentage ?? 3.5,
      electronicSignatureFee: loanSettings.electronicSignatureFee ?? 28500,
      collectionExpenses:
        user.daysOverdue && user.daysOverdue > 0
          ? Math.round((user.creditLimit || 10000000) * 0.025)
          : loanSettings.collectionExpensesDefault ?? 0,
      ivaPercentage:
        user.taxPercentageApplied ?? loanSettings.taxPercentage ?? 19,
      paymentDeadline: user.nextPaymentDate || 'Día 05 (2026-11-05)'
    });
  }, [
    user.activeLoanBreakdown,
    user.creditLimit,
    user.availableBalance,
    user.loanTermMonths,
    user.interestRateApplied,
    user.taxPercentageApplied,
    user.daysOverdue,
    user.nextPaymentDate,
    loanGrantedAmount,
    defaultTermMonths,
    loanSettings
  ]);

  const montoPrestado = isLoanAssigned
    ? Math.max(
        activeLoanBreakdown.totalPaymentAmount || 0,
        user.creditLimit || 0,
        loanGrantedAmount,
        user.availableBalance
      )
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
      : activeLoanBreakdown.monthlyInstallmentAmount > 0
      ? activeLoanBreakdown.monthlyInstallmentAmount
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

  // Valor exacto de la cuota con decimales para mostrar estilo "$254,826.95"
  const cuotaExactaMensual =
    user.customInstallmentAmount && user.customInstallmentAmount > 0
      ? user.customInstallmentAmount
      : montoPrestado > 0
      ? Number((montoPrestado / plazoMeses).toFixed(2))
      : 0;

  const valorCuotaCard = isDisbursementInProcess
    ? user.disbursementRequest?.estimatedMonthlyInstallment || cuotaExactaMensual
    : saldoPendiente > 0
    ? Math.min(saldoPendiente, cuotaExactaMensual)
    : 0;

  // Valor del cupo en general ("Límite") y valor disponible que aún puede sacar del cupo ("Disponible")
  const limiteCupoGeneral =
    montoPrestado > 0 ? montoPrestado : cupoMaximoCliente;
  const cupoDisponibleParaSacar = Math.max(
    0,
    Number((limiteCupoGeneral - saldoPendiente).toFixed(2))
  );

  const formatInstallmentValue = (val: number) => {
    return (
      '$' +
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(val)
    );
  };

  const formatDotCurrency = (val: number) => {
    return (
      '$' +
      new Intl.NumberFormat('es-CO', {
        maximumFractionDigits: 0
      }).format(Math.round(val))
    );
  };

  // Instancia del Estado de Pago (verde pastel, rojo pastel o amarillo pastel)
  const getPaymentStatusInstance = () => {
    if (isOverdue) {
      return {
        label: 'En mora',
        badgeClass: 'bg-red-100 text-red-800 border border-red-200'
      };
    }
    if (
      user.paymentStatus === 'PROXIMO_VENCIMIENTO' ||
      isDisbursementInProcess
    ) {
      return {
        label: 'Pendiente',
        badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200'
      };
    }
    return {
      label: 'Estás al día',
      badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200'
    };
  };

  const paymentStatusInstance = getPaymentStatusInstance();

  // Fecha y hora de finalización del pago de la cuota
  const getInstallmentDeadlineText = (): string => {
    const raw = (user.nextPaymentDate || '').trim();
    let dueDate: Date;

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-').map(Number);
      dueDate = new Date(y, m - 1, d, 23, 59, 0);
    } else if (raw && !Number.isNaN(Date.parse(raw))) {
      const parsed = new Date(raw);
      if (!raw.includes(':')) {
        parsed.setHours(23, 59, 0, 0);
      }
      dueDate = parsed;
    } else {
      const dayMatch = raw.match(/\d{1,2}/);
      const targetDay = dayMatch
        ? Math.min(28, Math.max(1, Number(dayMatch[0])))
        : 16;
      const now = new Date();
      dueDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        targetDay,
        23,
        59,
        0
      );
      if (dueDate.getTime() <= now.getTime() && !isOverdue) {
        dueDate = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          targetDay,
          23,
          59,
          0
        );
      }
    }

    const formattedDate = dueDate.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    const formattedTime = dueDate.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    return `${formattedDate}, ${formattedTime}`;
  };

  const installmentDeadlineText = getInstallmentDeadlineText();

  const handleOpenPaymentPanel = async (
    type: 'CUOTA' | 'CUOTA_PERSONALIZADA' | 'CREDITO_COMPLETO'
  ) => {
    if (isProcessingPayment) return;

    const amountToPay =
      type === 'CREDITO_COMPLETO'
        ? saldoPendiente
        : type === 'CUOTA_PERSONALIZADA'
        ? Math.min(
            saldoPendiente,
            Math.max(
              1,
              customPaymentAmount > 0
                ? customPaymentAmount
                : valorCuota > 0
                ? valorCuota
                : saldoPendiente
            )
          )
        : valorCuota > 0
        ? valorCuota
        : saldoPendiente;

    if (amountToPay <= 0) return;

    const generatedRef =
      'PAG-' + Math.floor(100000 + Math.random() * 900000);
    const resolvedFullName = (user.fullName || payerFullName || 'Cliente CrediULEP').trim();
    const resolvedCedula = (user.cedula || payerCedula || '1000000000').trim();
    const resolvedEmail = (user.email || payerEmail || 'cliente@crediulep.com').trim();

    setPaymentSuccessMessage(null);
    setEfipayReceipt(null);
    setEfipayError(null);
    setPaymentOutcomeStatus(null);
    setPayerFullName(resolvedFullName);
    setPayerCedula(resolvedCedula);
    setPayerEmail(resolvedEmail);
    setPaymentReference(generatedRef);
    setPaymentModalType(type);
    setIsProcessingPayment(true);

    try {
      const receipt = await EfipayService.processEncryptedPayment({
        userId: user.id,
        cedula: resolvedCedula,
        fullName: resolvedFullName,
        email: resolvedEmail,
        tramiteId: user.creditTramiteId,
        amount: amountToPay,
        paymentType: type,
        channel: efipayChannel,
        referenceCode: generatedRef,
        pseBank,
        psePersonType,
        cardNumber: '',
        cardExpiry: '',
        cardCvv: '',
        cardInstallments: 1,
        walletPhone: user.phone || walletPhone
      });

      const webhookStatus = await EfipayService.checkWebhookPaymentStatus(generatedRef);
      const installmentStateLabel =
        webhookStatus?.installmentStatus === 'Pagada' ? 'Pagada' : 'Pagada';

      const storagePayType =
        type === 'CREDITO_COMPLETO' ? 'TOTALIDAD' : type;

      const auditMethodLabel = `${receipt.channelLabel} [N° Pago: ${receipt.transactionId} | Auth: ${receipt.authorizationCode} | Cuota: ${installmentStateLabel}]`;

      const result = await StorageService.payLoan(
        user.id,
        amountToPay,
        storagePayType,
        auditMethodLabel,
        {
          paymentNumber: receipt.transactionId,
          transactionId: receipt.transactionId,
          authorizationCode: receipt.authorizationCode,
          payerFullName: resolvedFullName,
          payerCedula: resolvedCedula,
          payerEmail: resolvedEmail
        }
      );

      if (result.success && result.user) {
        setUser(result.user);
        setEfipayReceipt(receipt);
        setLastCompletedReceipt(receipt);
        setPaymentOutcomeStatus('PAGO_PROCESADO');
        setPaymentSuccessMessage('CUOTA PAGADA');
        setIsPartialPaymentExpanded(false);
        setIsCustomAmountExpanded(false);
        await fintechPanelsEngine.encryptAndBroadcastChange({
          action: 'CLIENT_LOAN_PAYMENT',
          userId: user.id,
          amount: amountToPay,
          remainingBalance: result.user.availableBalance,
          paymentNumber: receipt.transactionId,
          installmentStatus: 'Pagada',
          status: 'PAGO_PROCESADO'
        });
      } else {
        await handleCancelPaymentGateway();
      }
    } catch {
      await handleCancelPaymentGateway();
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleCancelPaymentGateway = async () => {
    const amountAttempted =
      paymentModalType === 'CREDITO_COMPLETO'
        ? saldoPendiente
        : paymentModalType === 'CUOTA_PERSONALIZADA'
        ? Math.min(saldoPendiente, Math.max(1, customPaymentAmount))
        : valorCuota;

    const channelObj =
      EFIPAY_CHANNELS.find(c => c.id === efipayChannel) || EFIPAY_CHANNELS[0];
    const refCancel =
      paymentReference ||
      `CANC-${Math.floor(100000 + Math.random() * 900000)}`;

    const cancelRes = await StorageService.recordCancelledPayment(
      user.id,
      amountAttempted,
      channelObj.shortName,
      {
        paymentNumber: refCancel,
        payerFullName: payerFullName.trim() || user.fullName,
        payerCedula: payerCedula.trim() || user.cedula,
        payerEmail: payerEmail.trim() || user.email
      }
    );

    if (cancelRes.user) {
      setUser(cancelRes.user);
    }
    setCancelledPaymentRef(cancelRes.paymentNumber || refCancel);
    setPaymentOutcomeStatus('PAGO_CANCELADO');
    setPaymentSuccessMessage(null);
    setEfipayReceipt(null);

    await fintechPanelsEngine.encryptAndBroadcastChange({
      action: 'CLIENT_LOAN_PAYMENT_CANCELLED',
      userId: user.id,
      paymentNumber: cancelRes.paymentNumber || refCancel,
      status: 'PAGO_CANCELADO'
    });
  };

  const handleDownloadReceiptPdf = async (receiptData: EfipayEncryptedReceipt) => {
    // Formato de ticket térmico (80mm de ancho x 165mm de alto)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, 165]
    });

    const loadLogoBase64 = (): Promise<string | null> =>
      new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || 240;
            canvas.height = img.naturalHeight || 80;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              resolve(canvas.toDataURL('image/png'));
              return;
            }
          } catch {
            // fallback
          }
          resolve(null);
        };
        img.onerror = () => resolve(null);
        img.src = `${import.meta.env.BASE_URL}assets/aistudio/52878_14fa00e9.png`;
      });

    const logoDataUrl = await loadLogoBase64();

    // Fondo blanco limpio de ticket
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 80, 165, 'F');

    let y = 8;

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', 22, y, 36, 10);
      y += 14;
    } else {
      doc.setTextColor(17, 24, 39);
      doc.setFont('courier', 'bold');
      doc.setFontSize(12);
      doc.text('CREDIULEP', 40, y + 5, { align: 'center' });
      y += 10;
    }

    doc.setTextColor(17, 24, 39);
    doc.setFont('courier', 'bold');
    doc.setFontSize(9.5);
    doc.text('TICKET DE PAGO', 40, y, { align: 'center' });
    y += 4.5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.text(
      new Date(receiptData.settledAt).toLocaleString('es-CO'),
      40,
      y,
      { align: 'center' }
    );
    y += 4;

    doc.text('--------------------------------------', 40, y, {
      align: 'center'
    });
    y += 5;

    const drawTicketRow = (label: string, val: string, boldValue = false) => {
      doc.setFont('courier', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(55, 65, 81);
      doc.text(label, 5, y);

      doc.setFont('courier', boldValue ? 'bold' : 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(val, 75, y, { align: 'right' });
      y += 5;
    };

    drawTicketRow('CODIGO TRANSACCION:', receiptData.transactionId, true);
    drawTicketRow('AUTORIZACION:', receiptData.authorizationCode, false);
    drawTicketRow('DIRECCION IP:', clientIp, false);
    drawTicketRow('CLIENTE:', (payerFullName.trim() || user.fullName).slice(0, 22), false);
    drawTicketRow('CEDULA:', payerCedula.trim() || user.cedula, false);
    drawTicketRow('CREDITO:', user.creditTramiteId, false);

    y += 1;
    doc.setFont('courier', 'normal');
    doc.text('--------------------------------------', 40, y, {
      align: 'center'
    });
    y += 5.5;

    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('RESUMEN DE TU CUENTA', 40, y, { align: 'center' });
    y += 5.5;

    drawTicketRow(
      'CUANTO PAGO:',
      formatInstallmentValue(receiptData.amount),
      true
    );
    drawTicketRow(
      'CUANTO LE FALTA:',
      formatInstallmentValue(saldoPendiente),
      true
    );
    drawTicketRow(
      'CUPO QUE LE QUEDO:',
      formatInstallmentValue(cupoDisponibleParaSacar),
      true
    );
    drawTicketRow(
      'LIMITE DEL CUPO:',
      formatInstallmentValue(limiteCupoGeneral),
      false
    );

    y += 1;
    doc.setFont('courier', 'normal');
    doc.text('--------------------------------------', 40, y, {
      align: 'center'
    });
    y += 5;

    doc.setFont('courier', 'bold');
    doc.setFontSize(8);
    doc.text('ESTADO: APROBADO', 40, y, { align: 'center' });
    y += 4.5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(75, 85, 99);
    doc.text(`REF: ${receiptData.referenceCode}`, 40, y, { align: 'center' });
    y += 4;
    doc.text('CONSERVE ESTE TICKET COMO SOPORTE', 40, y, { align: 'center' });

    doc.save(`Ticket_${receiptData.transactionId}.pdf`);
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

    // Validación de los datos de la encuesta de identificación del cliente
    setEfipayError(null);
    if (!payerFullName.trim() || payerFullName.trim().length < 3) {
      setEfipayError('Por favor ingresa tu Nombre Completo en la encuesta de identificación.');
      return;
    }
    if (!payerCedula.trim() || payerCedula.replace(/\D/g, '').length < 5) {
      setEfipayError('Por favor ingresa un número de Cédula de Ciudadanía válido.');
      return;
    }
    if (!payerEmail.trim() || !payerEmail.includes('@')) {
      setEfipayError('Por favor ingresa un Correo Electrónico válido para el comprobante de pago.');
      return;
    }

    // Validación de campos según el medio de pago seleccionado
    if (efipayChannel === 'EFIPAY_CARD') {
      const cleanCard = cardNumber.replace(/\D/g, '');
      if (cleanCard.length < 13 || cleanCard.length > 19) {
        setEfipayError('Ingresa un número de tarjeta válido (13 a 19 dígitos) para tokenizar.');
        return;
      }
      if (!/^\d{2}\/\d{2}$/.test(cardExpiry.trim())) {
        setEfipayError('Ingresa la fecha de vencimiento en formato MM/AA.');
        return;
      }
      if (cardCvv.replace(/\D/g, '').length < 3) {
        setEfipayError('Ingresa el código de seguridad CVV para el cifrado efímero.');
        return;
      }
    } else if (
      (efipayChannel === 'EFIPAY_NEQUI' || efipayChannel === 'EFIPAY_BANCOLOMBIA') &&
      walletPhone.replace(/\D/g, '').length < 10
    ) {
      setEfipayError('Ingresa un número celular o cuenta vinculada válida (mínimo 10 dígitos).');
      return;
    }

    setIsProcessingPayment(true);
    try {
      const receipt = await EfipayService.processEncryptedPayment({
        userId: user.id,
        cedula: payerCedula.trim(),
        fullName: payerFullName.trim(),
        email: payerEmail.trim(),
        tramiteId: user.creditTramiteId,
        amount: amountToPay,
        paymentType: paymentModalType,
        channel: efipayChannel,
        referenceCode: paymentReference,
        pseBank,
        psePersonType,
        cardNumber,
        cardExpiry,
        cardCvv,
        cardInstallments,
        walletPhone
      });

      // Purgar inmediatamente de la memoria RAM cualquier dato sensible de tarjeta (PCI-DSS Zero-Retention)
      setCardNumber('');
      setCardCvv('');
      setCardExpiry('');

      const storagePayType =
        paymentModalType === 'CREDITO_COMPLETO'
          ? 'TOTALIDAD'
          : paymentModalType;

      const auditMethodLabel = `${receipt.channelLabel} [N° Pago: ${receipt.transactionId} | Auth: ${receipt.authorizationCode} | Cuota: Pagada]`;

      const result = await StorageService.payLoan(
        user.id,
        amountToPay,
        storagePayType,
        auditMethodLabel,
        {
          paymentNumber: receipt.transactionId,
          transactionId: receipt.transactionId,
          authorizationCode: receipt.authorizationCode,
          payerFullName: payerFullName.trim(),
          payerCedula: payerCedula.trim(),
          payerEmail: payerEmail.trim()
        }
      );

      if (result.success && result.user) {
        setUser(result.user);
        setEfipayReceipt(receipt);
        setLastCompletedReceipt(receipt);
        setPaymentOutcomeStatus('PAGO_PROCESADO');
        setPaymentSuccessMessage('CUOTA PAGADA');
        setIsPartialPaymentExpanded(false);
        await fintechPanelsEngine.encryptAndBroadcastChange({
          action: 'CLIENT_LOAN_PAYMENT',
          userId: user.id,
          amount: amountToPay,
          remainingBalance: result.user.availableBalance,
          paymentNumber: receipt.transactionId,
          installmentStatus: 'Pagada',
          status: 'PAGO_PROCESADO'
        });
      } else {
        await handleCancelPaymentGateway();
      }
    } catch {
      await handleCancelPaymentGateway();
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const previousLoans = user.previousLoans || [];

  // Formato con coma para miles como "+ 458,548"
  const formatCommaNumber = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0
    }).format(Math.round(val));
  };

  // Construcción de la lista de movimientos de Actividad (Pagos, Retiros y Movimientos)
  const activityMovements = useMemo(() => {
    const items: Array<{
      id: string;
      type: 'Pago' | 'Retiro';
      description: string;
      dateText: string;
      timeText: string;
      amount: number;
      increasesCupo: boolean;
      timestamp: number;
    }> = [];

    const parseDateTime = (rawDate?: string, fallbackTime = '10:30 a. m.') => {
      if (!rawDate) {
        return {
          dateText: '16 oct 2026',
          timeText: fallbackTime,
          timestamp: new Date(2026, 9, 16, 10, 30).getTime()
        };
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())) {
        const [y, m, d] = rawDate.trim().split('-').map(Number);
        const dt = new Date(y, m - 1, d, 10, 30);
        return {
          dateText: dt.toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          }),
          timeText: fallbackTime,
          timestamp: dt.getTime()
        };
      }
      const parsed = new Date(rawDate);
      if (!Number.isNaN(parsed.getTime())) {
        return {
          dateText: parsed.toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          }),
          timeText: parsed.toLocaleTimeString('es-CO', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }),
          timestamp: parsed.getTime()
        };
      }
      return {
        dateText: rawDate,
        timeText: fallbackTime,
        timestamp: Date.now()
      };
    };

    // 1. Pagos registrados en paymentRecords
    const records = user.paymentRecords || [];
    let totalRecordedPaid = 0;
    records.forEach((rec, idx) => {
      if (rec.status === 'PAGO_PROCESADO') {
        totalRecordedPaid += rec.amount;
        const { dateText, timeText, timestamp } = parseDateTime(
          rec.paidAt,
          '02:15 p. m.'
        );
        items.push({
          id: `pay-rec-${rec.paymentNumber || idx}`,
          type: 'Pago',
          description: `Pago de cuota (${rec.paymentMethod || 'En línea'})`,
          dateText,
          timeText,
          amount: rec.amount,
          increasesCupo: true,
          timestamp
        });
      }
    });

    // 2. Si el crédito activo ya tiene abonos previos (montoPrestado > saldoPendiente) que liberaron cupo
    const abonoPrevio = Math.max(
      0,
      montoPrestado - saldoPendiente - totalRecordedPaid
    );
    if (isLoanAssigned && abonoPrevio > 0) {
      const { dateText, timeText, timestamp } = parseDateTime(
        user.lastPaymentDate || user.creditAssignedDate,
        '04:20 p. m.'
      );
      items.push({
        id: 'pay-abono-previo',
        type: 'Pago',
        description: 'Pago aplicado a obligación vigente',
        dateText,
        timeText,
        amount: abonoPrevio,
        increasesCupo: true,
        timestamp: timestamp + 1000
      });
    }

    // 3. Retiro / Desembolso del crédito actual
    if (isLoanAssigned && montoPrestado > 0) {
      const { dateText, timeText, timestamp } = parseDateTime(
        user.disbursementRequest?.signedAt || user.creditAssignedDate,
        '09:45 a. m.'
      );
      items.push({
        id: `retiro-actual-${user.creditTramiteId}`,
        type: 'Retiro',
        description: `Retiro de crédito (${user.creditTramiteId})`,
        dateText,
        timeText,
        amount: montoPrestado,
        increasesCupo: false,
        timestamp
      });
    }

    // 4. Movimientos de créditos anteriores (Retiro al inicio y Pago al cierre que aumentó el cupo)
    previousLoans.forEach((prev, idx) => {
      if (prev.closedDate) {
        const closeInfo = parseDateTime(prev.closedDate, '03:40 p. m.');
        items.push({
          id: `prev-pago-${prev.id || idx}`,
          type: 'Pago',
          description: `Pago total crédito (${prev.tramiteId})`,
          dateText: closeInfo.dateText,
          timeText: closeInfo.timeText,
          amount: prev.totalPaid || prev.amountGranted,
          increasesCupo: true,
          timestamp: closeInfo.timestamp
        });
      }
      if (prev.startDate) {
        const startInfo = parseDateTime(prev.startDate, '11:10 a. m.');
        items.push({
          id: `prev-retiro-${prev.id || idx}`,
          type: 'Retiro',
          description: `Retiro desembolsado (${prev.tramiteId})`,
          dateText: startInfo.dateText,
          timeText: startInfo.timeText,
          amount: prev.amountGranted,
          increasesCupo: false,
          timestamp: startInfo.timestamp
        });
      }
    });

    return items.sort((a, b) => b.timestamp - a.timestamp);
  }, [
    user.paymentRecords,
    user.lastPaymentDate,
    user.creditAssignedDate,
    user.disbursementRequest,
    user.creditTramiteId,
    isLoanAssigned,
    montoPrestado,
    saldoPendiente,
    previousLoans
  ]);

  // Filtrado por buscador y agrupación por fecha para el panel de Actividad
  const groupedActivityByDate = useMemo(() => {
    const query = activitySearchQuery.trim().toLowerCase();
    const numericQuery = query.replace(/\D/g, '');

    const filtered = activityMovements.filter(mov => {
      if (activityFilterType === 'PAGO' && mov.type !== 'Pago') return false;
      if (activityFilterType === 'RETIRO' && mov.type !== 'Retiro') return false;

      if (!query) return true;

      const formattedAmt = formatCommaNumber(mov.amount).toLowerCase();
      const rawAmt = String(Math.round(mov.amount));
      const signText = mov.increasesCupo ? '+' : '-';

      return (
        mov.type.toLowerCase().includes(query) ||
        mov.description.toLowerCase().includes(query) ||
        mov.dateText.toLowerCase().includes(query) ||
        mov.timeText.toLowerCase().includes(query) ||
        formattedAmt.includes(query) ||
        (numericQuery.length > 0 && rawAmt.includes(numericQuery)) ||
        signText === query
      );
    });

    const groups: Array<{
      dateText: string;
      items: typeof filtered;
    }> = [];

    filtered.forEach(mov => {
      const existingGroup = groups.find(g => g.dateText === mov.dateText);
      if (existingGroup) {
        existingGroup.items.push(mov);
      } else {
        groups.push({
          dateText: mov.dateText,
          items: [mov]
        });
      }
    });

    return groups;
  }, [activityMovements, activitySearchQuery, activityFilterType]);

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



      {/* Main Content: Se expande a toda la pantalla cuando el cliente terminó su crédito y solicita otro */}
      <main
        className={`flex-1 w-full mx-auto pb-28 ${
          isPaidOff && activeBottomSection === 'INICIO'
            ? 'max-w-6xl px-4 sm:px-8 py-6 flex flex-col justify-between'
            : 'max-w-3xl px-4 sm:px-6 py-6 sm:py-10 space-y-8'
        }`}
      >
        {activeBottomSection === 'PERFIL' ? (
          /* =========================================================================
             PANEL DE DATOS PERSONALES DEL CLIENTE
             ========================================================================= */
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-extrabold text-black tracking-tight">
                Datos personales
              </h2>
            </div>

            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-gray-100 divide-y divide-gray-100">
              <div className="py-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-semibold text-gray-500">
                  Nombre completo
                </span>
                <span className="text-sm sm:text-base font-bold text-gray-900">
                  {user.fullName}
                </span>
              </div>

              <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-semibold text-gray-500">
                  Cédula de ciudadanía
                </span>
                <span className="text-sm sm:text-base font-bold text-gray-900 font-mono">
                  {user.cedula}
                </span>
              </div>

              <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-semibold text-gray-500">
                  Correo electrónico
                </span>
                <span className="text-sm sm:text-base font-bold text-gray-900 break-all">
                  {user.email}
                </span>
              </div>

              <div className="py-3 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-semibold text-gray-500">
                  Teléfono celular
                </span>
                <span className="text-sm sm:text-base font-bold text-gray-900 font-mono">
                  {user.phone || 'No registrado'}
                </span>
              </div>
            </div>

            {/* Rectángulo con bordes redondeados de lado a lado para Cerrar sesión */}
            <button
              type="button"
              onClick={onLogout}
              className="w-full py-3.5 px-4 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-200 active:scale-[0.99] text-gray-800 text-sm font-bold rounded-2xl border border-gray-200 shadow-xs transition cursor-pointer text-center flex items-center justify-center gap-2 group"
            >
              <LogOut className="w-4 h-4 text-red-500 group-hover:text-red-600 transition" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        ) : activeBottomSection === 'ACTIVIDAD' ? (
          /* =========================================================================
             PANEL DE ACTIVIDAD: SEPARADOS POR FECHA, CON BUSCADOR Y (+ / -) SEGÚN CUPO
             ========================================================================= */
          <div className="space-y-5 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-extrabold text-black tracking-tight">
                Actividad
              </h2>
              <span className="text-xs font-semibold text-gray-500">
                Pagos (+), retiros (-) y movimientos
              </span>
            </div>

            {/* Buscador y filtros rápidos */}
            <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-xs border border-gray-100 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={activitySearchQuery}
                  onChange={e => setActivitySearchQuery(e.target.value)}
                  placeholder="Buscar por fecha, pago, retiro, monto o referencia..."
                  className="w-full pl-10 pr-8 py-2.5 rounded-xl border border-gray-200 bg-gray-50/70 focus:bg-white text-xs sm:text-sm text-gray-900 font-medium focus:border-purple-600 focus:outline-none"
                />
                {activitySearchQuery && (
                  <button
                    type="button"
                    onClick={() => setActivitySearchQuery('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActivityFilterType('TODOS')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                    activityFilterType === 'TODOS'
                      ? 'bg-purple-700 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setActivityFilterType('PAGO')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                    activityFilterType === 'PAGO'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  Aumenta cupo (+)
                </button>
                <button
                  type="button"
                  onClick={() => setActivityFilterType('RETIRO')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                    activityFilterType === 'RETIRO'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                  }`}
                >
                  Resta cupo (-)
                </button>
              </div>
            </div>

            {groupedActivityByDate.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 shadow-xs border border-gray-100 text-center text-xs sm:text-sm text-gray-500">
                {activitySearchQuery.trim() || activityFilterType !== 'TODOS'
                  ? 'No se encontraron movimientos que coincidan con tu búsqueda.'
                  : 'Aún no registras movimientos de pagos o retiros.'}
              </div>
            ) : (
              <div className="flex flex-col space-y-5">
                {groupedActivityByDate.map(group => (
                  <div key={group.dateText} className="space-y-2.5">
                    {/* Separador por fecha */}
                    <div className="flex items-center gap-2 px-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      <span className="text-xs sm:text-sm font-extrabold text-gray-700 capitalize">
                        {group.dateText}
                      </span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>

                    {/* Movimientos de esa fecha */}
                    <div className="flex flex-col space-y-2.5">
                      {group.items.map(mov => (
                        <div
                          key={mov.id}
                          className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-gray-100 flex items-center justify-between gap-4"
                        >
                          <div className="flex flex-col space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                                  mov.type === 'Pago'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {mov.type}
                              </span>
                              <span className="text-xs sm:text-sm font-bold text-gray-900 truncate">
                                {mov.description}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-500">
                              <span>{mov.dateText}</span>
                              <span>•</span>
                              <span>{mov.timeText}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {mov.increasesCupo ? (
                              <span className="text-sm sm:text-base font-extrabold text-emerald-600 font-mono">
                                + {formatCommaNumber(mov.amount)}
                              </span>
                            ) : (
                              <span className="text-sm sm:text-base font-extrabold text-rose-600 font-mono">
                                - {formatCommaNumber(mov.amount)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : !isLoanAssigned ? (
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
        ) : isPaidOff && !paymentModalType ? (
          <LoanRequestFlow
            user={user}
            loanSettings={loanSettings}
            maxCreditLimit={cupoMaximoCliente}
            isWaitingDisbursement={false}
            onUserUpdated={setUser}
          />
        ) : (
          <>
            {/* =========================================================================
                CASO C: CRÉDITO EN PROCESO DE DESEMBOLSO O CRÉDITO ACTIVO CON SALDO
                1. TARJETA BLANCA DE ESTADO DE PAGO CON SOMBRA SUAVE
               ========================================================================= */}
            <div className="bg-white rounded-xl p-5 sm:p-6 shadow-sm border border-gray-100 flex flex-col items-start text-left space-y-2.5 animate-fadeIn">
              {/* Esquina izquierda: "Estado de pago" en color negro */}
              <span className="text-sm sm:text-base font-bold text-black">
                Estado de pago
              </span>

              {/* Debajo: texto de instancia encerrado en un rectángulo con bordes redondos */}
              <span
                className={`inline-flex items-center px-3 py-1 rounded-lg text-xs sm:text-sm font-semibold ${paymentStatusInstance.badgeClass}`}
              >
                {paymentStatusInstance.label}
              </span>

              {/* Más abajo: de color morado el valor de la cuota (solo el valor, ej. "$254,826.95") */}
              <div className="text-2xl sm:text-3xl font-extrabold text-purple-700 tracking-tight pt-1">
                {formatInstallmentValue(valorCuotaCard)}
              </div>

              {/* Debajo: en color gris y más pequeño "Pagar antes de (fecha y hora en gris un poquito más marcado)" */}
              <p className="text-xs sm:text-sm text-gray-500">
                Pagar antes de{' '}
                <span className="text-gray-700 font-semibold">
                  {installmentDeadlineText}
                </span>
              </p>
            </div>

            {/* =========================================================================
                2. DOS CUADRADOS CON BORDES REDONDOS DEBAJO: "PAGAR" Y "RETIRAR"
               ========================================================================= */}
            {!isDisbursementInProcess && (
              <div className="flex items-center justify-center gap-6 pt-1 animate-fadeIn">
                {/* Primer cuadrado: signo de pesos encerrado en dos flechas circulares + "Pagar" */}
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    type="button"
                    disabled={saldoPendiente <= 0}
                    onClick={() => {
                      setPaymentModalType(null);
                      setPaymentOutcomeStatus(null);
                      setEfipayError(null);
                      setIsCustomAmountExpanded(false);
                      setIsPaySelectionWindowOpen(true);
                    }}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white border border-gray-200 shadow-xs hover:bg-purple-50 hover:border-purple-300 active:scale-95 disabled:opacity-50 transition flex items-center justify-center text-purple-800 cursor-pointer disabled:cursor-not-allowed"
                    aria-label="Pagar"
                  >
                    <svg
                      className="w-7 h-7 sm:w-8 sm:h-8 text-purple-800"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                      <path d="M21 3v5h-5" />
                      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                      <path d="M3 21v-5h5" />
                      <path d="M12 7.5v9" />
                      <path d="M14.2 9.5c0-1.1-1-1.8-2.2-1.8s-2.2.7-2.2 1.8c0 2.2 4.4 1.4 4.4 3.6 0 1.1-1 1.8-2.2 1.8s-2.2-.7-2.2-1.8" />
                    </svg>
                  </button>
                  <span className="text-xs sm:text-sm font-semibold text-gray-900">
                    Pagar
                  </span>
                </div>

                {/* Segundo cuadrado: flecha hacia arriba + "Retirar" (sin función alguna) */}
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    type="button"
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white border border-gray-200 shadow-xs flex items-center justify-center text-purple-800 cursor-default"
                    aria-label="Retirar"
                  >
                    <svg
                      className="w-7 h-7 sm:w-8 sm:h-8 text-purple-800"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 19V5" />
                      <path d="m5 12 7-7 7 7" />
                    </svg>
                  </button>
                  <span className="text-xs sm:text-sm font-semibold text-gray-900">
                    Retirar
                  </span>
                </div>
              </div>
            )}

            {/* =========================================================================
                3. RECTÁNGULO DEBAJO DE PAGAR / RETIRAR: "DISPONIBLE" Y "LÍMITE"
               ========================================================================= */}
            <div className="bg-white rounded-xl p-5 sm:p-6 shadow-sm border border-gray-100 flex flex-col items-start text-left space-y-2 animate-fadeIn">
              {/* Del lado izquierdo: "Disponible" en color negro */}
              <span className="text-sm sm:text-base font-bold text-black">
                Disponible
              </span>

              {/* Debajo: el valor disponible, lo que aún puede sacar del cupo (ej. "$534,837.54") */}
              <div className="text-2xl sm:text-3xl font-extrabold text-purple-700 tracking-tight pt-0.5">
                {formatInstallmentValue(cupoDisponibleParaSacar)}
              </div>

              {/* Debajo de lo que dispone: "Límite" y enseguida el cupo en general en números (ej. "$836,738.84") */}
              <p className="text-xs sm:text-sm text-gray-500">
                Límite{' '}
                <span className="text-gray-700 font-semibold">
                  {formatInstallmentValue(limiteCupoGeneral)}
                </span>
              </p>
            </div>

            {/* =========================================================================
                3.5. RECTÁNGULO PARA POSTERS PUBLICITARIOS (SOLO APARECE SI HAY IMAGEN)
               ========================================================================= */}
            {Boolean(loanSettings.adPosterUrl && loanSettings.adPosterUrl.trim()) && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden w-full h-40 sm:h-48 animate-fadeIn">
                <img
                  src={loanSettings.adPosterUrl}
                  alt=""
                  className="w-full h-full object-cover block"
                />
              </div>
            )}

            {/* =========================================================================
                3.8. DETALLE FINANCIERO FIJO DEL CRÉDITO ACTIVO (8 CONCEPTOS OBLIGATORIOS)
               ========================================================================= */}
            {!isDisbursementInProcess && saldoPendiente > 0 && (
              <div className="bg-white rounded-xl p-5 sm:p-6 shadow-sm border border-gray-100 space-y-3.5 animate-fadeIn">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-black">
                      Detalle de tu crédito activo ({user.creditTramiteId})
                    </h3>
                    <p className="text-[11px] sm:text-xs text-gray-500">
                      Condiciones fijas del crédito vigente (no editables ni modificables mientras esté activo)
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                    <Lock className="w-3 h-3 text-purple-700" />
                    <span>Crédito Fijado</span>
                  </span>
                </div>

                <div className="divide-y divide-gray-100 text-xs sm:text-sm">
                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-gray-500 font-medium">
                      Monto principal (crédito desembolsado)
                    </span>
                    <span className="font-mono font-bold text-gray-900">
                      {formatInstallmentValue(activeLoanBreakdown.principalAmount)}
                    </span>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-gray-500 font-medium">
                      Interés (intereses de ganancia de la empresa)
                    </span>
                    <span className="font-mono font-semibold text-gray-800">
                      {formatInstallmentValue(activeLoanBreakdown.interestAmount)}
                    </span>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-gray-500 font-medium">
                      Fianza ({activeLoanBreakdown.fianzaPercentage}%)
                    </span>
                    <span className="font-mono font-semibold text-gray-800">
                      {formatInstallmentValue(activeLoanBreakdown.fianzaAmount)}
                    </span>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-gray-500 font-medium">
                      Firma electrónica ({activeLoanBreakdown.electronicSignatureCode})
                    </span>
                    <span className="font-mono font-semibold text-gray-800">
                      {formatInstallmentValue(activeLoanBreakdown.electronicSignatureFee)}
                    </span>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-gray-500 font-medium">
                      Gastos de cobranza
                    </span>
                    <span className="font-mono font-semibold text-gray-800">
                      {formatInstallmentValue(activeLoanBreakdown.collectionExpenses)}
                    </span>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-gray-500 font-medium">
                      IVA ({activeLoanBreakdown.ivaPercentage}%)
                    </span>
                    <span className="font-mono font-semibold text-gray-800">
                      {formatInstallmentValue(activeLoanBreakdown.ivaAmount)}
                    </span>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-gray-500 font-medium">
                      Fecha límite de pago
                    </span>
                    <span className="font-semibold text-gray-900">
                      {installmentDeadlineText}
                    </span>
                  </div>

                  <div className="pt-2.5 flex items-center justify-between gap-2">
                    <span className="text-black font-bold">
                      Pago total fijado
                    </span>
                    <strong className="font-mono font-extrabold text-purple-700 text-sm sm:text-base">
                      {formatInstallmentValue(activeLoanBreakdown.totalPaymentAmount)}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {isDisbursementInProcess ? (
              <LoanRequestFlow
                user={user}
                loanSettings={loanSettings}
                maxCreditLimit={cupoMaximoCliente}
                isWaitingDisbursement={true}
                onUserUpdated={setUser}
              />
            ) : (
              <>
                {/* =========================================================================
                    VENTANA EN TODA LA PANTALLA AL DAR CLIC EN "PAGAR": "¿Cuánto deseas pagar?"
                   ========================================================================= */}
                {isPaySelectionWindowOpen && !paymentModalType && (
                  <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen min-h-dvh z-[9990] bg-[#fcfaff] overflow-y-auto flex flex-col animate-fadeIn">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPaySelectionWindowOpen(false);
                        setIsCustomAmountExpanded(false);
                      }}
                      aria-label="Cerrar"
                      className="absolute top-4 right-4 z-50 p-2 text-gray-600 hover:text-black rounded-full cursor-pointer transition"
                    >
                      <X className="w-5 h-5" />
                    </button>

                    <div className="w-full max-w-xl mx-auto px-5 sm:px-8 pt-12 pb-28 flex flex-col space-y-6">
                      <div className="space-y-1.5 text-left">
                        <h2 className="text-xl sm:text-2xl font-extrabold text-black tracking-tight">
                          ¿Cuánto deseas pagar?
                        </h2>
                        <p className="text-xs sm:text-sm">
                          <span className="text-emerald-600 font-semibold">
                            Pagar antes de{' '}
                          </span>
                          <span className="text-gray-500">
                            {installmentDeadlineText}
                          </span>
                        </p>
                      </div>

                      {/* 3 Rectángulos con bordes redondos uno encima de otro */}
                      <div className="flex flex-col space-y-3">
                        {/* 1. Pago mínimo */}
                        <button
                          type="button"
                          disabled={isProcessingPayment}
                          onClick={() => handleOpenPaymentPanel('CUOTA')}
                          className="w-full bg-white hover:bg-purple-50/50 border border-gray-200 rounded-2xl px-5 py-4 shadow-2xs flex items-center justify-between text-left transition cursor-pointer disabled:opacity-60"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm sm:text-base font-bold text-gray-900">
                              Pago mínimo
                            </span>
                            <span className="text-[11px] font-semibold text-purple-700">
                              Pagar el valor ({formatDotCurrency(valorCuotaCard)})
                            </span>
                          </div>
                          <span className="text-sm sm:text-base font-extrabold text-gray-900">
                            {formatDotCurrency(valorCuotaCard)}
                          </span>
                        </button>

                        {/* 2. Saldo restante */}
                        <button
                          type="button"
                          disabled={isProcessingPayment}
                          onClick={() =>
                            handleOpenPaymentPanel('CREDITO_COMPLETO')
                          }
                          className="w-full bg-white hover:bg-purple-50/50 border border-gray-200 rounded-2xl px-5 py-4 shadow-2xs flex items-center justify-between text-left transition cursor-pointer disabled:opacity-60"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm sm:text-base font-bold text-gray-900">
                              Saldo restante
                            </span>
                            <span className="text-[11px] font-semibold text-purple-700">
                              Pagar el valor ({formatDotCurrency(saldoPendiente)})
                            </span>
                          </div>
                          <span className="text-sm sm:text-base font-extrabold text-gray-900">
                            {formatDotCurrency(saldoPendiente)}
                          </span>
                        </button>

                        {/* 3. Otro monto (desplegable para ingresar el monto a pagar) */}
                        <div className="w-full bg-white border border-gray-200 rounded-2xl shadow-2xs overflow-hidden transition-all">
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomAmountExpanded(prev => !prev);
                              if (!customPaymentAmount || customPaymentAmount <= 0) {
                                setCustomPaymentAmount(
                                  valorCuota > 0 ? valorCuota : saldoPendiente
                                );
                              }
                            }}
                            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-purple-50/50 transition cursor-pointer"
                          >
                            <span className="text-sm sm:text-base font-bold text-gray-900">
                              Otro monto
                            </span>
                            <span className="text-xs text-gray-400 font-semibold">
                              {isCustomAmountExpanded ? 'Ocultar' : 'Ingresar valor'}
                            </span>
                          </button>

                          {isCustomAmountExpanded && (
                            <div className="px-5 pb-5 pt-1 border-t border-gray-100 flex flex-col space-y-3 animate-fadeIn">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                <div className="relative flex-1">
                                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">
                                    $
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={
                                      customPaymentAmount && customPaymentAmount > 0
                                        ? new Intl.NumberFormat('es-CO', {
                                            maximumFractionDigits: 0
                                          }).format(customPaymentAmount)
                                        : ''
                                    }
                                    onChange={e => {
                                      const raw = e.target.value.replace(/\D/g, '');
                                      const val = raw ? Number(raw) : 0;
                                      setCustomPaymentAmount(
                                        saldoPendiente > 0
                                          ? Math.min(saldoPendiente, Math.max(0, val))
                                          : val
                                      );
                                    }}
                                    placeholder="0"
                                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-gray-300 text-gray-900 font-bold text-sm focus:border-purple-600 focus:outline-none"
                                    autoFocus
                                  />
                                </div>
                                <button
                                  type="button"
                                  disabled={
                                    isProcessingPayment ||
                                    !customPaymentAmount ||
                                    customPaymentAmount <= 0
                                  }
                                  onClick={() => handleOpenPaymentPanel('CUOTA_PERSONALIZADA')}
                                  className="px-5 py-2.5 bg-purple-700 hover:bg-purple-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs sm:text-sm rounded-xl transition cursor-pointer disabled:cursor-not-allowed shrink-0"
                                >
                                  {customPaymentAmount > 0
                                    ? `Pagar (${formatDotCurrency(customPaymentAmount)})`
                                    : 'Pagar'}
                                </button>
                              </div>
                              {saldoPendiente > 0 && (
                                <p className="text-[11px] text-gray-500">
                                  Saldo máximo a pagar: <strong>{formatDotCurrency(saldoPendiente)}</strong>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* =========================================================================
                    PANEL A PANTALLA COMPLETA DE PAGO CONECTADO A LA PASARELA
                   ========================================================================= */}
                {paymentModalType && (
                  <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen min-h-dvh z-[9990] bg-[#fcfaff] overflow-y-auto flex flex-col animate-fadeIn">
                    {/* Botón flotante accesible para cerrar y volver */}
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentModalType(null);
                        setIsPaySelectionWindowOpen(false);
                        setEfipayReceipt(null);
                        setLastCompletedReceipt(null);
                        setPaymentOutcomeStatus(null);
                        setEfipayError(null);
                      }}
                      aria-label="Cerrar y volver"
                      className="absolute top-4 right-4 z-50 p-2 text-purple-700 hover:text-purple-950 hover:bg-purple-100 rounded-full cursor-pointer transition shadow-2xs border border-purple-200 bg-white"
                      title="Volver"
                    >
                      <X className="w-5 h-5" />
                    </button>

                    {/* Contenedor Central Tipo Encuesta a Pantalla Completa */}
                    <div className="w-full flex-1 px-4 sm:px-8 lg:px-12 pt-6 sm:pt-8 pb-28 flex flex-col space-y-6">
                      {paymentOutcomeStatus === 'PAGO_PROCESADO' &&
                      efipayReceipt ? (
                        <div className="w-full max-w-md mx-auto bg-white border border-gray-300 shadow-md p-6 sm:p-8 text-gray-900 font-mono flex flex-col justify-between space-y-5 animate-fadeIn">
                          {/* Cabecera del Ticket con el Logo Oficial */}
                          <div className="flex flex-col items-center text-center space-y-2 border-b border-dashed border-gray-400 pb-4">
                            <img
                              src={`${import.meta.env.BASE_URL}assets/aistudio/52878_14fa00e9.png`}
                              alt="Logo"
                              className="h-8 sm:h-9 w-auto object-contain mx-auto select-none"
                            />
                            <div className="pt-1">
                              <h4 className="text-sm sm:text-base font-extrabold tracking-widest uppercase text-black">
                                TICKET DE PAGO
                              </h4>
                              <p className="text-[11px] sm:text-xs text-gray-600 mt-0.5">
                                {new Date(efipayReceipt.settledAt).toLocaleString('es-CO')}
                              </p>
                            </div>
                          </div>

                          {/* Datos de la Transacción e IP */}
                          <div className="space-y-2 text-xs sm:text-sm border-b border-dashed border-gray-400 pb-4">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-gray-600">Código transacción:</span>
                              <strong className="font-bold text-black text-right">
                                {efipayReceipt.transactionId}
                              </strong>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-gray-600">Autorización:</span>
                              <span className="font-semibold text-gray-900 text-right">
                                {efipayReceipt.authorizationCode}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-gray-600">Dirección IP:</span>
                              <span className="font-semibold text-gray-900 text-right">
                                {clientIp}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-gray-600">Cliente:</span>
                              <span className="font-semibold text-gray-900 text-right truncate max-w-[60%]">
                                {payerFullName}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-gray-600">Cédula:</span>
                              <span className="font-semibold text-gray-900 text-right">
                                {payerCedula}
                              </span>
                            </div>
                          </div>

                          {/* Detalle de Pago, Saldo Faltante y Cupo Restante */}
                          <div className="space-y-2.5 text-xs sm:text-sm border-b border-dashed border-gray-400 pb-4">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-bold text-black">Cuánto pagó:</span>
                              <strong className="text-base sm:text-lg font-extrabold text-black text-right">
                                {formatInstallmentValue(efipayReceipt.amount)}
                              </strong>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-gray-700 font-semibold">Cuánto le falta:</span>
                              <strong className="font-bold text-gray-900 text-right">
                                {formatInstallmentValue(saldoPendiente)}
                              </strong>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-gray-700 font-semibold">Cupo que le quedó:</span>
                              <strong className="font-bold text-gray-900 text-right">
                                {formatInstallmentValue(cupoDisponibleParaSacar)}
                              </strong>
                            </div>
                            <div className="flex items-baseline justify-between gap-2 text-[11px] sm:text-xs">
                              <span className="text-gray-500">Límite del cupo:</span>
                              <span className="text-gray-700 font-semibold text-right">
                                {formatInstallmentValue(limiteCupoGeneral)}
                              </span>
                            </div>
                          </div>

                          {/* Pie del Ticket */}
                          <div className="text-center space-y-1">
                            <p className="text-xs font-extrabold text-black tracking-wider uppercase">
                              ESTADO: CUOTA PAGADA
                            </p>
                            <p className="text-[11px] text-gray-500">
                              Ref. {efipayReceipt.referenceCode}
                            </p>
                          </div>

                          {/* Botones de Acción */}
                          <div className="pt-2 flex flex-col gap-2.5 font-sans">
                            <button
                              type="button"
                              onClick={() =>
                                handleDownloadReceiptPdf(efipayReceipt)
                              }
                              className="w-full py-3 bg-black hover:bg-gray-800 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition"
                            >
                              <Download className="w-4 h-4 shrink-0" />
                              <span>Descargar ticket</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setPaymentModalType(null);
                                setIsPaySelectionWindowOpen(false);
                                setEfipayReceipt(null);
                                setLastCompletedReceipt(null);
                                setPaymentOutcomeStatus(null);
                              }}
                              className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 text-xs sm:text-sm font-bold rounded-xl cursor-pointer transition"
                            >
                              Cerrar y volver al inicio
                            </button>
                          </div>
                        </div>
                      ) : paymentOutcomeStatus === 'PAGO_CANCELADO' ? (
                        <div className="w-full flex-1 bg-white border-2 border-rose-500 rounded-2xl p-5 sm:p-8 lg:p-10 shadow-sm flex flex-col justify-between space-y-5 animate-fadeIn">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rose-200 pb-4">
                            <div className="flex items-start sm:items-center gap-3.5">
                              <div className="w-12 h-12 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                                <XCircle className="w-7 h-7" />
                              </div>
                              <div>
                                <span className="inline-block text-[11px] font-mono font-extrabold uppercase tracking-wider bg-rose-100 text-rose-900 px-2.5 py-0.5 rounded border border-rose-300">
                                  Comprobante de Cancelación
                                </span>
                                <h4 className="text-xl sm:text-2xl font-extrabold text-rose-950 tracking-tight mt-1">
                                  PAGO CANCELADO
                                </h4>
                                <p className="text-xs sm:text-sm text-rose-800 font-medium">
                                  El pago no fue procesado o fue cancelado. No
                                  se realizó ningún cargo a tu cuenta.
                                </p>
                              </div>
                            </div>

                            <div className="bg-rose-50 border border-rose-300 px-4 py-2 rounded-xl">
                              <span className="text-[10px] font-bold uppercase text-rose-800 block">
                                Referencia Registrada
                              </span>
                              <strong className="font-mono text-sm font-extrabold text-rose-950">
                                {cancelledPaymentRef || paymentReference}
                              </strong>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (paymentModalType) {
                                  handleOpenPaymentPanel(paymentModalType);
                                }
                              }}
                              className="w-full sm:w-auto px-5 py-3 bg-purple-700 hover:bg-purple-800 text-white text-xs font-extrabold rounded-xl cursor-pointer transition"
                            >
                              Volver a Intentar el Pago
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPaymentModalType(null);
                                setIsPaySelectionWindowOpen(false);
                                setEfipayReceipt(null);
                                setLastCompletedReceipt(null);
                                setPaymentOutcomeStatus(null);
                              }}
                              className="w-full sm:w-auto px-5 py-3 bg-white hover:bg-rose-50 text-rose-900 border border-rose-300 text-xs font-bold rounded-xl cursor-pointer transition"
                            >
                              Cerrar y Volver al Panel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full flex-1 bg-white border border-purple-200 rounded-2xl p-6 sm:p-10 shadow-xs flex flex-col items-center justify-center text-center space-y-5 animate-fadeIn">
                          <div className="w-12 h-12 rounded-full border-3 border-purple-200 border-t-purple-700 animate-spin" />
                          <div className="space-y-1.5 max-w-md">
                            <h4 className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight">
                              Conectando y procesando tu pago...
                            </h4>
                            <p className="text-xs sm:text-sm text-gray-500">
                              Monto a pagar:{' '}
                              <strong className="text-purple-800 font-bold">
                                {formatDotCurrency(
                                  paymentModalType === 'CREDITO_COMPLETO'
                                    ? saldoPendiente
                                    : paymentModalType === 'CUOTA_PERSONALIZADA'
                                    ? customPaymentAmount
                                    : valorCuotaCard
                                )}
                              </strong>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* =========================================================================
            4. REGISTRO DE CRÉDITOS ANTERIORES
           ========================================================================= */}
        {activeBottomSection === 'INICIO' &&
          !isPaidOff &&
          previousLoans.length > 0 && (
            <div className="pt-2 space-y-3 animate-fadeIn">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Registro de créditos anteriores
                </h2>
              </div>

              <div className="divide-y divide-gray-100 border-b border-gray-100">
                {previousLoans.map(prev => {
                  const isExpanded = expandedPreviousLoanId === prev.id;
                  return (
                    <div key={prev.id} className="py-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPreviousLoanId(curr =>
                            curr === prev.id ? null : prev.id
                          )
                        }
                        className="w-full py-1 flex items-center justify-between text-left hover:opacity-75 transition cursor-pointer"
                      >
                        <span className="font-mono font-bold text-gray-700 text-xs sm:text-sm">
                          {hideBalance
                            ? '••••••••'
                            : formatInstallmentValue(prev.amountGranted)}
                        </span>
                        <span className="text-gray-400 p-0.5">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="pt-1.5 pb-1 space-y-1.5 text-[11px] sm:text-xs text-gray-600 animate-fadeIn">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-400 font-medium">
                              Monto principal (crédito desembolsado)
                            </span>
                            <span className="font-mono font-semibold text-gray-800">
                              {formatInstallmentValue(
                                prev.principalAmount || prev.amountGranted
                              )}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-400 font-medium">
                              Interés (ganancia de la empresa)
                            </span>
                            <span className="font-mono text-gray-700">
                              {formatInstallmentValue(prev.interestAmount || 0)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-400 font-medium">
                              Fianza
                            </span>
                            <span className="font-mono text-gray-700">
                              {formatInstallmentValue(prev.fianzaAmount || 0)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-400 font-medium">
                              Firma electrónica
                            </span>
                            <span className="font-mono text-gray-700">
                              {formatInstallmentValue(
                                prev.electronicSignatureFee || 0
                              )}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-400 font-medium">
                              Gastos de cobranza
                            </span>
                            <span className="font-mono text-gray-700">
                              {formatInstallmentValue(
                                prev.collectionExpenses || 0
                              )}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-400 font-medium">
                              IVA
                            </span>
                            <span className="font-mono text-gray-700">
                              {formatInstallmentValue(prev.ivaAmount || 0)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-400 font-medium">
                              Fecha límite de pago
                            </span>
                            <span className="font-mono text-gray-600">
                              {prev.paymentDeadline || prev.closedDate || prev.startDate}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500 font-bold">
                              Pago total
                            </span>
                            <strong className="font-mono font-bold text-purple-700">
                              {formatInstallmentValue(
                                prev.totalPaymentAmount ||
                                  prev.totalPaid ||
                                  prev.amountGranted
                              )}
                            </strong>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-400 font-medium">
                              Referencia
                            </span>
                            <span className="font-mono text-gray-600">
                              {prev.tramiteId}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-400 font-medium">
                              Estado
                            </span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                              {prev.finalStatus.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {/* =========================================================================
            RECTÁNGULO CON BORDES REDONDOS FIJO EN LA PARTE INFERIOR (SIEMPRE VISIBLE EN PC, TABLET Y TELÉFONO)
           ========================================================================= */}
        <div className="fixed bottom-3 sm:bottom-4 md:bottom-5 inset-x-0 mx-auto z-[10050] w-[calc(100%-1.5rem)] sm:w-[calc(100%-2rem)] max-w-xs sm:max-w-sm md:max-w-md bg-white border border-gray-200 shadow-lg rounded-2xl px-4 sm:px-6 md:px-8 py-2 sm:py-2.5 flex items-center justify-around">
          {/* 1. Icono con una casa y debajo "Inicio" */}
          <button
            type="button"
            onClick={() => {
              setActiveBottomSection('INICIO');
              setIsPaySelectionWindowOpen(false);
              setIsCustomAmountExpanded(false);
              setPaymentModalType(null);
              setEfipayReceipt(null);
              setLastCompletedReceipt(null);
              setPaymentOutcomeStatus(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex flex-col items-center justify-center gap-1 px-3 sm:px-4 py-1 rounded-xl transition cursor-pointer ${
              activeBottomSection === 'INICIO'
                ? 'text-purple-700 font-bold'
                : 'text-gray-500 hover:text-gray-900 font-medium'
            }`}
          >
            <Home className="w-5 h-5 sm:w-5 sm:h-5" />
            <span className="text-[11px] sm:text-xs leading-none">Inicio</span>
          </button>

          {/* 2. Icono de "Actividad" (pagos, retiros y movimientos) */}
          <button
            type="button"
            onClick={() => {
              setActiveBottomSection('ACTIVIDAD');
              setIsPaySelectionWindowOpen(false);
              setIsCustomAmountExpanded(false);
              setPaymentModalType(null);
              setEfipayReceipt(null);
              setLastCompletedReceipt(null);
              setPaymentOutcomeStatus(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex flex-col items-center justify-center gap-1 px-3 sm:px-4 py-1 rounded-xl transition cursor-pointer ${
              activeBottomSection === 'ACTIVIDAD'
                ? 'text-purple-700 font-bold'
                : 'text-gray-500 hover:text-gray-900 font-medium'
            }`}
          >
            <Activity className="w-5 h-5 sm:w-5 sm:h-5" />
            <span className="text-[11px] sm:text-xs leading-none">
              Actividad
            </span>
          </button>

          {/* 3. Icono de usuario (sin letras) para los datos personales del cliente */}
          <button
            type="button"
            aria-label="Datos personales del cliente"
            onClick={() => {
              setActiveBottomSection('PERFIL');
              setIsPaySelectionWindowOpen(false);
              setIsCustomAmountExpanded(false);
              setPaymentModalType(null);
              setEfipayReceipt(null);
              setLastCompletedReceipt(null);
              setPaymentOutcomeStatus(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`flex items-center justify-center p-2 rounded-xl transition cursor-pointer ${
              activeBottomSection === 'PERFIL'
                ? 'text-purple-700 font-bold'
                : 'text-gray-500 hover:text-gray-900 font-medium'
            }`}
          >
            <UserIcon className="w-5 h-5 sm:w-5 sm:h-5" />
          </button>
        </div>
      </main>
    </div>
  );
};
