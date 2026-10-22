import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  AuditBlock,
  WorkerPermission,
  CreditStatus,
  PaymentTimeStatus,
  LoanGeneralSettings,
  PreviousLoanRecord
} from '../types';
import { StorageService } from '../services/storageService';
import { fintechPanelsEngine, FintechPanelsEngine } from '../fintech-panels.js';
import {
  ShieldCheck,
  Users,
  History,
  Search,
  CheckCircle2,
  Clock,
  DollarSign,
  Check,
  AlertTriangle,
  LogOut,
  FileDown,
  Sliders,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Briefcase,
  Layers,
  UserPlus,
  Lock,
  Image as ImageIcon,
  Upload
} from 'lucide-react';
import { exportAuditTrailToProtectedPDF, PDF_EXPORT_PASSWORD } from '../services/pdfExportService';

interface AdminPanelProps {
  currentUser: User;
  onLogout: () => void;
  onOpenPrivacyModal: () => void;
}

type LeftActionKey =
  | 'ALL_PORTFOLIO'
  | 'APPROVE_PENDING'
  | 'APPROVE_DISBURSEMENT'
  | 'OVERDUE_COLLECTION'
  | 'QUICK_PAYMENT'
  | 'NEW_RECORD'
  | 'LOAN_POLICIES'
  | 'AD_POSTERS'
  | 'WORKERS_TEAM'
  | 'AUDIT_LEDGER';

interface ActiveCellEdit {
  userId: string;
  field:
    | 'fullName'
    | 'cedula'
    | 'creditTramiteId'
    | 'phone'
    | 'email'
    | 'creditLimit'
    | 'availableBalance'
    | 'customInstallmentAmount'
    | 'loanTermMonths'
    | 'nextPaymentDate'
    | 'interestRateApplied'
    | 'taxPercentageApplied'
    | 'creditStatus'
    | 'paymentStatus'
    | 'daysOverdue'
    | 'assignedOperator';
  value: string;
}

const ALL_WORKER_PERMISSIONS: {
  key: WorkerPermission;
  label: string;
  actionKey?: LeftActionKey;
}[] = [
  { key: 'VER_CARTERA', label: 'Estadísticas', actionKey: 'ALL_PORTFOLIO' },
  { key: 'EDITAR_CLIENTES', label: 'Desembolsos', actionKey: 'APPROVE_DISBURSEMENT' },
  { key: 'APROBAR_CREDITOS', label: 'Aprobar Cupo', actionKey: 'APPROVE_PENDING' },
  { key: 'RECHAZAR_CREDITOS', label: 'Rechazar', actionKey: 'APPROVE_PENDING' },
  { key: 'GESTIONAR_MORA', label: 'Mora', actionKey: 'OVERDUE_COLLECTION' },
  { key: 'REGISTRAR_PAGOS', label: 'Abonos', actionKey: 'QUICK_PAYMENT' },
  { key: 'CREAR_USUARIOS', label: 'Crear', actionKey: 'NEW_RECORD' },
  { key: 'CONFIGURAR_SISTEMA', label: 'Tasas', actionKey: 'LOAN_POLICIES' },
  { key: 'VER_AUDITORIA', label: 'Auditoría', actionKey: 'AUDIT_LEDGER' }
];

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  onLogout
}) => {
  // Datos principales sincronizados
  const [users, setUsers] = useState<User[]>([]);
  const [auditChain, setAuditChain] = useState<AuditBlock[]>([]);
  const [isChainValid, setIsChainValid] = useState<boolean>(true);
  const [regulatoryLogs, setRegulatoryLogs] = useState<any[]>([]);
  const [isRegulatoryCompliant, setIsRegulatoryCompliant] = useState<boolean>(true);
  const [loanSettings, setLoanSettings] = useState<LoanGeneralSettings>(
    StorageService.getLoanSettings()
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Usuario actual en vivo (para reflejar permisos de trabajador en tiempo real)
  const liveCurrentUser = useMemo(() => {
    return users.find(u => u.id === currentUser.id) || currentUser;
  }, [users, currentUser]);

  const isAdmin = liveCurrentUser.role === 'ADMIN';
  const isWorker = liveCurrentUser.role === 'WORKER';

  // Helper de verificación de permiso: Admin tiene acceso total a todo; Trabajador solo si se le dio acceso
  const hasAccess = (perm: WorkerPermission): boolean => {
    if (isAdmin) return true;
    if (!isWorker || liveCurrentUser.isActive === false) return false;
    const perms = liveCurrentUser.workerPermissions || [];
    return perms.includes(perm);
  };

  // Aviso breve en barra superior
  const [statusBanner, setStatusBanner] = useState<{
    type: 'emerald' | 'amber' | 'coral' | 'cyan' | 'teal';
    text: string;
  } | null>(null);

  // Filtros de la Matriz
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'AL_DIA' | 'EN_MORA' | 'EN_DESEMBOLSO' | 'PENDIENTE' | 'RECHAZADO'
  >('ALL');

  // Edición Directa en Celda (Click-to-Edit)
  const [activeCell, setActiveCell] = useState<ActiveCellEdit | null>(null);
  const [flashedCells, setFlashedCells] = useState<Record<string, boolean>>({});

  // Gestor asignado por cliente
  const [assignedOperators, setAssignedOperators] = useState<Record<string, string>>({});

  // Filas Expandibles en Acordeón Integrado
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});

  // Controles rápidos por usuario (Cliente o Trabajador)
  const [inlinePaymentAmounts, setInlinePaymentAmounts] = useState<Record<string, string>>({});
  const [inlineNewPassword, setInlineNewPassword] = useState<Record<string, string>>({});
  const [inlineApproveCupo, setInlineApproveCupo] = useState<Record<string, string>>({});
  const [inlineDisbursementPrincipal, setInlineDisbursementPrincipal] = useState<Record<string, string>>({});
  const [quickPaySelectedUserId, setQuickPaySelectedUserId] = useState<string>('');
  const [quickPayAmount, setQuickPayAmount] = useState<string>('');

  // Barra de Edición Masiva (Batch Action Bar)
  const [selectedRowIds, setSelectedRowIds] = useState<Record<string, boolean>>({});
  const [batchPaymentStatus, setBatchPaymentStatus] = useState<PaymentTimeStatus>('AL_DIA');
  const [batchCreditStatus, setBatchCreditStatus] = useState<CreditStatus>('ASIGNADO');
  const [batchCreditLimit, setBatchCreditLimit] = useState<string>('');

  // Formulario de Nuevo Registro y Desglose de Crédito Fijo
  const [newRecordRole, setNewRecordRole] = useState<'CLIENT' | 'WORKER'>('CLIENT');
  const [newCedula, setNewCedula] = useState<string>('');
  const [newFullName, setNewFullName] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('Password123!');
  const [newLimit, setNewLimit] = useState<string>('12000000');
  const [newDebt, setNewDebt] = useState<string>('0');
  const [newTermMonths, setNewTermMonths] = useState<string>('12');
  const [newInterestRate, setNewInterestRate] = useState<string>('1.85');
  const [newFianzaRate, setNewFianzaRate] = useState<string>('3.5');
  const [newSignatureFee, setNewSignatureFee] = useState<string>('28500');
  const [newCollectionExpenses, setNewCollectionExpenses] = useState<string>('0');
  const [newIvaRate, setNewIvaRate] = useState<string>('19');
  const [newPaymentDeadline, setNewPaymentDeadline] = useState<string>('Día 05 (2026-11-05)');
  const [newWorkerPerms, setNewWorkerPerms] = useState<WorkerPermission[]>([
    'VER_CARTERA',
    'APROBAR_CREDITOS',
    'REGISTRAR_PAGOS'
  ]);

  // Estado para crear un nuevo crédito fijo a un cliente que ya terminó su crédito anterior (PAZ_Y_SALVO)
  const [inlineNewCreditPrincipal, setInlineNewCreditPrincipal] = useState<Record<string, string>>({});
  const [inlineNewCreditTerm, setInlineNewCreditTerm] = useState<Record<string, string>>({});
  const [inlineNewCreditCollection, setInlineNewCreditCollection] = useState<Record<string, string>>({});
  const [inlineNewCreditDeadline, setInlineNewCreditDeadline] = useState<Record<string, string>>({});

  // Filtro de Auditoría
  const [auditSearch, setAuditSearch] = useState<string>('');

  // Estado para URL o imagen del Poster Publicitario
  const [posterUrlInput, setPosterUrlInput] = useState<string>(
    StorageService.getLoanSettings().adPosterUrl || ''
  );

  const showTransientBanner = (
    type: 'emerald' | 'amber' | 'coral' | 'cyan' | 'teal',
    text: string
  ) => {
    setStatusBanner({ type, text });
    setTimeout(() => {
      setStatusBanner(prev => (prev?.text === text ? null : prev));
    }, 3000);
  };

  const triggerCellFlash = (userId: string, field: string) => {
    const key = `${userId}:${field}`;
    setFlashedCells(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setFlashedCells(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }, 900);
  };

  const loadWorkspaceData = async () => {
    const [
      { users: loadedUsers },
      { chain, isChainValid: valid },
      regAuditData
    ] = await Promise.all([
      StorageService.getUsers(),
      StorageService.getAuditChain(),
      fintechPanelsEngine.getRegulatoryAuditLogs()
    ]);

    setUsers(loadedUsers);
    setAuditChain(chain);
    setIsChainValid(valid);
    setRegulatoryLogs(regAuditData?.logs || []);
    setIsRegulatoryCompliant(regAuditData?.isCompliant !== false);
    const latestSettings = StorageService.getLoanSettings();
    setLoanSettings(latestSettings);
    setPosterUrlInput(latestSettings.adPosterUrl || '');

    setAssignedOperators(prev => {
      const next = { ...prev };
      loadedUsers.forEach((u, idx) => {
        if ((!u.role || u.role === 'CLIENT') && !next[u.id]) {
          next[u.id] = idx % 2 === 0 ? 'OP-2001 (Carlos)' : 'ADMINIULEP';
        }
      });
      return next;
    });

    setIsLoading(false);
  };

  useEffect(() => {
    loadWorkspaceData();
    const unsubscribe = fintechPanelsEngine.subscribe(() => {
      loadWorkspaceData();
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const clientUsers = useMemo(
    () => users.filter(u => !u.role || u.role === 'CLIENT'),
    [users]
  );

  const workerUsers = useMemo(
    () => users.filter(u => u.role === 'WORKER' || u.role === 'ADMIN'),
    [users]
  );

  // Resumen financiero, estadístico y de control de plataforma en vivo
  const portfolioSummary = useMemo(() => {
    let alDiaCount = 0;
    let enMoraCount = 0;
    let pendienteCount = 0;
    let enDesembolsoCount = 0;
    let rechazadoCount = 0;
    let cupoEnCeroDeudaCount = 0;
    let activosConDeudaCount = 0;

    let totalCupo = 0;
    let totalDeuda = 0;
    let totalCupoDisminuido = 0;
    let totalRecaudado = 0;

    let totalPrincipalDesembolsado = 0;
    let totalInteresesProyectados = 0;
    let totalFianzaGarantias = 0;
    let totalFirmaElectronica = 0;
    let totalGastosCobranza = 0;
    let totalIvaLiquidado = 0;
    let totalFacturacionActiva = 0;
    let sumaPlazos = 0;
    let conteoPlazos = 0;
    let totalPagosProcesadosCount = 0;

    clientUsers.forEach(u => {
      const cupo = Number(u.creditLimit) || 0;
      const deuda = Number(u.availableBalance) || 0;
      totalCupo += cupo;
      totalDeuda += deuda;

      // Sumar pagos registrados en historial de pagos
      if (Array.isArray(u.paymentRecords)) {
        u.paymentRecords.forEach(pr => {
          if (pr.status === 'PAGO_PROCESADO') {
            totalRecaudado += Number(pr.amount) || 0;
            totalPagosProcesadosCount++;
          }
        });
      }

      // Sumar préstamos históricos cerrados
      if (Array.isArray(u.previousLoans)) {
        u.previousLoans.forEach(pl => {
          totalRecaudado += Number(pl.totalPaid) || 0;
        });
      }

      if (
        u.paymentStatus === 'EN_DESEMBOLSO' ||
        u.disbursementRequest?.status === 'EN_PROCESO_DESEMBOLSO'
      ) {
        enDesembolsoCount++;
      } else if (u.creditStatus === 'PENDIENTE') {
        pendienteCount++;
      } else if (u.creditStatus === 'RECHAZADO') {
        rechazadoCount++;
      } else if (u.paymentStatus === 'EN_MORA' || (u.daysOverdue || 0) > 0) {
        enMoraCount++;
      } else if (u.creditStatus === 'ASIGNADO') {
        alDiaCount++;
      }

      if (
        u.creditStatus === 'ASIGNADO' &&
        deuda === 0 &&
        u.paymentStatus !== 'EN_DESEMBOLSO' &&
        u.disbursementRequest?.status !== 'EN_PROCESO_DESEMBOLSO'
      ) {
        cupoEnCeroDeudaCount++;
      }

      if (deuda > 0) {
        activosConDeudaCount++;
        const lb = u.loanBreakdown;
        const principalActivo = lb?.principalAmount || Math.min(cupo, deuda);
        const totalCredito = lb?.totalPaymentAmount || Math.max(deuda, principalActivo);
        const ratioPendiente = totalCredito > 0 ? Math.min(1, deuda / totalCredito) : 1;
        const disminucionCupoCliente = Math.min(
          cupo,
          Math.round(principalActivo * ratioPendiente)
        );
        totalCupoDisminuido += disminucionCupoCliente;

        // Si el cliente ha abonado sobre la deuda activa y no tenía paymentRecords explícitos
        const abonadoEnActivo = Math.max(0, totalCredito - deuda);
        if (!u.paymentRecords || u.paymentRecords.length === 0) {
          totalRecaudado += abonadoEnActivo;
        }

        totalPrincipalDesembolsado += lb?.principalAmount || principalActivo;
        totalInteresesProyectados += lb?.interestAmount || 0;
        totalFianzaGarantias += lb?.fianzaAmount || 0;
        totalFirmaElectronica += lb?.electronicSignatureFee || 0;
        totalGastosCobranza += lb?.collectionExpenses || 0;
        totalIvaLiquidado += lb?.ivaAmount || 0;
        totalFacturacionActiva += totalCredito;
        sumaPlazos += Number(u.loanTermMonths || lb?.termMonths || 12);
        conteoPlazos++;
      }
    });

    const totalCupoDisponible = Math.max(0, totalCupo - totalCupoDisminuido);
    const utilizacionCupoPercent =
      totalCupo > 0 ? Math.min(100, Math.round((totalCupoDisminuido / totalCupo) * 100)) : 0;
    const tasaRecuperacion =
      totalRecaudado + totalDeuda > 0
        ? Math.round((totalRecaudado / (totalRecaudado + totalDeuda)) * 100)
        : 100;
    const indiceMorosidad =
      activosConDeudaCount > 0
        ? Math.round((enMoraCount / activosConDeudaCount) * 100)
        : 0;
    const plazoPromedioMeses =
      conteoPlazos > 0 ? Math.round(sumaPlazos / conteoPlazos) : 12;

    return {
      totalClients: clientUsers.length,
      alDiaCount,
      enMoraCount,
      pendienteCount,
      enDesembolsoCount,
      rechazadoCount,
      cupoEnCeroDeudaCount,
      activosConDeudaCount,
      totalCupo,
      totalDeuda,
      totalCupoDisminuido,
      totalCupoDisponible,
      totalRecaudado,
      utilizacionCupoPercent,
      tasaRecuperacion,
      indiceMorosidad,
      totalPrincipalDesembolsado,
      totalInteresesProyectados,
      totalFianzaGarantias,
      totalFirmaElectronica,
      totalGastosCobranza,
      totalIvaLiquidado,
      totalFacturacionActiva,
      plazoPromedioMeses,
      totalPagosProcesadosCount
    };
  }, [clientUsers]);

  // Lista de bloques principales de la barra izquierda filtrada según permisos
  const availableSidebarActions = useMemo(() => {
    const allActions: {
      key: LeftActionKey;
      label: string;
      subtitle: string;
      icon: any;
      badge: string | number;
      allowed: boolean;
    }[] = [
      {
        key: 'ALL_PORTFOLIO',
        label: 'Cartera General',
        subtitle: 'Estadísticas y control',
        icon: Layers,
        badge: 'Control',
        allowed:
          isAdmin ||
          hasAccess('VER_CARTERA') ||
          hasAccess('EDITAR_CLIENTES')
      },
      {
        key: 'APPROVE_PENDING',
        label: 'Aprobar Cupo',
        subtitle: 'Cupo inicial $0',
        icon: CheckCircle2,
        badge: portfolioSummary.pendienteCount,
        allowed:
          isAdmin ||
          hasAccess('APROBAR_CREDITOS') ||
          hasAccess('RECHAZAR_CREDITOS')
      },
      {
        key: 'APPROVE_DISBURSEMENT',
        label: 'Aprobar Desembolso',
        subtitle: 'Cupo y deuda',
        icon: Briefcase,
        badge: portfolioSummary.enDesembolsoCount,
        allowed:
          isAdmin ||
          hasAccess('APROBAR_CREDITOS') ||
          hasAccess('REGISTRAR_PAGOS') ||
          hasAccess('EDITAR_CLIENTES')
      },
      {
        key: 'OVERDUE_COLLECTION',
        label: 'Cobranza y Mora',
        subtitle: 'Cartera vencida',
        icon: AlertTriangle,
        badge: portfolioSummary.enMoraCount,
        allowed: isAdmin || hasAccess('GESTIONAR_MORA')
      },
      {
        key: 'QUICK_PAYMENT',
        label: 'Registrar Abono',
        subtitle: 'Caja rápida',
        icon: DollarSign,
        badge: 'Caja',
        allowed: isAdmin || hasAccess('REGISTRAR_PAGOS')
      },
      {
        key: 'NEW_RECORD',
        label: isAdmin ? 'Crear Usuario' : 'Crear Cliente',
        subtitle: 'Nuevo registro',
        icon: UserPlus,
        badge: '+',
        allowed: isAdmin || hasAccess('CREAR_USUARIOS')
      },
      {
        key: 'LOAN_POLICIES',
        label: 'Tasas y Cupos',
        subtitle: 'Parámetros',
        icon: Sliders,
        badge: `${loanSettings.monthlyInterestRate}%`,
        allowed: isAdmin || hasAccess('CONFIGURAR_SISTEMA')
      },
      {
        key: 'AD_POSTERS',
        label: 'Posters',
        subtitle: 'Publicidad',
        icon: ImageIcon,
        badge: loanSettings.adPosterUrl ? 'Activo' : 'Vacío',
        allowed: isAdmin || hasAccess('CONFIGURAR_SISTEMA')
      },
      {
        key: 'WORKERS_TEAM',
        label: 'Trabajadores',
        subtitle: 'Accesos',
        icon: Users,
        badge: workerUsers.length,
        allowed: isAdmin // Exclusivo del Administrador
      },
      {
        key: 'AUDIT_LEDGER',
        label: 'Auditoría PDF',
        subtitle: 'Bitácora',
        icon: History,
        badge: auditChain.length,
        allowed: isAdmin || hasAccess('VER_AUDITORIA')
      }
    ];

    return allActions.filter(item => item.allowed);
  }, [
    isAdmin,
    liveCurrentUser,
    portfolioSummary,
    loanSettings.monthlyInterestRate,
    loanSettings.adPosterUrl,
    workerUsers.length,
    auditChain.length
  ]);

  const [activeAction, setActiveAction] = useState<LeftActionKey>('ALL_PORTFOLIO');

  // Si al trabajador se le quita permiso de la vista actual, moverlo a la primera permitida
  useEffect(() => {
    if (availableSidebarActions.length > 0) {
      const stillAllowed = availableSidebarActions.some(a => a.key === activeAction);
      if (!stillAllowed) {
        setActiveAction(availableSidebarActions[0].key);
      }
    }
  }, [availableSidebarActions, activeAction]);

  const filteredClients = useMemo(() => {
    return clientUsers.filter(u => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        u.fullName.toLowerCase().includes(q) ||
        u.cedula.toLowerCase().includes(q) ||
        (u.creditTramiteId || '').toLowerCase().includes(q) ||
        (u.lastPaymentNumber || '').toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (activeAction === 'APPROVE_PENDING') {
        return u.creditStatus === 'PENDIENTE';
      }
      if (activeAction === 'APPROVE_DISBURSEMENT') {
        return (
          u.paymentStatus === 'EN_DESEMBOLSO' ||
          u.disbursementRequest?.status === 'EN_PROCESO_DESEMBOLSO'
        );
      }
      if (activeAction === 'OVERDUE_COLLECTION') {
        return u.paymentStatus === 'EN_MORA' || (u.daysOverdue || 0) > 0;
      }

      if (statusFilter === 'AL_DIA') {
        return (
          u.creditStatus === 'ASIGNADO' &&
          u.paymentStatus !== 'EN_MORA' &&
          u.paymentStatus !== 'EN_DESEMBOLSO'
        );
      }
      if (statusFilter === 'EN_MORA') {
        return u.creditStatus === 'ASIGNADO' && u.paymentStatus === 'EN_MORA';
      }
      if (statusFilter === 'EN_DESEMBOLSO') {
        return (
          u.paymentStatus === 'EN_DESEMBOLSO' ||
          u.disbursementRequest?.status === 'EN_PROCESO_DESEMBOLSO'
        );
      }
      if (statusFilter === 'PENDIENTE') {
        return u.creditStatus === 'PENDIENTE';
      }
      if (statusFilter === 'RECHAZADO') {
        return u.creditStatus === 'RECHAZADO';
      }
      return true;
    });
  }, [clientUsers, searchQuery, statusFilter, activeAction]);

  const selectedIdsList = useMemo(
    () => Object.keys(selectedRowIds).filter(id => selectedRowIds[id]),
    [selectedRowIds]
  );

  const formatCOP = (val: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(Number(val) || 0);
  };

  const shortText = (val?: string | null, max = 14): string => {
    if (!val) return '';
    const clean = String(val).trim();
    return clean.length > max ? `${clean.slice(0, max)} (***)` : clean;
  };

  // Verifica si el usuario actual puede editar un campo específico en la tabla
  const canEditField = (field: ActiveCellEdit['field']): boolean => {
    if (isAdmin) return true;
    if (hasAccess('EDITAR_CLIENTES')) return true;
    if (
      (field === 'daysOverdue' || field === 'paymentStatus') &&
      hasAccess('GESTIONAR_MORA')
    ) {
      return true;
    }
    if (
      field === 'creditStatus' &&
      (hasAccess('APROBAR_CREDITOS') || hasAccess('RECHAZAR_CREDITOS'))
    ) {
      return true;
    }
    return false;
  };

  const LOCKED_CREDIT_FIELDS: ActiveCellEdit['field'][] = [
    'creditLimit',
    'availableBalance',
    'customInstallmentAmount',
    'loanTermMonths',
    'nextPaymentDate',
    'interestRateApplied',
    'taxPercentageApplied',
    'creditStatus',
    'creditTramiteId'
  ];

  // ===========================================================================
  // EDICIÓN DIRECTA EN CELDA (BLOQUEADA EN CAMPOS DE CRÉDITO MIENTRAS ESTÉ ACTIVO)
  // ===========================================================================
  const startCellEdit = (
    user: User,
    field: ActiveCellEdit['field'],
    initialValue?: string
  ) => {
    if (!canEditField(field)) {
      showTransientBanner('amber', 'Sin permiso para editar este campo');
      return;
    }

    if (
      StorageService.isCreditActiveAndLocked(user) &&
      LOCKED_CREDIT_FIELDS.includes(field)
    ) {
      showTransientBanner(
        'amber',
        '🔒 Crédito activo fijado: No se puede editar, borrar ni cambiar mientras esté el crédito activo'
      );
      return;
    }

    let val = initialValue ?? '';
    if (initialValue === undefined) {
      if (field === 'fullName') val = user.fullName;
      else if (field === 'cedula') val = user.cedula;
      else if (field === 'creditTramiteId') val = user.creditTramiteId || '';
      else if (field === 'phone') val = user.phone;
      else if (field === 'email') val = user.email;
      else if (field === 'creditLimit') val = String(user.creditLimit || 0);
      else if (field === 'availableBalance') val = String(user.availableBalance || 0);
      else if (field === 'customInstallmentAmount')
        val = String(user.customInstallmentAmount || 0);
      else if (field === 'loanTermMonths') val = String(user.loanTermMonths || 12);
      else if (field === 'nextPaymentDate') val = user.nextPaymentDate || '2026-11-05';
      else if (field === 'interestRateApplied')
        val = String(user.interestRateApplied ?? loanSettings.monthlyInterestRate);
      else if (field === 'taxPercentageApplied')
        val = String(user.taxPercentageApplied ?? loanSettings.taxPercentage);
      else if (field === 'creditStatus') val = user.creditStatus;
      else if (field === 'paymentStatus') val = user.paymentStatus || 'AL_DIA';
      else if (field === 'daysOverdue') val = String(user.daysOverdue || 0);
      else if (field === 'assignedOperator')
        val = assignedOperators[user.id] || 'OP-2001 (Carlos)';
    }
    setActiveCell({ userId: user.id, field, value: val });
  };

  const commitCellEdit = async () => {
    if (!activeCell) return;
    const { userId, field, value } = activeCell;
    const targetUser = users.find(u => u.id === userId);
    setActiveCell(null);
    if (!targetUser) return;

    if (field === 'assignedOperator') {
      setAssignedOperators(prev => ({ ...prev, [userId]: value }));
      await fintechPanelsEngine.encryptAndBroadcastChange({
        userId,
        field: 'assignedOperator',
        value,
        editor: liveCurrentUser.fullName
      });
      triggerCellFlash(userId, field);
      showTransientBanner('cyan', `Gestor actualizado: ${targetUser.fullName}`);
      return;
    }

    const updatedPayload = {
      cedula: field === 'cedula' ? value.trim() : targetUser.cedula,
      fullName: field === 'fullName' ? value.trim() : targetUser.fullName,
      email: field === 'email' ? value.trim() : targetUser.email,
      phone: field === 'phone' ? value.trim() : targetUser.phone,
      isActive: targetUser.isActive,
      creditStatus:
        field === 'creditStatus'
          ? (value as CreditStatus)
          : targetUser.creditStatus,
      creditTramiteId:
        field === 'creditTramiteId'
          ? value.trim()
          : targetUser.creditTramiteId || `TRM-${targetUser.cedula.slice(-4)}`,
      creditLimit:
        field === 'creditLimit'
          ? Math.max(0, Number(value.replace(/[^\d]/g, '')) || 0)
          : targetUser.creditLimit,
      availableBalance:
        field === 'availableBalance'
          ? Math.max(0, Number(value.replace(/[^\d]/g, '')) || 0)
          : targetUser.availableBalance,
      customInstallmentAmount:
        field === 'customInstallmentAmount'
          ? Math.max(0, Number(value.replace(/[^\d]/g, '')) || 0)
          : targetUser.customInstallmentAmount,
      loanTermMonths:
        field === 'loanTermMonths'
          ? Math.max(1, Number(value) || 12)
          : targetUser.loanTermMonths || 12,
      nextPaymentDate:
        field === 'nextPaymentDate'
          ? value.trim()
          : targetUser.nextPaymentDate,
      paymentStatus:
        field === 'paymentStatus'
          ? (value as PaymentTimeStatus)
          : field === 'daysOverdue'
          ? Number(value) > 0
            ? 'EN_MORA'
            : 'AL_DIA'
          : targetUser.paymentStatus || 'AL_DIA',
      daysOverdue:
        field === 'daysOverdue'
          ? Math.max(0, Number(value) || 0)
          : field === 'paymentStatus' && value === 'AL_DIA'
          ? 0
          : field === 'paymentStatus' && value === 'EN_MORA' && !targetUser.daysOverdue
          ? 15
          : targetUser.daysOverdue || 0,
      taxPercentageApplied:
        field === 'taxPercentageApplied'
          ? Math.max(0, Number(value) || 0)
          : targetUser.taxPercentageApplied ?? loanSettings.taxPercentage,
      interestRateApplied:
        field === 'interestRateApplied'
          ? Math.max(0, Number(value) || 0)
          : targetUser.interestRateApplied ?? loanSettings.monthlyInterestRate,
      previousLoans: targetUser.previousLoans || [],
      workerPermissions: targetUser.workerPermissions
    };

    const res = await StorageService.updateUserCompleteData(
      targetUser.id,
      updatedPayload,
      liveCurrentUser.fullName
    );

    if (res.success) {
      await fintechPanelsEngine.encryptAndBroadcastChange({
        userId: targetUser.id,
        field,
        newValue: value,
        editor: liveCurrentUser.fullName
      });
      await loadWorkspaceData();
      triggerCellFlash(userId, field);
      showTransientBanner('emerald', `Actualizado: ${targetUser.fullName}`);
    } else {
      showTransientBanner('coral', res.message || 'Error al guardar');
    }
  };

  // ===========================================================================
  // ACCIONES RÁPIDAS EN 1 CLIC (APROBAR CUPO EN $0 Y APROBAR DESEMBOLSO)
  // ===========================================================================
  const handleApproveCupoOnly = async (user: User, customCupo?: number) => {
    if (!isAdmin && !hasAccess('APROBAR_CREDITOS') && !hasAccess('EDITAR_CLIENTES')) {
      showTransientBanner('amber', 'Sin permiso para aprobar cupo');
      return;
    }

    const rawInput = inlineApproveCupo[user.id];
    const cupoToApprove =
      customCupo !== undefined
        ? customCupo
        : rawInput !== undefined && rawInput.trim() !== ''
        ? Math.max(0, Number(rawInput.replace(/[^\d]/g, '')) || 0)
        : user.creditLimit > 0
        ? user.creditLimit
        : 10000000;

    const approveRes = await StorageService.approveUserCredit(
      user.id,
      cupoToApprove,
      liveCurrentUser.fullName
    );
    if (approveRes.success) {
      await fintechPanelsEngine.encryptAndBroadcastChange({
        action: 'CUPO_APPROVED_ZERO_DEBT',
        userId: user.id,
        creditLimit: cupoToApprove,
        initialDebt: 0
      });
      await loadWorkspaceData();
      triggerCellFlash(user.id, 'creditLimit');
      triggerCellFlash(user.id, 'creditStatus');
      showTransientBanner(
        'emerald',
        `Cupo aprobado (${formatCOP(cupoToApprove)}) iniciando en $0 deuda para ${user.fullName}`
      );
    } else {
      showTransientBanner('coral', approveRes.message);
    }
  };

  const handleQuickStatusChange = async (
    user: User,
    newCreditStatus: CreditStatus,
    newPaymentStatus?: PaymentTimeStatus
  ) => {
    if (
      StorageService.isCreditActiveAndLocked(user) &&
      newCreditStatus !== 'ASIGNADO'
    ) {
      showTransientBanner(
        'amber',
        '🔒 Crédito activo fijado: No se puede borrar, rechazar ni cambiar el crédito mientras esté activo'
      );
      return;
    }

    if (
      user.creditStatus === 'PENDIENTE' &&
      newCreditStatus === 'ASIGNADO'
    ) {
      await handleApproveCupoOnly(user);
      return;
    }

    const limit =
      newCreditStatus === 'ASIGNADO' && (!user.creditLimit || user.creditLimit === 0)
        ? 10000000
        : user.creditLimit;
    const balance =
      newCreditStatus === 'RECHAZADO'
        ? 0
        : user.availableBalance || 0;

    const payment =
      newCreditStatus === 'RECHAZADO' || balance === 0
        ? 'PAZ_Y_SALVO'
        : newPaymentStatus || user.paymentStatus || 'AL_DIA';
    const overdue = payment === 'EN_MORA' ? Math.max(15, user.daysOverdue || 15) : 0;

    const res = await StorageService.updateUserCompleteData(
      user.id,
      {
        cedula: user.cedula,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        isActive: user.isActive,
        creditStatus: newCreditStatus,
        creditTramiteId: user.creditTramiteId || `TRM-${user.cedula.slice(-4)}`,
        creditLimit: limit,
        availableBalance: balance,
        loanTermMonths: user.loanTermMonths || 12,
        paymentStatus: payment,
        daysOverdue: overdue,
        taxPercentageApplied: user.taxPercentageApplied ?? loanSettings.taxPercentage,
        interestRateApplied: user.interestRateApplied ?? loanSettings.monthlyInterestRate,
        previousLoans: user.previousLoans || []
      },
      liveCurrentUser.fullName
    );

    if (res.success) {
      await fintechPanelsEngine.encryptAndBroadcastChange({
        action: 'QUICK_STATUS_UPDATE',
        userId: user.id,
        newCreditStatus,
        payment
      });
      await loadWorkspaceData();
      triggerCellFlash(user.id, 'creditStatus');
      triggerCellFlash(user.id, 'paymentStatus');
      showTransientBanner('emerald', `Actualizado: ${user.fullName}`);
    } else {
      showTransientBanner('coral', res.message);
    }
  };

  // Aprobar Desembolso: Disminuye el cupo disponible y carga el valor como deuda en el panel del cliente
  const handleConfirmDisbursement = async (
    user: User,
    source: 'STAFF' | 'BANK_API',
    customPrincipalOverride?: number
  ) => {
    if (
      !isAdmin &&
      !hasAccess('APROBAR_CREDITOS') &&
      !hasAccess('REGISTRAR_PAGOS') &&
      !hasAccess('EDITAR_CLIENTES')
    ) {
      showTransientBanner('amber', 'Sin permiso para aprobar desembolsos');
      return;
    }

    const rawCustom = inlineDisbursementPrincipal[user.id];
    const principalToDisburse =
      customPrincipalOverride !== undefined
        ? customPrincipalOverride
        : rawCustom !== undefined && rawCustom.trim() !== ''
        ? Math.max(100000, Number(rawCustom.replace(/[^\d]/g, '')) || 0)
        : undefined;

    const labelSource =
      source === 'BANK_API'
        ? `API Entidad Bancaria (${
            user.disbursementRequest?.bankEntity || 'ACH'
          })`
        : `Personal Autorizado (${liveCurrentUser.fullName})`;

    const res = await StorageService.confirmLoanDisbursement(
      user.id,
      labelSource,
      principalToDisburse
    );
    if (res.success) {
      await fintechPanelsEngine.encryptAndBroadcastChange({
        action: 'DISBURSEMENT_APPROVED_CUPO_DECREASED_DEBT_CHARGED',
        userId: user.id,
        confirmedBy: labelSource
      });
      await loadWorkspaceData();
      triggerCellFlash(user.id, 'availableBalance');
      triggerCellFlash(user.id, 'paymentStatus');
      showTransientBanner('emerald', res.message);
    } else {
      showTransientBanner('coral', res.message);
    }
  };

  const handleRejectDisbursement = async (user: User) => {
    if (!isAdmin && !hasAccess('RECHAZAR_CREDITOS') && !hasAccess('APROBAR_CREDITOS')) {
      showTransientBanner('amber', 'Sin permiso para rechazar desembolsos');
      return;
    }

    const res = await StorageService.rejectLoanDisbursement(
      user.id,
      'Solicitud de desembolso rechazada en revisión administrativa',
      liveCurrentUser.fullName
    );
    if (res.success) {
      await fintechPanelsEngine.encryptAndBroadcastChange({
        action: 'DISBURSEMENT_REJECTED_CUPO_RESTORED',
        userId: user.id
      });
      await loadWorkspaceData();
      showTransientBanner('amber', res.message);
    } else {
      showTransientBanner('coral', res.message);
    }
  };

  // ===========================================================================
  // EDICIÓN MASIVA EN BLOQUE
  // ===========================================================================
  const toggleSelectAll = () => {
    if (selectedIdsList.length === filteredClients.length && filteredClients.length > 0) {
      setSelectedRowIds({});
    } else {
      const next: Record<string, boolean> = {};
      filteredClients.forEach(u => {
        next[u.id] = true;
      });
      setSelectedRowIds(next);
    }
  };

  const executeBatchUpdate = async (
    mode: 'PAYMENT_STATUS' | 'CREDIT_STATUS' | 'CREDIT_LIMIT'
  ) => {
    if (selectedIdsList.length === 0) return;

    let updatedCount = 0;
    let lockedSkippedCount = 0;

    for (const uid of selectedIdsList) {
      const u = users.find(item => item.id === uid);
      if (!u) continue;

      if (
        StorageService.isCreditActiveAndLocked(u) &&
        (mode === 'CREDIT_STATUS' || mode === 'CREDIT_LIMIT')
      ) {
        lockedSkippedCount++;
        continue;
      }

      const newPaymentStatus =
        mode === 'PAYMENT_STATUS' ? batchPaymentStatus : u.paymentStatus || 'AL_DIA';
      const newDaysOverdue =
        mode === 'PAYMENT_STATUS'
          ? batchPaymentStatus === 'EN_MORA'
            ? Math.max(15, u.daysOverdue || 15)
            : 0
          : u.daysOverdue || 0;

      const res = await StorageService.updateUserCompleteData(
        u.id,
        {
          cedula: u.cedula,
          fullName: u.fullName,
          email: u.email,
          phone: u.phone,
          isActive: u.isActive,
          creditStatus: mode === 'CREDIT_STATUS' ? batchCreditStatus : u.creditStatus,
          creditTramiteId: u.creditTramiteId || `TRM-${u.cedula.slice(-4)}`,
          creditLimit:
            mode === 'CREDIT_LIMIT' && batchCreditLimit
              ? Math.max(0, Number(batchCreditLimit) || 0)
              : u.creditLimit,
          availableBalance: u.availableBalance,
          paymentStatus: newPaymentStatus,
          daysOverdue: newDaysOverdue,
          taxPercentageApplied: u.taxPercentageApplied ?? loanSettings.taxPercentage,
          interestRateApplied: u.interestRateApplied ?? loanSettings.monthlyInterestRate,
          previousLoans: u.previousLoans || []
        },
        `${liveCurrentUser.fullName} [LOTE]`
      );
      if (res.success) {
        updatedCount++;
        triggerCellFlash(
          uid,
          mode === 'PAYMENT_STATUS'
            ? 'paymentStatus'
            : mode === 'CREDIT_STATUS'
            ? 'creditStatus'
            : 'creditLimit'
        );
      }
    }

    await fintechPanelsEngine.encryptAndBroadcastChange({
      batchMode: mode,
      affectedCount: updatedCount,
      editor: liveCurrentUser.fullName
    });

    await loadWorkspaceData();
    if (lockedSkippedCount > 0) {
      showTransientBanner(
        'amber',
        `${updatedCount} actualizados • ${lockedSkippedCount} omitidos por tener crédito activo fijo`
      );
    } else {
      showTransientBanner('emerald', `${updatedCount} clientes actualizados`);
    }
  };

  // ===========================================================================
  // ABONOS Y OPERACIONES INLINE
  // ===========================================================================
  const handleInlinePayment = async (user: User, customAmount?: number) => {
    if (!hasAccess('REGISTRAR_PAGOS')) {
      showTransientBanner('amber', 'Sin permiso para registrar abonos');
      return;
    }

    const rawAmount =
      customAmount !== undefined
        ? String(customAmount)
        : inlinePaymentAmounts[user.id] || '';
    const amount = Number(rawAmount.replace(/[^\d]/g, ''));
    if (!amount || amount <= 0) {
      showTransientBanner('amber', 'Ingrese monto mayor a $0');
      return;
    }

    const res = await StorageService.payLoan(
      user.id,
      amount,
      'CUOTA_PERSONALIZADA',
      `Operador ${liveCurrentUser.fullName}`
    );
    if (res.success) {
      setInlinePaymentAmounts(prev => ({ ...prev, [user.id]: '' }));
      await fintechPanelsEngine.encryptAndBroadcastChange({
        action: 'INLINE_LOAN_PAYMENT',
        userId: user.id,
        amount
      });
      await loadWorkspaceData();
      triggerCellFlash(user.id, 'availableBalance');
      showTransientBanner('emerald', `Abono ${formatCOP(amount)} aplicado a ${user.fullName}`);
    } else {
      showTransientBanner('coral', res.message);
    }
  };

  const handleInlineAddPreviousLoan = async (user: User) => {
    if (!hasAccess('EDITAR_CLIENTES')) return;
    const newRecord: PreviousLoanRecord = {
      id: `prev-${Date.now()}`,
      tramiteId: `HIST-${Math.floor(1000 + Math.random() * 9000)}`,
      amountGranted: 5000000,
      totalPaid: 5000000,
      termMonths: 12,
      taxPercentageApplied: loanSettings.taxPercentage,
      interestRateApplied: loanSettings.monthlyInterestRate,
      startDate: '2025-05-10',
      closedDate: '2025-11-10',
      finalStatus: 'PAZ_Y_SALVO',
      paymentBehavior: 'EXCELENTE'
    };

    const updatedList = [...(user.previousLoans || []), newRecord];
    await StorageService.updateUserCompleteData(
      user.id,
      {
        cedula: user.cedula,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        isActive: user.isActive,
        creditStatus: user.creditStatus,
        creditTramiteId: user.creditTramiteId || `TRM-${user.cedula.slice(-4)}`,
        creditLimit: user.creditLimit,
        availableBalance: user.availableBalance,
        paymentStatus: user.paymentStatus || 'AL_DIA',
        daysOverdue: user.daysOverdue || 0,
        taxPercentageApplied: user.taxPercentageApplied ?? loanSettings.taxPercentage,
        interestRateApplied: user.interestRateApplied ?? loanSettings.monthlyInterestRate,
        previousLoans: updatedList
      },
      liveCurrentUser.fullName
    );
    await loadWorkspaceData();
    showTransientBanner('emerald', `Histórico añadido a ${user.fullName}`);
  };

  const handleInlineDeletePreviousLoan = async (user: User, loanId: string) => {
    if (!hasAccess('EDITAR_CLIENTES')) return;
    const updatedList = (user.previousLoans || []).filter(item => item.id !== loanId);
    await StorageService.updateUserCompleteData(
      user.id,
      {
        cedula: user.cedula,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        isActive: user.isActive,
        creditStatus: user.creditStatus,
        creditTramiteId: user.creditTramiteId || `TRM-${user.cedula.slice(-4)}`,
        creditLimit: user.creditLimit,
        availableBalance: user.availableBalance,
        paymentStatus: user.paymentStatus || 'AL_DIA',
        daysOverdue: user.daysOverdue || 0,
        taxPercentageApplied: user.taxPercentageApplied ?? loanSettings.taxPercentage,
        interestRateApplied: user.interestRateApplied ?? loanSettings.monthlyInterestRate,
        previousLoans: updatedList
      },
      liveCurrentUser.fullName
    );
    await loadWorkspaceData();
    showTransientBanner('cyan', 'Histórico eliminado');
  };

  const handleInlinePasswordUpdate = async (user: User) => {
    if (!hasAccess('EDITAR_CLIENTES')) return;
    const pwd = (inlineNewPassword[user.id] || '').trim();
    if (pwd.length < 6) {
      showTransientBanner('amber', 'Mínimo 6 caracteres');
      return;
    }
    const res = await StorageService.resetPassword(user.cedula, pwd);
    if (res.success) {
      setInlineNewPassword(prev => ({ ...prev, [user.id]: '' }));
      await fintechPanelsEngine.encryptAndBroadcastChange({
        action: 'INLINE_KEY_RESET',
        userId: user.id
      });
      await loadWorkspaceData();
      showTransientBanner('emerald', `Clave actualizada: ${user.fullName}`);
    } else {
      showTransientBanner('coral', res.message);
    }
  };

  const handlePolicyInlineChange = async (
    field: keyof LoanGeneralSettings,
    rawValue: string | number
  ) => {
    if (!hasAccess('CONFIGURAR_SISTEMA')) return;
    const numericVal =
      typeof rawValue === 'number' ? rawValue : Math.max(0, Number(rawValue) || 0);
    const updated = {
      ...loanSettings,
      [field]: numericVal
    };
    setLoanSettings(updated);
    const res = await StorageService.updateLoanSettings(
      { [field]: numericVal },
      liveCurrentUser.fullName
    );
    if (res.success) {
      await fintechPanelsEngine.encryptAndBroadcastChange({
        action: 'GLOBAL_POLICY_SYNC',
        field,
        value: numericVal
      });
      await loadWorkspaceData();
      showTransientBanner('cyan', `Parámetro actualizado: ${numericVal}`);
    }
  };

  const handleSaveAdPosterUrl = async (urlToSave: string) => {
    if (!isAdmin && !hasAccess('CONFIGURAR_SISTEMA')) return;
    const cleanUrl = urlToSave.trim();
    const updated = {
      ...loanSettings,
      adPosterUrl: cleanUrl
    };
    setLoanSettings(updated);
    setPosterUrlInput(cleanUrl);
    const res = await StorageService.updateLoanSettings(
      { adPosterUrl: cleanUrl },
      liveCurrentUser.fullName
    );
    if (res.success) {
      await fintechPanelsEngine.encryptAndBroadcastChange({
        action: 'AD_POSTER_UPDATED',
        adPosterUrl: cleanUrl
      });
      await loadWorkspaceData();
      showTransientBanner(
        'emerald',
        cleanUrl
          ? 'Poster publicitario actualizado en el panel de clientes'
          : 'Poster publicitario eliminado'
      );
    }
  };

  const handleAdPosterFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showTransientBanner('amber', 'Seleccione un archivo de imagen válido');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        await handleSaveAdPosterUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Vista previa en vivo del desglose financiero al crear un cliente nuevo
  const previewNewClientBreakdown = useMemo(() => {
    return StorageService.buildFixedLoanBreakdown({
      principalAmount: Math.max(500000, Number(newLimit) || 10000000),
      termMonths: Math.max(1, Number(newTermMonths) || 12),
      interestRatePercentage: Math.max(0, Number(newInterestRate) || loanSettings.monthlyInterestRate || 1.85),
      fianzaPercentage: Math.max(0, Number(newFianzaRate) || loanSettings.fianzaPercentage || 3.5),
      electronicSignatureFee: Math.max(0, Number(newSignatureFee) || loanSettings.electronicSignatureFee || 28500),
      collectionExpenses: Math.max(0, Number(newCollectionExpenses) || 0),
      ivaPercentage: Math.max(0, Number(newIvaRate) || loanSettings.taxPercentage || 19),
      paymentDeadline: newPaymentDeadline || 'Día 05 (2026-11-05)'
    });
  }, [
    newLimit,
    newTermMonths,
    newInterestRate,
    newFianzaRate,
    newSignatureFee,
    newCollectionExpenses,
    newIvaRate,
    newPaymentDeadline,
    loanSettings
  ]);

  const handleCreateAndLockNewClientCredit = async (user: User) => {
    if (!isAdmin && !hasAccess('APROBAR_CREDITOS') && !hasAccess('EDITAR_CLIENTES')) {
      showTransientBanner('amber', 'Sin permiso para crear y fijar un crédito');
      return;
    }
    if (StorageService.isCreditActiveAndLocked(user)) {
      showTransientBanner(
        'amber',
        '🔒 El cliente ya tiene un crédito activo fijado; no se puede cambiar hasta finalizar el pago'
      );
      return;
    }

    const principal = Math.max(
      500000,
      Number(inlineNewCreditPrincipal[user.id]) || user.creditLimit || 10000000
    );
    const term = Math.max(
      1,
      Number(inlineNewCreditTerm[user.id]) || user.loanTermMonths || 12
    );
    const collection = Math.max(
      0,
      Number(inlineNewCreditCollection[user.id]) || 0
    );
    const deadline =
      inlineNewCreditDeadline[user.id] ||
      user.nextPaymentDate ||
      'Día 05 (2026-11-05)';

    const res = await StorageService.createAndLockClientCredit(
      user.id,
      {
        principalAmount: principal,
        termMonths: term,
        interestRatePercentage:
          user.interestRateApplied ?? loanSettings.monthlyInterestRate,
        fianzaPercentage: loanSettings.fianzaPercentage ?? 3.5,
        electronicSignatureFee: loanSettings.electronicSignatureFee ?? 28500,
        collectionExpenses: collection,
        ivaPercentage: user.taxPercentageApplied ?? loanSettings.taxPercentage,
        paymentDeadline: deadline
      },
      liveCurrentUser.fullName
    );

    if (res.success) {
      await fintechPanelsEngine.encryptAndBroadcastChange({
        action: 'NEW_CREDIT_CREATED_AND_LOCKED',
        userId: user.id,
        principalAmount: principal
      });
      await loadWorkspaceData();
      triggerCellFlash(user.id, 'creditLimit');
      triggerCellFlash(user.id, 'availableBalance');
      showTransientBanner('emerald', res.message);
    } else {
      showTransientBanner('coral', res.message);
    }
  };

  const handleCreateInlineRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCedula.trim() || !newFullName.trim()) {
      showTransientBanner('amber', 'Ingrese Cédula y Nombre');
      return;
    }

    if (newRecordRole === 'WORKER' && isAdmin) {
      const res = await StorageService.createWorker({
        cedula: newCedula.trim(),
        fullName: newFullName.trim(),
        email: newEmail.trim() || `${newCedula.trim().toLowerCase()}@crediulep.co`,
        phone: newPhone.trim() || '+57 300 000 0000',
        password: newPassword || 'Worker123!',
        permissions: newWorkerPerms,
        creatorName: liveCurrentUser.fullName
      });
      if (res.success) {
        setNewCedula('');
        setNewFullName('');
        setNewEmail('');
        setNewPhone('');
        await fintechPanelsEngine.encryptAndBroadcastChange({
          action: 'WORKER_CREATED',
          cedula: newCedula.trim()
        });
        await loadWorkspaceData();
        setActiveAction('WORKERS_TEAM');
        showTransientBanner('emerald', 'Trabajador creado con los accesos seleccionados');
      } else {
        showTransientBanner('coral', res.message);
      }
      return;
    }

    // Crear el cliente inicialmente en estado PENDIENTE
    const reg = await StorageService.registerUser({
      cedula: newCedula.trim(),
      fullName: newFullName.trim(),
      email: newEmail.trim() || `${newCedula.trim()}@cliente.co`,
      phone: newPhone.trim() || '+57 310 000 0000',
      password: newPassword || 'Password123!',
      creditStatus: 'PENDIENTE',
      initialBalance: Number(newLimit) || 10000000
    });

    if (reg.success && reg.user) {
      const initialDebtRequested = Number(newDebt) || 0;
      if (initialDebtRequested > 0) {
        await StorageService.createAndLockClientCredit(
          reg.user.id,
          {
            principalAmount: previewNewClientBreakdown.principalAmount,
            termMonths: previewNewClientBreakdown.termMonths,
            interestRatePercentage: previewNewClientBreakdown.interestRatePercentage,
            fianzaPercentage: previewNewClientBreakdown.fianzaPercentage,
            electronicSignatureFee: previewNewClientBreakdown.electronicSignatureFee,
            collectionExpenses: previewNewClientBreakdown.collectionExpenses,
            ivaPercentage: previewNewClientBreakdown.ivaPercentage,
            paymentDeadline: previewNewClientBreakdown.paymentDeadline
          },
          liveCurrentUser.fullName
        );
      } else {
        await StorageService.approveUserCredit(
          reg.user.id,
          Number(newLimit) || 10000000,
          liveCurrentUser.fullName
        );
      }
      setNewCedula('');
      setNewFullName('');
      setNewEmail('');
      setNewPhone('');
      await fintechPanelsEngine.encryptAndBroadcastChange({
        action:
          initialDebtRequested > 0
            ? 'INLINE_CLIENT_CREATED_AND_LOCKED'
            : 'INLINE_CLIENT_CUPO_APPROVED_ZERO_DEBT',
        cedula: reg.user.cedula
      });
      await loadWorkspaceData();
      setActiveAction(initialDebtRequested > 0 ? 'APPROVE_DISBURSEMENT' : 'APPROVE_PENDING');
      showTransientBanner(
        'emerald',
        initialDebtRequested > 0
          ? `Cliente creado con desembolso activo: ${reg.user.fullName}`
          : `Cliente creado con Cupo habilitado (${formatCOP(Number(newLimit) || 10000000)}) iniciando en $0 deuda: ${reg.user.fullName}`
      );
    } else {
      showTransientBanner('coral', reg.message);
    }
  };

  // ===========================================================================
  // GESTIÓN DE ACCESOS Y PERMISOS DE TRABAJADORES (SOLO ADMIN)
  // ===========================================================================
  const handleToggleWorkerPermission = async (
    worker: User,
    perm: WorkerPermission
  ) => {
    if (!isAdmin) return;
    const currentPerms = worker.workerPermissions || [];
    const exists = currentPerms.includes(perm);
    const updatedPerms = exists
      ? currentPerms.filter(p => p !== perm)
      : [...currentPerms, perm];
    await StorageService.updateWorkerPermissions(
      worker.id,
      updatedPerms,
      liveCurrentUser.fullName
    );
    await fintechPanelsEngine.encryptAndBroadcastChange({
      action: 'WORKER_PERMISSIONS_CHANGED',
      workerId: worker.id,
      permissions: updatedPerms
    });
    await loadWorkspaceData();
    showTransientBanner('teal', `Accesos actualizados: ${worker.fullName}`);
  };

  const handleSetAllWorkerPermissions = async (
    worker: User,
    grantAll: boolean
  ) => {
    if (!isAdmin) return;
    const updatedPerms: WorkerPermission[] = grantAll
      ? ALL_WORKER_PERMISSIONS.map(p => p.key)
      : [];
    await StorageService.updateWorkerPermissions(
      worker.id,
      updatedPerms,
      liveCurrentUser.fullName
    );
    await fintechPanelsEngine.encryptAndBroadcastChange({
      action: 'WORKER_PERMISSIONS_BULK',
      workerId: worker.id,
      grantAll
    });
    await loadWorkspaceData();
    showTransientBanner(
      grantAll ? 'emerald' : 'amber',
      grantAll
        ? `Acceso total otorgado a ${worker.fullName}`
        : `Accesos retirados a ${worker.fullName}`
    );
  };

  if (isLoading) {
    return (
      <div className="fintech-flat-workspace items-center justify-center p-8">
        <div className="bg-white border border-slate-200 p-6 flex items-center gap-3 shadow-xs">
          <Clock className="w-5 h-5 text-purple-700 animate-spin" />
          <span className="text-xs font-bold text-slate-800">Cargando panel...</span>
        </div>
      </div>
    );
  }

  // Si es trabajador y su cuenta fue suspendida por el Admin
  if (isWorker && liveCurrentUser.isActive === false) {
    return (
      <div className="fintech-flat-workspace">
        <header className="fintech-CommandBar bg-purple-900 border-b border-purple-800 text-white">
          <div className="flex items-center gap-2.5">
            <img
              src={`${import.meta.env.BASE_URL}assets/aistudio/logo-bordered.png`}
              alt="Logo"
              className="h-5 sm:h-6 w-auto object-contain select-none shrink-0"
            />
            <div>
              <div className="text-[11px] text-purple-200">
                {liveCurrentUser.fullName} ({liveCurrentUser.cedula})
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer rounded shadow-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Salir</span>
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white border border-rose-200 p-6 max-w-md w-full text-center space-y-2">
            <Lock className="w-8 h-8 text-rose-600 mx-auto" />
            <h2 className="text-sm font-bold text-slate-900">
              Cuenta de Trabajador Deshabilitada
            </h2>
            <p className="text-xs text-slate-600">
              El Administrador ha suspendido temporalmente el acceso de este usuario.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const accentColor = isAdmin ? '#6D28D9' : '#0D9488';

  const activeActionMeta =
    availableSidebarActions.find(a => a.key === activeAction) ||
    availableSidebarActions[0];

  return (
    <div className="fintech-flat-workspace">
      {/* =====================================================================
          BARRA SUPERIOR INSTITUCIONAL (ADMIN Y TRABAJADORES)
         ===================================================================== */}
      <header className="fintech-CommandBar bg-purple-900 border-b border-purple-800 text-white">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}assets/aistudio/logo-bordered.png`}
            alt="Logo"
            className="h-6 w-auto object-contain select-none shrink-0"
          />
          <div className="border-l border-purple-700/80 pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`status-tag ${
                  isAdmin
                    ? 'bg-purple-950 text-purple-200 border border-purple-700'
                    : 'bg-teal-950 text-teal-200 border border-teal-700'
                }`}
              >
                {isAdmin ? 'PANEL ADMINISTRADOR' : 'PANEL TRABAJADOR'}
              </span>
              {activeActionMeta && (
                <span className="text-xs font-bold text-white">
                  • {activeActionMeta.label}
                </span>
              )}
            </div>
            <div className="text-[11px] text-purple-200 mt-0.5" title={liveCurrentUser.fullName}>
              {shortText(liveCurrentUser.fullName, 14)} ({liveCurrentUser.cedula})
              {isWorker && (
                <span className="ml-2 text-teal-200 font-semibold">
                  • {(liveCurrentUser.workerPermissions || []).length} módulos
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {statusBanner && (
            <div className={`status-tag ${statusBanner.type}`}>
              <Check className="w-3 h-3" />
              <span>{statusBanner.text}</span>
            </div>
          )}

          <button
            type="button"
            onClick={onLogout}
            className="px-3.5 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer rounded shadow-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </header>

      {/* =====================================================================
          ESTRUCTURA PRINCIPAL: BLOQUES A LA IZQUIERDA UNO DEBAJO DE OTRO
          + CONTENIDO ORGANIZADO A LA DERECHA
         ===================================================================== */}
      <div className="fintech-shell-layout">
        {/* COLUMNA IZQUIERDA: BLOQUES PRINCIPALES UNO DEBAJO DE OTRO */}
        <aside className="fintech-left-sidebar">
          <div className="px-2 pb-1.5 border-b border-slate-200 flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
              {isAdmin ? 'Bloques Principales' : 'Bloques Autorizados'}
            </span>
            <span className="text-[10px] font-mono font-bold text-slate-400">
              {availableSidebarActions.length} módulos
            </span>
          </div>

          {availableSidebarActions.length === 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-200 text-xs text-amber-800">
              Sin accesos asignados por el Administrador.
            </div>
          ) : (
            availableSidebarActions.map((item, idx) => {
              const Icon = item.icon;
              const isActive = activeAction === item.key;
              const activeClass = isActive
                ? isAdmin
                  ? 'active-admin'
                  : 'active-worker'
                : '';

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveAction(item.key);
                    if (item.key === 'ALL_PORTFOLIO') setStatusFilter('ALL');
                    fintechPanelsEngine.recordAccessEvent({
                      action: `MODULE_ACCESS_${item.key}`,
                      actorCedula: liveCurrentUser.cedula,
                      actorName: liveCurrentUser.fullName,
                      actorRole: liveCurrentUser.role || 'WORKER',
                      module: item.label
                    });
                  }}
                  className={`sidebar-action-btn ${activeClass}`}
                >
                  <span className="flex items-start gap-2.5 min-w-0">
                    <span
                      className={`w-7 h-7 flex items-center justify-center shrink-0 border ${
                        isActive
                          ? isAdmin
                            ? 'bg-purple-700 text-white border-purple-700'
                            : 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="text-xs font-bold leading-tight truncate">
                        {idx + 1}. {item.label}
                      </span>
                      <span className="text-[10px] font-normal text-slate-500 leading-tight truncate mt-0.5">
                        {item.subtitle}
                      </span>
                    </span>
                  </span>
                  <span className="sidebar-count-badge">{item.badge}</span>
                </button>
              );
            })
          )}

          {/* Resumen vertical consolidado en la parte inferior de la barra izquierda */}
          <div className="mt-2 pt-3 border-t border-slate-200 space-y-2">
            <div className="px-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Medición de Plataforma
            </div>
            <div className="bg-slate-50 border border-slate-200 p-2.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">Cupo Total</span>
                <span className="font-mono font-bold text-purple-700">
                  {formatCOP(portfolioSummary.totalCupo)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">Disminución Cupo</span>
                <span className="font-mono font-bold text-amber-700">
                  -{formatCOP(portfolioSummary.totalCupoDisminuido)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">Deuda Activa</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatCOP(portfolioSummary.totalDeuda)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">Recaudado</span>
                <span className="font-mono font-bold text-emerald-700">
                  {formatCOP(portfolioSummary.totalRecaudado)}
                </span>
              </div>
              <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-[10px] font-mono text-slate-600">
                <span>Tasa: {loanSettings.monthlyInterestRate}%</span>
                <span>Mora: {loanSettings.lateFeePercentage}%</span>
                <span>IVA: {loanSettings.taxPercentage}%</span>
              </div>
            </div>
          </div>
        </aside>

        {/* CONTENIDO DERECHO ORGANIZADO POR BLOQUES DE INFORMACIÓN */}
        <main className="flex-1 p-4 sm:p-5 overflow-x-hidden space-y-4">
          {/* BLOQUE SUPERIOR DE MÉTRICAS ORGANIZADAS EN 4 TARJETAS PRINCIPALES */}
          <section className="fintech-kpi-strip">
            <div className="fintech-kpi-cell">
              <div className="flex items-center justify-between">
                <span className="fintech-kpi-label">Control de Clientes</span>
                <span className="status-tag emerald">
                  {portfolioSummary.cupoEnCeroDeudaCount} en $0 Deuda
                </span>
              </div>
              <span className="fintech-kpi-value">{portfolioSummary.totalClients}</span>
              <span className="text-[11px] text-slate-500">
                {portfolioSummary.activosConDeudaCount} con desembolso activo · {portfolioSummary.alDiaCount} al día
              </span>
            </div>

            <div className="fintech-kpi-cell">
              <div className="flex items-center justify-between">
                <span className="fintech-kpi-label">Aprobaciones en Cola</span>
                <span className="status-tag amber">
                  {portfolioSummary.pendienteCount} Cupo · {portfolioSummary.enDesembolsoCount} Giro
                </span>
              </div>
              <span className="fintech-kpi-value text-purple-700">
                {portfolioSummary.pendienteCount + portfolioSummary.enDesembolsoCount} Solicitudes
              </span>
              <span className="text-[11px] text-slate-500">
                {portfolioSummary.enMoraCount} clientes en cobranza / mora
              </span>
            </div>

            <div className="fintech-kpi-cell">
              <div className="flex items-center justify-between">
                <span className="fintech-kpi-label">Deuda Activa y Cupos</span>
                <span className="status-tag cyan">
                  Uso: {portfolioSummary.utilizacionCupoPercent}%
                </span>
              </div>
              <span className="fintech-kpi-value text-slate-900">
                {formatCOP(portfolioSummary.totalDeuda)}
              </span>
              <span className="text-[11px] font-mono text-purple-700 font-semibold">
                Cupo Disp: {formatCOP(portfolioSummary.totalCupoDisponible)} / {formatCOP(portfolioSummary.totalCupo)}
              </span>
            </div>

            <div className="fintech-kpi-cell">
              <div className="flex items-center justify-between">
                <span className="fintech-kpi-label">Recaudo y Recuperación</span>
                <span className="status-tag teal">
                  {portfolioSummary.tasaRecuperacion}% Recup.
                </span>
              </div>
              <span className="fintech-kpi-value text-emerald-700">
                {formatCOP(portfolioSummary.totalRecaudado)}
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Tasa {loanSettings.monthlyInterestRate}% · Mora {loanSettings.lateFeePercentage}% · IVA {loanSettings.taxPercentage}%
              </span>
            </div>
          </section>

          {availableSidebarActions.length === 0 ? (
            <div className="bg-white border border-slate-200 p-8 text-center space-y-2">
              <Lock className="w-7 h-7 text-amber-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-900">
                Sin Permisos Asignados
              </h3>
              <p className="text-xs text-slate-500">
                El Administrador aún no ha habilitado módulos para su cuenta de trabajador.
              </p>
            </div>
          ) : (
            <>
              {/* ENCABEZADO DEL BLOQUE ACTIVO */}
              {activeActionMeta && (
                <div className="bg-white border border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-7 h-7 flex items-center justify-center text-white font-bold ${
                        isAdmin ? 'bg-purple-700' : 'bg-teal-600'
                      }`}
                    >
                      <activeActionMeta.icon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-900 leading-tight">
                        {activeActionMeta.label}
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        {activeActionMeta.subtitle}
                      </p>
                    </div>
                  </div>
                  <span className={`status-tag ${isAdmin ? 'cyan' : 'teal'}`}>
                    {activeActionMeta.badge}
                  </span>
                </div>
              )}

              {/* =================================================================
                  ACCIÓN 1: CARTERA GENERAL (SOLO ESTADÍSTICAS, INFORMES Y CONTROL)
                 ================================================================= */}
              {activeAction === 'ALL_PORTFOLIO' && (
                <div className="space-y-4 action-panel-slide">
                  <div className="bg-white border border-slate-200 p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="status-tag cyan">ESTADÍSTICAS Y CONTROL</span>
                      <span
                        className={`status-tag ${
                          isChainValid && isRegulatoryCompliant ? 'emerald' : 'coral'
                        }`}
                      >
                        {isChainValid && isRegulatoryCompliant
                          ? 'SHA-256 OK'
                          : 'Alerta'}
                      </span>
                      <h3 className="text-xs font-extrabold text-slate-900">
                        Medición General
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveAction('APPROVE_PENDING')}
                        className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-xs font-bold cursor-pointer"
                      >
                        Aprobar Cupo ({portfolioSummary.pendienteCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveAction('APPROVE_DISBURSEMENT')}
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold cursor-pointer"
                      >
                        Aprobar Desembolso ({portfolioSummary.enDesembolsoCount})
                      </button>
                      {(isAdmin || hasAccess('VER_AUDITORIA')) && (
                        <button
                          type="button"
                          onClick={() =>
                            exportAuditTrailToProtectedPDF(
                              auditChain,
                              isChainValid,
                              liveCurrentUser.fullName
                            )
                          }
                          className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>Informe PDF</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* SECCIÓN 1: MEDICIÓN DE CUPOS, DISMINUCIÓN Y ENDEUDAMIENTO */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-white border border-slate-200 p-3.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-slate-500">
                          Cupo Total
                        </span>
                        <span className="status-tag cyan">Global</span>
                      </div>
                      <div className="text-lg font-mono font-extrabold text-purple-700">
                        {formatCOP(portfolioSummary.totalCupo)}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {portfolioSummary.totalClients} clientes
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 p-3.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-slate-500">
                          Disminución Cupo
                        </span>
                        <span className="status-tag amber">
                          {portfolioSummary.utilizacionCupoPercent}% Uso
                        </span>
                      </div>
                      <div className="text-lg font-mono font-extrabold text-amber-700">
                        -{formatCOP(portfolioSummary.totalCupoDisminuido)}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Disp: {formatCOP(portfolioSummary.totalCupoDisponible)}
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 p-3.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-slate-500">
                          Deuda Total
                        </span>
                        <span className="status-tag coral">
                          {portfolioSummary.activosConDeudaCount} Activos
                        </span>
                      </div>
                      <div className="text-lg font-mono font-extrabold text-slate-900">
                        {formatCOP(portfolioSummary.totalDeuda)}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        En cobro
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 p-3.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-slate-500">
                          Recaudo
                        </span>
                        <span className="status-tag emerald">
                          {portfolioSummary.tasaRecuperacion}%
                        </span>
                      </div>
                      <div className="text-lg font-mono font-extrabold text-emerald-700">
                        {formatCOP(portfolioSummary.totalRecaudado)}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {portfolioSummary.totalPagosProcesadosCount} abonos
                      </p>
                    </div>
                  </div>

                  {/* SECCIÓN 2: DISTRIBUCIÓN E INFORME CONTABLE */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-white border border-slate-200 p-4 space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <h4 className="text-xs font-extrabold uppercase text-slate-900">
                          Estados de Cartera
                        </h4>
                        <span className="status-tag cyan">
                          {portfolioSummary.totalClients} Total
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        {[
                          {
                            label: 'Pendientes Cupo',
                            count: portfolioSummary.pendienteCount,
                            color: 'bg-amber-500'
                          },
                          {
                            label: 'Cupo $0 Deuda',
                            count: portfolioSummary.cupoEnCeroDeudaCount,
                            color: 'bg-teal-600'
                          },
                          {
                            label: 'Por Desembolsar',
                            count: portfolioSummary.enDesembolsoCount,
                            color: 'bg-purple-600'
                          },
                          {
                            label: 'Activos Al Día',
                            count: Math.max(
                              0,
                              portfolioSummary.activosConDeudaCount - portfolioSummary.enMoraCount
                            ),
                            color: 'bg-emerald-600'
                          },
                          {
                            label: 'En Mora',
                            count: portfolioSummary.enMoraCount,
                            color: 'bg-rose-600'
                          },
                          {
                            label: 'Rechazados',
                            count: portfolioSummary.rechazadoCount,
                            color: 'bg-slate-400'
                          }
                        ].map((row, i) => {
                          const pct =
                            portfolioSummary.totalClients > 0
                              ? Math.round((row.count / portfolioSummary.totalClients) * 100)
                              : 0;
                          return (
                            <div key={i} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-700">
                                  {row.label}
                                </span>
                                <span className="font-mono font-bold text-slate-900">
                                  {row.count} ({pct}%)
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-100 border border-slate-200 overflow-hidden">
                                <div
                                  className={`h-full ${row.color}`}
                                  style={{ width: `${Math.max(pct, row.count > 0 ? 6 : 0)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 p-4 space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <h4 className="text-xs font-extrabold uppercase text-slate-900">
                          Consolidado Contable
                        </h4>
                        <span className="status-tag emerald">Activo</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="p-2 bg-slate-50 border border-slate-200 flex items-center justify-between">
                          <span className="text-slate-600">Capital:</span>
                          <span className="font-mono font-bold text-slate-900">
                            {formatCOP(portfolioSummary.totalPrincipalDesembolsado)}
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 border border-slate-200 flex items-center justify-between">
                          <span className="text-slate-600">Plazo Prom.:</span>
                          <span className="font-mono font-bold text-purple-700">
                            {portfolioSummary.plazoPromedioMeses}m
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 border border-slate-200 flex items-center justify-between">
                          <span className="text-slate-600">
                            Interés ({loanSettings.monthlyInterestRate}%):
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {formatCOP(portfolioSummary.totalInteresesProyectados)}
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 border border-slate-200 flex items-center justify-between">
                          <span className="text-slate-600">
                            Fianza ({loanSettings.fianzaPercentage ?? 3.5}%):
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {formatCOP(portfolioSummary.totalFianzaGarantias)}
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 border border-slate-200 flex items-center justify-between">
                          <span className="text-slate-600">Firma Elec.:</span>
                          <span className="font-mono font-bold text-slate-900">
                            {formatCOP(portfolioSummary.totalFirmaElectronica)}
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 border border-slate-200 flex items-center justify-between">
                          <span className="text-slate-600">Cobranza:</span>
                          <span className="font-mono font-bold text-rose-700">
                            {formatCOP(portfolioSummary.totalGastosCobranza)}
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 border border-slate-200 flex items-center justify-between">
                          <span className="text-slate-600">
                            IVA ({loanSettings.taxPercentage}%):
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {formatCOP(portfolioSummary.totalIvaLiquidado)}
                          </span>
                        </div>
                        <div className="p-2 bg-purple-50 border border-purple-200 flex items-center justify-between">
                          <span className="font-bold text-purple-900">
                            Total Facturado:
                          </span>
                          <span className="font-mono font-extrabold text-purple-900">
                            {formatCOP(portfolioSummary.totalFacturacionActiva)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 3: INDICADORES DE RIESGO */}
                  <div className="bg-white border border-slate-200 p-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <h4 className="text-xs font-extrabold uppercase text-slate-900">
                        Control y Riesgo
                      </h4>
                      <span className="text-[11px] font-mono text-slate-500">
                        SHA-256: {auditChain.length} · Logs: {regulatoryLogs.length}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="p-2.5 bg-slate-50 border border-slate-200 space-y-0.5">
                        <span className="text-[10px] font-bold uppercase text-slate-500">
                          Morosidad
                        </span>
                        <div
                          className={`text-sm font-mono font-extrabold ${
                            portfolioSummary.indiceMorosidad > 20
                              ? 'text-rose-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          {portfolioSummary.indiceMorosidad}% ({portfolioSummary.enMoraCount}/{portfolioSummary.activosConDeudaCount})
                        </div>
                      </div>

                      <div className="p-2.5 bg-slate-50 border border-slate-200 space-y-0.5">
                        <span className="text-[10px] font-bold uppercase text-slate-500">
                          Uso de Cupos
                        </span>
                        <div className="text-sm font-mono font-extrabold text-purple-700">
                          {portfolioSummary.utilizacionCupoPercent}%
                        </div>
                      </div>

                      <div className="p-2.5 bg-slate-50 border border-slate-200 space-y-0.5">
                        <span className="text-[10px] font-bold uppercase text-slate-500">
                          Límites
                        </span>
                        <div className="text-sm font-mono font-extrabold text-slate-900">
                          {formatCOP(loanSettings.minLoanAmount)} - {formatCOP(loanSettings.maxLoanAmount)}
                        </div>
                      </div>

                      <div className="p-2.5 bg-slate-50 border border-slate-200 space-y-0.5">
                        <span className="text-[10px] font-bold uppercase text-slate-500">
                          Operadores
                        </span>
                        <div className="text-sm font-mono font-extrabold text-teal-700">
                          {workerUsers.length} Activos
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* =================================================================
                  ACCIÓN 2: APROBAR CUPO ($0 DEUDA)
                 ================================================================= */}
              {activeAction === 'APPROVE_PENDING' && (
                <div className="space-y-4 action-panel-slide">
                  <div className="bg-purple-50 border border-purple-200 px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="status-tag cyan">APROBAR CUPO</span>
                      <span className="status-tag emerald">INICIA EN $0</span>
                    </div>
                    <div className="relative w-full md:w-64 shrink-0">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Buscar..."
                        className="bg-white border border-purple-300 text-slate-900 text-xs pl-8 pr-3 py-1.5 w-full focus:border-purple-700 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Tabla de Usuarios Pendientes por Aprobar Cupo */}
                  <div className="bg-white border border-slate-200">
                    <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                      <h4 className="text-xs font-extrabold uppercase text-slate-900">
                        Pendientes de Cupo ({filteredClients.length})
                      </h4>
                      <span className="status-tag amber">
                        {filteredClients.length} pendientes
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="fintech-DataMatrix">
                        <thead>
                          <tr>
                            <th>Cliente</th>
                            <th>Contacto</th>
                            <th>Estado</th>
                            <th>Cupo (COP)</th>
                            <th>Deuda</th>
                            <th className="text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredClients.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="text-center py-6 text-xs text-slate-400">
                                Sin pendientes.
                              </td>
                            </tr>
                          ) : (
                            filteredClients.map(user => {
                              const currentCupoVal =
                                inlineApproveCupo[user.id] !== undefined
                                  ? inlineApproveCupo[user.id]
                                  : String(user.creditLimit > 0 ? user.creditLimit : 10000000);

                              return (
                                <tr key={user.id}>
                                  <td>
                                    <div
                                      className="font-bold text-slate-900 text-xs"
                                      title={user.fullName}
                                    >
                                      {shortText(user.fullName, 14)}
                                    </div>
                                    <div className="text-[11px] font-mono text-slate-500">
                                      CC {user.cedula}
                                    </div>
                                  </td>
                                  <td>
                                    <div className="text-xs text-slate-700">{user.phone}</div>
                                    <div
                                      className="text-[11px] text-slate-400"
                                      title={user.email}
                                    >
                                      {shortText(user.email, 14)}
                                    </div>
                                  </td>
                                  <td>
                                    <span className="status-tag amber">PENDIENTE</span>
                                  </td>
                                  <td>
                                    <div className="space-y-1 max-w-[210px]">
                                      <input
                                        type="number"
                                        min={500000}
                                        step={500000}
                                        value={currentCupoVal}
                                        onChange={e =>
                                          setInlineApproveCupo(prev => ({
                                            ...prev,
                                            [user.id]: e.target.value
                                          }))
                                        }
                                        className="inline-cell-input font-mono font-bold text-purple-800"
                                      />
                                      <div className="flex flex-wrap gap-1">
                                        {[5000000, 10000000, 15000000, 20000000].map(preset => (
                                          <button
                                            key={preset}
                                            type="button"
                                            onClick={() =>
                                              setInlineApproveCupo(prev => ({
                                                ...prev,
                                                [user.id]: String(preset)
                                              }))
                                            }
                                            className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 hover:bg-purple-100 text-slate-700 border border-slate-200 cursor-pointer"
                                          >
                                            {formatCOP(preset)}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <span className="status-tag emerald font-mono">$0</span>
                                  </td>
                                  <td className="text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      {hasAccess('APROBAR_CREDITOS') && (
                                        <button
                                          type="button"
                                          onClick={() => handleApproveCupoOnly(user)}
                                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                                        >
                                          Aprobar Cupo
                                        </button>
                                      )}
                                      {hasAccess('RECHAZAR_CREDITOS') && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleQuickStatusChange(user, 'RECHAZADO')
                                          }
                                          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer"
                                        >
                                          Rechazar
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Personas que ya tienen Cupo Aprobado e inician en $0 Deuda */}
                  <div className="bg-white border border-slate-200">
                    <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                      <h4 className="text-xs font-extrabold uppercase text-slate-900">
                        Cupos en $0 ({portfolioSummary.cupoEnCeroDeudaCount})
                      </h4>
                      <span className="status-tag teal">
                        {portfolioSummary.cupoEnCeroDeudaCount} en $0
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="fintech-DataMatrix">
                        <thead>
                          <tr>
                            <th>Cliente</th>
                            <th>Cupo</th>
                            <th>Deuda</th>
                            <th>Nuevo Cupo</th>
                            <th className="text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientUsers.filter(
                            u =>
                              u.creditStatus === 'ASIGNADO' &&
                              (u.availableBalance || 0) === 0 &&
                              u.paymentStatus !== 'EN_DESEMBOLSO' &&
                              u.disbursementRequest?.status !== 'EN_PROCESO_DESEMBOLSO'
                          ).length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center py-6 text-xs text-slate-400">
                                Sin registros.
                              </td>
                            </tr>
                          ) : (
                            clientUsers
                              .filter(
                                u =>
                                  u.creditStatus === 'ASIGNADO' &&
                                  (u.availableBalance || 0) === 0 &&
                                  u.paymentStatus !== 'EN_DESEMBOLSO' &&
                                  u.disbursementRequest?.status !== 'EN_PROCESO_DESEMBOLSO'
                              )
                              .map(user => {
                                const cupoEditVal =
                                  inlineApproveCupo[user.id] !== undefined
                                    ? inlineApproveCupo[user.id]
                                    : String(user.creditLimit || 10000000);
                                return (
                                  <tr key={user.id}>
                                    <td>
                                      <div
                                        className="font-bold text-slate-900 text-xs"
                                        title={user.fullName}
                                      >
                                        {shortText(user.fullName, 14)}
                                      </div>
                                      <div className="text-[11px] font-mono text-slate-500">
                                        CC {user.cedula}
                                      </div>
                                    </td>
                                    <td className="font-mono font-bold text-purple-700 text-xs">
                                      {formatCOP(user.creditLimit)}
                                    </td>
                                    <td>
                                      <span className="status-tag emerald font-mono">$0</span>
                                    </td>
                                    <td>
                                      <input
                                        type="number"
                                        min={500000}
                                        step={500000}
                                        value={cupoEditVal}
                                        onChange={e =>
                                          setInlineApproveCupo(prev => ({
                                            ...prev,
                                            [user.id]: e.target.value
                                          }))
                                        }
                                        className="inline-cell-input font-mono max-w-[160px]"
                                      />
                                    </td>
                                    <td className="text-right">
                                      <button
                                        type="button"
                                        onClick={() => handleApproveCupoOnly(user)}
                                        className="px-2.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold cursor-pointer"
                                      >
                                        Actualizar
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* =================================================================
                  ACCIÓN 3: APROBAR DESEMBOLSO (DISMINUCIÓN CUPO + DEUDA)
                 ================================================================= */}
              {activeAction === 'APPROVE_DISBURSEMENT' && (
                <div className="space-y-4 action-panel-slide">
                  <div className="bg-amber-50 border border-amber-200 px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="status-tag amber">APROBAR DESEMBOLSO</span>
                      <span className="status-tag coral">CUPO Y DEUDA</span>
                    </div>
                    <div className="relative w-full md:w-64 shrink-0">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Buscar..."
                        className="bg-white border border-amber-300 text-slate-900 text-xs pl-8 pr-3 py-1.5 w-full focus:border-purple-700 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Solicitudes de Desembolso Pendientes de Aprobar */}
                  <div className="bg-white border border-slate-200">
                    <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                      <h4 className="text-xs font-extrabold uppercase text-slate-900">
                        Solicitudes de Desembolso ({filteredClients.length})
                      </h4>
                      <span className="status-tag amber">
                        {filteredClients.length} en cola
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="fintech-DataMatrix">
                        <thead>
                          <tr>
                            <th>Cliente</th>
                            <th>Cuenta / OTP</th>
                            <th>Cupo</th>
                            <th>Desembolso</th>
                            <th>Deuda</th>
                            <th className="text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredClients.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="text-center py-8 text-xs text-slate-400">
                                No hay solicitudes de desembolso pendientes en este momento.
                              </td>
                            </tr>
                          ) : (
                            filteredClients.map(user => {
                              const requestedPrincipal =
                                user.disbursementRequest?.requestedAmount ||
                                user.loanBreakdown?.principalAmount ||
                                user.creditLimit ||
                                10000000;
                              const customPrincipalStr =
                                inlineDisbursementPrincipal[user.id] !== undefined
                                  ? inlineDisbursementPrincipal[user.id]
                                  : String(requestedPrincipal);
                              const effectivePrincipal = Math.max(
                                100000,
                                Number(customPrincipalStr) || requestedPrincipal
                              );
                              const effectiveCupo = Math.max(
                                Number(user.creditLimit) || 0,
                                effectivePrincipal
                              );
                              const cupoRestante = Math.max(0, effectiveCupo - effectivePrincipal);

                              const previewBreakdown = StorageService.buildFixedLoanBreakdown({
                                principalAmount: effectivePrincipal,
                                termMonths:
                                  user.disbursementRequest?.termMonths ||
                                  user.loanTermMonths ||
                                  12,
                                interestRatePercentage:
                                  user.interestRateApplied ?? loanSettings.monthlyInterestRate,
                                fianzaPercentage: loanSettings.fianzaPercentage ?? 3.5,
                                electronicSignatureFee:
                                  loanSettings.electronicSignatureFee ?? 28500,
                                collectionExpenses: 0,
                                ivaPercentage:
                                  user.taxPercentageApplied ?? loanSettings.taxPercentage,
                                paymentDeadline:
                                  user.nextPaymentDate || 'Día 05 (2026-11-05)'
                              });

                              return (
                                <tr key={user.id} className="bg-amber-50/30">
                                  <td>
                                    <div className="font-bold text-slate-900 text-xs">
                                      {user.fullName}
                                    </div>
                                    <div className="text-[11px] font-mono text-slate-500">
                                      CC {user.cedula} · {user.creditTramiteId || `TRM-${user.cedula.slice(-4)}`}
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-0.5">
                                      Deuda actual antes de aprobar: <strong>$0 COP</strong>
                                    </div>
                                  </td>
                                  <td>
                                    {user.disbursementRequest ? (
                                      <div className="space-y-0.5 text-xs">
                                        <div className="font-bold text-slate-800">
                                          {user.disbursementRequest.bankEntity} ({user.disbursementRequest.accountType})
                                        </div>
                                        <div className="font-mono text-[11px] text-slate-600">
                                          Cta: {user.disbursementRequest.accountNumber}
                                        </div>
                                        <div className="text-[10px] font-mono text-emerald-700">
                                          OTP #{user.disbursementRequest.otpCodeUsed} ·{' '}
                                          {user.disbursementRequest.termMonths} meses
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-500">
                                        Giro directo administrativo
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    <div className="font-mono font-bold text-purple-700 text-xs">
                                      {formatCOP(effectiveCupo)}
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      Cupo total del cliente
                                    </div>
                                  </td>
                                  <td>
                                    <div className="space-y-1 max-w-[200px]">
                                      <input
                                        type="number"
                                        min={100000}
                                        max={effectiveCupo}
                                        step={100000}
                                        value={customPrincipalStr}
                                        onChange={e =>
                                          setInlineDisbursementPrincipal(prev => ({
                                            ...prev,
                                            [user.id]: e.target.value
                                          }))
                                        }
                                        className="inline-cell-input font-mono font-bold text-amber-900"
                                      />
                                      <div className="text-[10px] font-mono text-rose-700 font-bold">
                                        Disminución cupo: -{formatCOP(effectivePrincipal)}
                                      </div>
                                      <div className="text-[10px] font-mono text-emerald-700">
                                        Cupo disponible restante: {formatCOP(cupoRestante)}
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <div className="font-mono font-extrabold text-slate-900 text-xs">
                                      {formatCOP(previewBreakdown.totalPaymentAmount)}
                                    </div>
                                    <div className="text-[10px] font-mono text-purple-700 font-semibold">
                                      Cuota: {formatCOP(previewBreakdown.monthlyInstallment)} / mes
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      Incluye capital + interés + fianza + firma + IVA
                                    </div>
                                  </td>
                                  <td className="text-right">
                                    <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleConfirmDisbursement(
                                            user,
                                            'STAFF',
                                            effectivePrincipal
                                          )
                                        }
                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                                      >
                                        Aprobar Desembolso
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleConfirmDisbursement(
                                            user,
                                            'BANK_API',
                                            effectivePrincipal
                                          )
                                        }
                                        className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                                      >
                                        Giro API Banco
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRejectDisbursement(user)}
                                        className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer whitespace-nowrap"
                                      >
                                        Rechazar
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Clientes con Cupo en $0 para Aprobar Desembolso Directo desde Admin/Trabajador */}
                  <div className="bg-white border border-slate-200">
                    <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                          Desembolso Directo a Clientes con Cupo Habilitado en $0 Deuda
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          También puede aprobar un desembolso directamente a cualquier cliente que tenga cupo habilitado en $0.
                        </p>
                      </div>
                      <span className="status-tag cyan">
                        {portfolioSummary.cupoEnCeroDeudaCount} clientes con cupo disponible
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="fintech-DataMatrix">
                        <thead>
                          <tr>
                            <th>Cliente</th>
                            <th>Cupo Aprobado Disponible</th>
                            <th>Monto a Desembolsar (COP)</th>
                            <th>Deuda a Generar</th>
                            <th className="text-right">Acción Directa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientUsers.filter(
                            u =>
                              u.creditStatus === 'ASIGNADO' &&
                              (u.availableBalance || 0) === 0 &&
                              u.paymentStatus !== 'EN_DESEMBOLSO' &&
                              u.disbursementRequest?.status !== 'EN_PROCESO_DESEMBOLSO'
                          ).length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center py-6 text-xs text-slate-400">
                                No hay clientes con cupo en $0 pendientes de desembolso directo.
                              </td>
                            </tr>
                          ) : (
                            clientUsers
                              .filter(
                                u =>
                                  u.creditStatus === 'ASIGNADO' &&
                                  (u.availableBalance || 0) === 0 &&
                                  u.paymentStatus !== 'EN_DESEMBOLSO' &&
                                  u.disbursementRequest?.status !== 'EN_PROCESO_DESEMBOLSO'
                              )
                              .map(user => {
                                const rawVal =
                                  inlineDisbursementPrincipal[user.id] !== undefined
                                    ? inlineDisbursementPrincipal[user.id]
                                    : String(user.creditLimit || 5000000);
                                const amountToDisburse = Math.max(
                                  100000,
                                  Number(rawVal) || user.creditLimit || 5000000
                                );
                                const breakdown = StorageService.buildFixedLoanBreakdown({
                                  principalAmount: amountToDisburse,
                                  termMonths: user.loanTermMonths || 12,
                                  interestRatePercentage:
                                    user.interestRateApplied ?? loanSettings.monthlyInterestRate,
                                  fianzaPercentage: loanSettings.fianzaPercentage ?? 3.5,
                                  electronicSignatureFee:
                                    loanSettings.electronicSignatureFee ?? 28500,
                                  collectionExpenses: 0,
                                  ivaPercentage:
                                    user.taxPercentageApplied ?? loanSettings.taxPercentage,
                                  paymentDeadline:
                                    user.nextPaymentDate || 'Día 05 (2026-11-05)'
                                });

                                return (
                                  <tr key={user.id}>
                                    <td>
                                      <div className="font-bold text-slate-900 text-xs">
                                        {user.fullName}
                                      </div>
                                      <div className="text-[11px] font-mono text-slate-500">
                                        CC {user.cedula}
                                      </div>
                                    </td>
                                    <td className="font-mono font-bold text-purple-700 text-xs">
                                      {formatCOP(user.creditLimit)}
                                    </td>
                                    <td>
                                      <input
                                        type="number"
                                        min={100000}
                                        max={user.creditLimit || 50000000}
                                        step={500000}
                                        value={rawVal}
                                        onChange={e =>
                                          setInlineDisbursementPrincipal(prev => ({
                                            ...prev,
                                            [user.id]: e.target.value
                                          }))
                                        }
                                        className="inline-cell-input font-mono max-w-[180px]"
                                      />
                                    </td>
                                    <td>
                                      <div className="font-mono font-bold text-slate-900 text-xs">
                                        {formatCOP(breakdown.totalPaymentAmount)}
                                      </div>
                                      <div className="text-[10px] text-rose-700 font-mono">
                                        Disminuye cupo en -{formatCOP(amountToDisburse)}
                                      </div>
                                    </td>
                                    <td className="text-right">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleConfirmDisbursement(
                                            user,
                                            'STAFF',
                                            amountToDisburse
                                          )
                                        }
                                        className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold cursor-pointer"
                                      >
                                        Aprobar Desembolso y Cargar Deuda
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Historial de Desembolsos Activos (Disminución de Cupo y Deuda Cargada en Panel del Cliente) */}
                  <div className="bg-white border border-slate-200">
                    <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                          Desembolsos Aprobados Activos • Control de Disminución de Cupo y Deuda ({portfolioSummary.activosConDeudaCount})
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Créditos desembolsados que actualmente disminuyen el cupo y figuran como deuda activa en el panel del cliente
                        </p>
                      </div>
                      <span className="status-tag emerald">
                        Deuda Total: {formatCOP(portfolioSummary.totalDeuda)}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="fintech-DataMatrix">
                        <thead>
                          <tr>
                            <th>Cliente</th>
                            <th>Cupo Total</th>
                            <th>Disminución de Cupo</th>
                            <th>Cupo Disponible</th>
                            <th>Deuda Activa en Panel Cliente</th>
                            <th>Cuota Mensual</th>
                            <th>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientUsers
                            .filter(u => (u.availableBalance || 0) > 0)
                            .map(user => {
                              const cupo = Number(user.creditLimit) || 0;
                              const deuda = Number(user.availableBalance) || 0;
                              const lb = user.loanBreakdown;
                              const principal = lb?.principalAmount || Math.min(cupo, deuda);
                              const totalCredito =
                                lb?.totalPaymentAmount || Math.max(deuda, principal);
                              const ratio =
                                totalCredito > 0 ? Math.min(1, deuda / totalCredito) : 1;
                              const disminucion = Math.min(
                                cupo,
                                Math.round(principal * ratio)
                              );
                              const disponible = Math.max(0, cupo - disminucion);

                              return (
                                <tr key={user.id}>
                                  <td>
                                    <div className="font-bold text-slate-900 text-xs">
                                      {user.fullName}
                                    </div>
                                    <div className="text-[11px] font-mono text-slate-500">
                                      CC {user.cedula} · {user.creditTramiteId}
                                    </div>
                                  </td>
                                  <td className="font-mono font-bold text-purple-700 text-xs">
                                    {formatCOP(cupo)}
                                  </td>
                                  <td className="font-mono font-bold text-rose-700 text-xs">
                                    -{formatCOP(disminucion)}
                                  </td>
                                  <td className="font-mono font-bold text-emerald-700 text-xs">
                                    {formatCOP(disponible)}
                                  </td>
                                  <td className="font-mono font-extrabold text-slate-900 text-xs">
                                    {formatCOP(deuda)}
                                  </td>
                                  <td className="font-mono text-xs text-slate-700">
                                    {formatCOP(
                                      user.customInstallmentAmount ||
                                        lb?.monthlyInstallment ||
                                        0
                                    )}
                                  </td>
                                  <td>
                                    <span
                                      className={`status-tag ${
                                        user.paymentStatus === 'EN_MORA'
                                          ? 'coral'
                                          : 'emerald'
                                      }`}
                                    >
                                      {user.paymentStatus === 'EN_MORA'
                                        ? `MORA (${user.daysOverdue || 15}d)`
                                        : 'DEUDA ACTIVA AL DÍA'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ACCIÓN 4: COBRANZA Y MORA */}
              {activeAction === 'OVERDUE_COLLECTION' && (
                <div
                  className={`space-y-3 action-panel-slide ${
                    isWorker ? 'worker-context' : ''
                  }`}
                >
                  {/* Barra compacta de filtro y búsqueda */}
                  <div className="bg-white border border-slate-200 px-3 sm:px-3.5 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`status-tag ${isAdmin ? 'cyan' : 'teal'}`}>
                        Cobranza en Mora
                      </span>
                      <span className="text-xs font-mono text-slate-500">
                        ({filteredClients.length} registros)
                      </span>
                      {isAdmin && (
                        <span className="text-[11px] text-purple-700 font-semibold hidden sm:inline">
                          • Clic en cualquier dato para editar
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                      <div className="relative flex-1 sm:flex-initial min-w-[180px]">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Buscar cédula, nombre, teléfono..."
                          className="bg-slate-50 border border-slate-300 text-slate-900 text-xs pl-8 pr-3 py-1.5 w-full sm:w-56 focus:bg-white focus:border-purple-600 focus:outline-none"
                        />
                      </div>

                      {hasAccess('CREAR_USUARIOS') && (
                        <button
                          type="button"
                          onClick={() => {
                            setNewRecordRole('CLIENT');
                            setActiveAction('NEW_RECORD');
                          }}
                          className="px-3 py-1.5 text-xs font-bold text-white flex items-center justify-center gap-1 cursor-pointer shrink-0"
                          style={{ backgroundColor: accentColor }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Nuevo</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Barra de Edición Masiva (si tiene permisos y seleccionó filas) */}
                  {selectedIdsList.length > 0 && hasAccess('EDITAR_CLIENTES') && (
                    <div
                      className={`fintech-batch-bar ${isWorker ? 'worker-theme' : ''}`}
                    >
                      <span className={`status-tag ${isAdmin ? 'cyan' : 'teal'}`}>
                        {selectedIdsList.length} seleccionados
                      </span>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1 bg-white border border-slate-300 px-2 py-1">
                          <select
                            value={batchPaymentStatus}
                            onChange={e =>
                              setBatchPaymentStatus(e.target.value as PaymentTimeStatus)
                            }
                            className="bg-transparent text-xs text-slate-800 focus:outline-none"
                          >
                            <option value="AL_DIA">Al Día</option>
                            <option value="EN_MORA">En Mora</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => executeBatchUpdate('PAYMENT_STATUS')}
                            className="px-2 py-0.5 bg-emerald-600 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Aplicar
                          </button>
                        </div>

                        <div className="flex items-center gap-1 bg-white border border-slate-300 px-2 py-1">
                          <select
                            value={batchCreditStatus}
                            onChange={e =>
                              setBatchCreditStatus(e.target.value as CreditStatus)
                            }
                            className="bg-transparent text-xs text-slate-800 focus:outline-none"
                          >
                            <option value="ASIGNADO">Aprobar</option>
                            <option value="PENDIENTE">Pendiente</option>
                            <option value="RECHAZADO">Rechazar</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => executeBatchUpdate('CREDIT_STATUS')}
                            className="px-2 py-0.5 bg-purple-700 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Aplicar
                          </button>
                        </div>

                        <div className="flex items-center gap-1 bg-white border border-slate-300 px-2 py-1">
                          <input
                            type="number"
                            placeholder="Cupo $"
                            value={batchCreditLimit}
                            onChange={e => setBatchCreditLimit(e.target.value)}
                            className="bg-transparent text-xs text-slate-900 w-24 font-mono focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => executeBatchUpdate('CREDIT_LIMIT')}
                            className="px-2 py-0.5 bg-amber-600 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Fijar
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedRowIds({})}
                          className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1 cursor-pointer font-semibold"
                        >
                          Limpiar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tabla de Cartera */}
                  <div className="fintech-grid-container">
                    <table className="fintech-data-grid">
                      <thead>
                        <tr>
                          <th className="w-7 text-center">
                            <input
                              type="checkbox"
                              checked={
                                filteredClients.length > 0 &&
                                selectedIdsList.length === filteredClients.length
                              }
                              onChange={toggleSelectAll}
                            />
                          </th>
                          <th className="w-7"></th>
                          <th>Cédula / ID</th>
                          <th>Cliente / Contacto</th>
                          <th>Cupo</th>
                          <th>Deuda</th>
                          <th>N° Comprobante Pago</th>
                          <th>Cuota / Plazo</th>
                          <th>Avance</th>
                          <th>Tasa / IVA</th>
                          <th>Crédito</th>
                          <th>Estado / Mora</th>
                          <th>Gestor</th>
                          <th>Total Hoy</th>
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredClients.map(user => {
                          const isExpanded = !!expandedRowIds[user.id];
                          const isSelected = !!selectedRowIds[user.id];
                          const term = user.loanTermMonths || 12;
                          const rate =
                            user.interestRateApplied ??
                            loanSettings.monthlyInterestRate;
                          const tax =
                            user.taxPercentageApplied ?? loanSettings.taxPercentage;

                          const metrics = FintechPanelsEngine.calculateLoanMetrics(
                            {
                              creditLimit: user.creditLimit,
                              availableBalance: user.availableBalance,
                              daysOverdue: user.daysOverdue,
                              interestRate: rate
                            },
                            {
                              interestRatePercentage: loanSettings.monthlyInterestRate,
                              lateFeePercentage: loanSettings.lateFeePercentage,
                              taxPercentage: tax
                            }
                          );

                          const monthlyInstallment =
                            user.customInstallmentAmount ||
                            (metrics.balance > 0
                              ? Math.round(metrics.balance / term) +
                                metrics.monthlyInterest
                              : 0);

                          const paidAmount = Math.max(
                            0,
                            metrics.limit - metrics.balance
                          );
                          const paidPercent =
                            metrics.limit > 0
                              ? Math.min(
                                  100,
                                  Math.round((paidAmount / metrics.limit) * 100)
                                )
                              : 0;

                          const isEditing = (field: ActiveCellEdit['field']) =>
                            activeCell?.userId === user.id &&
                            activeCell?.field === field;

                          const isFlashed = (field: string) =>
                            !!flashedCells[`${user.id}:${field}`];

                          const isCreditLocked =
                            StorageService.isCreditActiveAndLocked(user);
                          const loanBreakdown =
                            user.activeLoanBreakdown ||
                            StorageService.buildFixedLoanBreakdown({
                              principalAmount:
                                user.creditLimit > 0
                                  ? user.creditLimit
                                  : user.availableBalance || 10000000,
                              termMonths: term,
                              interestRatePercentage: rate,
                              fianzaPercentage:
                                loanSettings.fianzaPercentage ?? 3.5,
                              electronicSignatureFee:
                                loanSettings.electronicSignatureFee ?? 28500,
                              collectionExpenses:
                                user.daysOverdue && user.daysOverdue > 0
                                  ? Math.round(
                                      (user.creditLimit || 10000000) * 0.025
                                    )
                                  : 0,
                              ivaPercentage: tax,
                              paymentDeadline:
                                user.nextPaymentDate || 'Día 05 (2026-11-05)'
                            });

                          return (
                            <React.Fragment key={user.id}>
                              <tr
                                className={`grid-row ${
                                  isSelected ? 'bg-purple-50/50' : ''
                                }`}
                              >
                                <td className="text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={e =>
                                      setSelectedRowIds(prev => ({
                                        ...prev,
                                        [user.id]: e.target.checked
                                      }))
                                    }
                                  />
                                </td>

                                <td className="text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedRowIds(prev => ({
                                        ...prev,
                                        [user.id]: !prev[user.id]
                                      }))
                                    }
                                    className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4 text-purple-700" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </button>
                                </td>

                                {/* Cédula + Trámite */}
                                <td
                                  className={`editable-cell font-mono ${
                                    isFlashed('cedula') ? 'cell-saved-flash' : ''
                                  }`}
                                  onClick={() =>
                                    !isEditing('cedula') && startCellEdit(user, 'cedula')
                                  }
                                >
                                  {isEditing('cedula') ? (
                                    <input
                                      type="text"
                                      autoFocus
                                      value={activeCell?.value || ''}
                                      onChange={e =>
                                        setActiveCell(prev =>
                                          prev
                                            ? { ...prev, value: e.target.value }
                                            : null
                                        )
                                      }
                                      onBlur={commitCellEdit}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') commitCellEdit();
                                        if (e.key === 'Escape') setActiveCell(null);
                                      }}
                                      className="inline-cell-input w-28"
                                    />
                                  ) : (
                                    <div>
                                      <div className="font-bold text-slate-900">
                                        {user.cedula}
                                      </div>
                                      <div className="text-[10px] text-slate-500">
                                        {user.creditTramiteId}
                                      </div>
                                    </div>
                                  )}
                                </td>

                                {/* Nombre + Teléfono + Correo */}
                                <td
                                  className={`editable-cell ${
                                    isFlashed('fullName') ? 'cell-saved-flash' : ''
                                  }`}
                                  onClick={() =>
                                    !isEditing('fullName') &&
                                    startCellEdit(user, 'fullName')
                                  }
                                >
                                  {isEditing('fullName') ? (
                                    <input
                                      type="text"
                                      autoFocus
                                      value={activeCell?.value || ''}
                                      onChange={e =>
                                        setActiveCell(prev =>
                                          prev
                                            ? { ...prev, value: e.target.value }
                                            : null
                                        )
                                      }
                                      onBlur={commitCellEdit}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') commitCellEdit();
                                        if (e.key === 'Escape') setActiveCell(null);
                                      }}
                                      className="inline-cell-input"
                                    />
                                  ) : (
                                    <div>
                                      <div className="font-bold text-slate-900">
                                        {user.fullName}
                                      </div>
                                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                        <span>{user.phone}</span>
                                        <span>·</span>
                                        <span className="truncate max-w-[140px]">
                                          {user.email}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </td>

                                {/* Cupo */}
                                <td
                                  className={`editable-cell font-mono font-bold ${
                                    isFlashed('creditLimit') ? 'cell-saved-flash' : ''
                                  }`}
                                  onClick={() =>
                                    !isEditing('creditLimit') &&
                                    startCellEdit(user, 'creditLimit')
                                  }
                                >
                                  {isEditing('creditLimit') ? (
                                    <input
                                      type="number"
                                      autoFocus
                                      value={activeCell?.value || ''}
                                      onChange={e =>
                                        setActiveCell(prev =>
                                          prev
                                            ? { ...prev, value: e.target.value }
                                            : null
                                        )
                                      }
                                      onBlur={commitCellEdit}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') commitCellEdit();
                                        if (e.key === 'Escape') setActiveCell(null);
                                      }}
                                      className="inline-cell-input w-28"
                                    />
                                  ) : (
                                    <span className="text-purple-700">
                                      {formatCOP(user.creditLimit)}
                                    </span>
                                  )}
                                </td>

                                {/* Deuda */}
                                <td
                                  className={`editable-cell font-mono font-bold ${
                                    isFlashed('availableBalance')
                                      ? 'cell-saved-flash'
                                      : ''
                                  }`}
                                  onClick={() =>
                                    !isEditing('availableBalance') &&
                                    startCellEdit(user, 'availableBalance')
                                  }
                                >
                                  {isEditing('availableBalance') ? (
                                    <input
                                      type="number"
                                      autoFocus
                                      value={activeCell?.value || ''}
                                      onChange={e =>
                                        setActiveCell(prev =>
                                          prev
                                            ? { ...prev, value: e.target.value }
                                            : null
                                        )
                                      }
                                      onBlur={commitCellEdit}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') commitCellEdit();
                                        if (e.key === 'Escape') setActiveCell(null);
                                      }}
                                      className="inline-cell-input w-28"
                                    />
                                  ) : (
                                    <div>
                                      <div className="text-slate-900">
                                        {formatCOP(user.availableBalance)}
                                      </div>
                                      <div className="text-[10px] text-emerald-700">
                                        Pagado: {formatCOP(paidAmount)}
                                      </div>
                                    </div>
                                  )}
                                </td>

                                {/* N° Comprobante de Pago cargado desde la Pasarela API */}
                                <td className="font-mono text-xs">
                                  {user.lastPaymentNumber ? (
                                    <div className="space-y-0.5">
                                      <div className="font-extrabold text-purple-900">
                                        {user.lastPaymentNumber}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span
                                          className={`status-tag ${
                                            user.lastPaymentStatus ===
                                            'PAGO_CANCELADO'
                                              ? 'coral'
                                              : 'emerald'
                                          }`}
                                        >
                                          {user.lastPaymentStatus ===
                                          'PAGO_CANCELADO'
                                            ? 'PAGO CANCELADO'
                                            : 'PAGO PROCESADO'}
                                        </span>
                                      </div>
                                      {user.lastPaymentAmount !== undefined &&
                                        user.lastPaymentAmount > 0 && (
                                          <div className="text-[10px] text-slate-600">
                                            {formatCOP(user.lastPaymentAmount)}
                                          </div>
                                        )}
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">
                                      Sin pago API
                                    </span>
                                  )}
                                </td>

                                {/* Cuota / Plazo */}
                                <td
                                  className={`editable-cell font-mono ${
                                    isFlashed('loanTermMonths') ? 'cell-saved-flash' : ''
                                  }`}
                                  onClick={() =>
                                    !isEditing('loanTermMonths') &&
                                    startCellEdit(user, 'loanTermMonths')
                                  }
                                >
                                  {isEditing('loanTermMonths') ? (
                                    <input
                                      type="number"
                                      autoFocus
                                      value={activeCell?.value || '12'}
                                      onChange={e =>
                                        setActiveCell(prev =>
                                          prev
                                            ? { ...prev, value: e.target.value }
                                            : null
                                        )
                                      }
                                      onBlur={commitCellEdit}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') commitCellEdit();
                                        if (e.key === 'Escape') setActiveCell(null);
                                      }}
                                      className="inline-cell-input w-16"
                                    />
                                  ) : (
                                    <div>
                                      <div className="font-bold text-slate-800">
                                        {formatCOP(monthlyInstallment)}/m
                                      </div>
                                      <div className="text-[10px] text-slate-500">
                                        {term} meses • {user.nextPaymentDate || 'Día 05'}
                                      </div>
                                    </div>
                                  )}
                                </td>

                                {/* Avance % */}
                                <td className="w-24">
                                  <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                                    <span className="font-bold text-slate-700">
                                      {paidPercent}%
                                    </span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-200 overflow-hidden">
                                    <div
                                      className="h-full bg-emerald-600"
                                      style={{ width: `${paidPercent}%` }}
                                    />
                                  </div>
                                </td>

                                {/* Tasa / IVA */}
                                <td
                                  className={`editable-cell font-mono text-xs ${
                                    isFlashed('interestRateApplied')
                                      ? 'cell-saved-flash'
                                      : ''
                                  }`}
                                  onClick={() =>
                                    !isEditing('interestRateApplied') &&
                                    startCellEdit(user, 'interestRateApplied')
                                  }
                                >
                                  {isEditing('interestRateApplied') ? (
                                    <input
                                      type="number"
                                      step="0.1"
                                      autoFocus
                                      value={activeCell?.value || ''}
                                      onChange={e =>
                                        setActiveCell(prev =>
                                          prev
                                            ? { ...prev, value: e.target.value }
                                            : null
                                        )
                                      }
                                      onBlur={commitCellEdit}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') commitCellEdit();
                                        if (e.key === 'Escape') setActiveCell(null);
                                      }}
                                      className="inline-cell-input w-16"
                                    />
                                  ) : (
                                    <div>
                                      <div className="font-bold text-slate-800">
                                        {rate}% EM
                                      </div>
                                      <div className="text-[10px] text-slate-500">
                                        IVA {tax}%
                                      </div>
                                    </div>
                                  )}
                                </td>

                                {/* Estado Crédito + Indicador de Bloqueo Fijo */}
                                <td
                                  className={`editable-cell ${
                                    isFlashed('creditStatus') ? 'cell-saved-flash' : ''
                                  }`}
                                  onClick={() =>
                                    !isEditing('creditStatus') &&
                                    startCellEdit(user, 'creditStatus')
                                  }
                                >
                                  {isEditing('creditStatus') ? (
                                    <select
                                      autoFocus
                                      value={activeCell?.value || user.creditStatus}
                                      onChange={e =>
                                        setActiveCell(prev =>
                                          prev
                                            ? { ...prev, value: e.target.value }
                                            : null
                                        )
                                      }
                                      onBlur={commitCellEdit}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') commitCellEdit();
                                        if (e.key === 'Escape') setActiveCell(null);
                                      }}
                                      className="inline-cell-select"
                                    >
                                      <option value="ASIGNADO">ASIGNADO</option>
                                      <option value="PENDIENTE">PENDIENTE</option>
                                      <option value="RECHAZADO">RECHAZADO</option>
                                    </select>
                                  ) : (
                                    <div className="space-y-0.5">
                                      <span
                                        className={`status-tag ${
                                          user.creditStatus === 'ASIGNADO'
                                            ? 'emerald'
                                            : user.creditStatus === 'PENDIENTE'
                                            ? 'amber'
                                            : 'coral'
                                        }`}
                                      >
                                        {user.creditStatus}
                                      </span>
                                      {isCreditLocked && (
                                        <div
                                          className="flex items-center gap-1 text-[9px] font-mono font-bold text-purple-800"
                                          title="Crédito fijo: No se puede editar, borrar ni cambiar mientras esté activo"
                                        >
                                          <Lock className="w-2.5 h-2.5 text-purple-700 shrink-0" />
                                          <span>FIJADO</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>

                                {/* Estado / Mora */}
                                <td
                                  className={`editable-cell ${
                                    isFlashed('daysOverdue') ? 'cell-saved-flash' : ''
                                  }`}
                                  onClick={() =>
                                    !isEditing('daysOverdue') &&
                                    startCellEdit(user, 'daysOverdue')
                                  }
                                >
                                  {isEditing('daysOverdue') ? (
                                    <input
                                      type="number"
                                      autoFocus
                                      value={activeCell?.value || '0'}
                                      onChange={e =>
                                        setActiveCell(prev =>
                                          prev
                                            ? { ...prev, value: e.target.value }
                                            : null
                                        )
                                      }
                                      onBlur={commitCellEdit}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') commitCellEdit();
                                        if (e.key === 'Escape') setActiveCell(null);
                                      }}
                                      className="inline-cell-input w-16"
                                    />
                                  ) : (
                                    <div>
                                      {user.paymentStatus === 'EN_DESEMBOLSO' ||
                                      user.disbursementRequest?.status ===
                                        'EN_PROCESO_DESEMBOLSO' ? (
                                        <div>
                                          <span className="status-tag cyan">
                                            EN DESEMBOLSO
                                          </span>
                                          <div className="text-[10px] font-mono text-sky-700 mt-0.5">
                                            OTP OK •{' '}
                                            {user.disbursementRequest
                                              ?.bankEntity || 'ACH'}
                                          </div>
                                        </div>
                                      ) : user.paymentStatus === 'PAZ_Y_SALVO' ||
                                        (user.creditStatus === 'ASIGNADO' &&
                                          user.availableBalance === 0) ? (
                                        <span className="status-tag teal">
                                          PAZ Y SALVO
                                        </span>
                                      ) : (
                                        <>
                                          <span
                                            className={`status-tag ${
                                              user.paymentStatus === 'EN_MORA' ||
                                              (user.daysOverdue || 0) > 0
                                                ? 'coral'
                                                : 'emerald'
                                            }`}
                                          >
                                            {user.paymentStatus === 'EN_MORA' ||
                                            (user.daysOverdue || 0) > 0
                                              ? `MORA ${user.daysOverdue || 15}D`
                                              : 'AL DÍA'}
                                          </span>
                                          {metrics.overduePenalty > 0 && (
                                            <div className="text-[10px] font-mono text-rose-600 mt-0.5">
                                              +{formatCOP(metrics.overduePenalty)}
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  )}
                                </td>

                                {/* Gestor */}
                                <td
                                  className={`editable-cell text-xs ${
                                    isFlashed('assignedOperator')
                                      ? 'cell-saved-flash'
                                      : ''
                                  }`}
                                  onClick={() =>
                                    !isEditing('assignedOperator') &&
                                    startCellEdit(user, 'assignedOperator')
                                  }
                                >
                                  {isEditing('assignedOperator') ? (
                                    <select
                                      autoFocus
                                      value={
                                        activeCell?.value ||
                                        assignedOperators[user.id] ||
                                        'OP-2001 (Carlos)'
                                      }
                                      onChange={e =>
                                        setActiveCell(prev =>
                                          prev
                                            ? { ...prev, value: e.target.value }
                                            : null
                                        )
                                      }
                                      onBlur={commitCellEdit}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') commitCellEdit();
                                        if (e.key === 'Escape') setActiveCell(null);
                                      }}
                                      className="inline-cell-select"
                                    >
                                      <option value="OP-2001 (Carlos)">
                                        OP-2001 (Carlos)
                                      </option>
                                      <option value="ADMINIULEP">ADMINIULEP</option>
                                      {workerUsers.map(w => (
                                        <option key={w.id} value={w.fullName}>
                                          {w.fullName}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-slate-700 font-medium">
                                      {assignedOperators[user.id] || 'OP-2001 (Carlos)'}
                                    </span>
                                  )}
                                </td>

                                {/* Total Exigible */}
                                <td className="font-mono font-bold text-slate-900">
                                  <div>{formatCOP(metrics.totalPayable)}</div>
                                  <div className="text-[10px] text-slate-500">
                                    Int: {formatCOP(metrics.monthlyInterest)}
                                  </div>
                                </td>

                                {/* Botones de Acción Directa según Permiso */}
                                <td>
                                  <div className="flex items-center gap-1">
                                    {user.paymentStatus === 'EN_DESEMBOLSO' ||
                                    user.disbursementRequest?.status ===
                                      'EN_PROCESO_DESEMBOLSO' ? (
                                      <>
                                        {(isAdmin ||
                                          hasAccess('APROBAR_CREDITOS') ||
                                          hasAccess('REGISTRAR_PAGOS') ||
                                          hasAccess('EDITAR_CLIENTES')) && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleConfirmDisbursement(
                                                  user,
                                                  'STAFF'
                                                )
                                              }
                                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer"
                                              title="Confirmar por el personal que ya se desembolsó"
                                            >
                                              Ya se Desembolsó
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleConfirmDisbursement(
                                                  user,
                                                  'BANK_API'
                                                )
                                              }
                                              className="px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold cursor-pointer"
                                              title="Activar por API de la Entidad Bancaria"
                                            >
                                              API Banco
                                            </button>
                                          </>
                                        )}
                                      </>
                                    ) : user.creditStatus === 'PENDIENTE' ? (
                                      <>
                                        {hasAccess('APROBAR_CREDITOS') && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleQuickStatusChange(
                                                user,
                                                'ASIGNADO',
                                                'AL_DIA'
                                              )
                                            }
                                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer"
                                          >
                                            Aprobar
                                          </button>
                                        )}
                                        {hasAccess('RECHAZAR_CREDITOS') && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleQuickStatusChange(user, 'RECHAZADO')
                                            }
                                            className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer"
                                          >
                                            Rechazar
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        {hasAccess('REGISTRAR_PAGOS') && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setExpandedRowIds(prev => ({
                                                ...prev,
                                                [user.id]: !prev[user.id]
                                              }))
                                            }
                                            className="px-2 py-1 bg-purple-700 hover:bg-purple-800 text-white text-[10px] font-bold cursor-pointer"
                                          >
                                            Abonar
                                          </button>
                                        )}
                                        {(hasAccess('GESTIONAR_MORA') ||
                                          hasAccess('EDITAR_CLIENTES')) && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleQuickStatusChange(
                                                user,
                                                'ASIGNADO',
                                                user.paymentStatus === 'EN_MORA'
                                                  ? 'AL_DIA'
                                                  : 'EN_MORA'
                                              )
                                            }
                                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-[10px] font-bold cursor-pointer"
                                          >
                                            {user.paymentStatus === 'EN_MORA'
                                              ? 'Al Día'
                                              : 'Mora'}
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {/* Acordeón en línea: Edición Completa (Admin) + Abono + Historial + Desembolso OTP */}
                              {isExpanded && (
                                <tr className="inline-accordion-row">
                                  <td colSpan={15}>
                                    {user.lastPaymentNumber && (
                                      <div
                                        className={`mb-3 p-3 border flex flex-wrap items-center justify-between gap-3 text-xs ${
                                          user.lastPaymentStatus ===
                                          'PAGO_CANCELADO'
                                            ? 'bg-rose-50 border-rose-300'
                                            : 'bg-emerald-50 border-emerald-300'
                                        }`}
                                      >
                                        <div className="space-y-0.5">
                                          <div className="font-extrabold text-slate-900 flex flex-wrap items-center gap-2">
                                            <span>
                                              Número de Pago en Línea:{' '}
                                              <strong className="font-mono text-purple-950">
                                                {user.lastPaymentNumber}
                                              </strong>
                                            </span>
                                            <span
                                              className={`status-tag ${
                                                user.lastPaymentStatus ===
                                                'PAGO_CANCELADO'
                                                  ? 'coral'
                                                  : 'emerald'
                                              }`}
                                            >
                                              {user.lastPaymentStatus ===
                                              'PAGO_CANCELADO'
                                                ? 'PAGO CANCELADO'
                                                : 'CUOTA PAGADA'}
                                            </span>
                                          </div>
                                          <div className="text-[11px] text-slate-700 font-mono">
                                            Valor:{' '}
                                            <strong>
                                              {formatCOP(
                                                user.lastPaymentAmount || 0
                                              )}
                                            </strong>{' '}
                                            • Medio:{' '}
                                            <strong>
                                              {user.lastPaymentMethod ||
                                                'Pasarela de Pagos'}
                                            </strong>
                                            {user.paymentRecords &&
                                              user.paymentRecords[0] && (
                                                <>
                                                  {' '}
                                                  • Pagador Identificado:{' '}
                                                  <strong>
                                                    {
                                                      user.paymentRecords[0]
                                                        .payerFullName
                                                    }{' '}
                                                    (CC{' '}
                                                    {
                                                      user.paymentRecords[0]
                                                        .payerCedula
                                                    }{' '}
                                                    |{' '}
                                                    {
                                                      user.paymentRecords[0]
                                                        .payerEmail
                                                    }
                                                    )
                                                  </strong>
                                                </>
                                              )}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    {user.disbursementRequest && (
                                      <div className="mb-3 bg-sky-50 border border-sky-200 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                                        <div className="space-y-0.5">
                                          <div className="font-extrabold text-sky-950 flex items-center gap-2">
                                            <span>
                                              Solicitud Firmada con OTP (
                                              {user.disbursementRequest.tramiteId}
                                              )
                                            </span>
                                            <span className="status-tag cyan">
                                              {user.disbursementRequest.status ===
                                              'EN_PROCESO_DESEMBOLSO'
                                                ? 'EN PROCESO DE DESEMBOLSO'
                                                : 'DESEMBOLSADO'}
                                            </span>
                                          </div>
                                          <div className="text-[11px] text-slate-700 font-mono">
                                            Monto:{' '}
                                            <strong>
                                              {formatCOP(
                                                user.disbursementRequest
                                                  .requestedAmount
                                              )}
                                            </strong>{' '}
                                            ({user.disbursementRequest.requestedTermMonths}{' '}
                                            meses) • Banco:{' '}
                                            <strong>
                                              {user.disbursementRequest.bankEntity} (
                                              {user.disbursementRequest.accountType}{' '}
                                              {user.disbursementRequest.accountNumber}
                                              )
                                            </strong>{' '}
                                            • Ref API:{' '}
                                            <strong>
                                              {
                                                user.disbursementRequest
                                                  .bankApiReference
                                              }
                                            </strong>{' '}
                                            • OTP:{' '}
                                            <strong>
                                              {
                                                user.disbursementRequest
                                                  .otpCodeSigned
                                              }
                                            </strong>
                                          </div>
                                        </div>

                                        {user.disbursementRequest.status ===
                                          'EN_PROCESO_DESEMBOLSO' &&
                                          (isAdmin ||
                                            hasAccess('APROBAR_CREDITOS') ||
                                            hasAccess('REGISTRAR_PAGOS') ||
                                            hasAccess('EDITAR_CLIENTES')) && (
                                            <div className="flex items-center gap-2">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleConfirmDisbursement(
                                                    user,
                                                    'STAFF'
                                                  )
                                                }
                                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                                              >
                                                Aceptar que ya se Desembolsó (Personal)
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleConfirmDisbursement(
                                                    user,
                                                    'BANK_API'
                                                  )
                                                }
                                                className="px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs cursor-pointer"
                                              >
                                                Confirmar vía API Bancaria
                                              </button>
                                            </div>
                                          )}
                                      </div>
                                    )}

                                    {/* DESGLOSE FINANCIERO FIJO DEL CRÉDITO DE LA PERSONA (8 ELEMENTOS OBLIGATORIOS) */}
                                    <div className="mb-3 bg-white border-2 border-purple-200 p-3.5 space-y-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-100 pb-2">
                                        <div className="flex items-center gap-2">
                                          <Lock className="w-4 h-4 text-purple-700 shrink-0" />
                                          <div>
                                            <span className="text-xs font-extrabold text-slate-900">
                                              Estructura Financiera Fija del Crédito ({user.creditTramiteId})
                                            </span>
                                            <p className="text-[11px] text-slate-500">
                                              {isCreditLocked
                                                ? 'Este crédito se encuentra ACTIVO y FIJADO: no se puede editar, borrar ni cambiar mientras esté activo.'
                                                : 'El crédito anterior finalizó o aún no está activo. Puede crear y fijar un nuevo crédito abajo.'}
                                            </p>
                                          </div>
                                        </div>
                                        <span
                                          className={`status-tag ${
                                            isCreditLocked ? 'cyan' : 'teal'
                                          }`}
                                        >
                                          {isCreditLocked
                                            ? '🔒 CRÉDITO ACTIVO INMUTABLE'
                                            : 'DISPONIBLE PARA NUEVO CRÉDITO'}
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs font-mono">
                                        <div className="bg-slate-50 p-2 border border-slate-200">
                                          <div className="text-[9px] font-sans font-bold uppercase text-slate-500">
                                            1. Monto Principal
                                          </div>
                                          <div className="font-extrabold text-slate-900 mt-0.5">
                                            {formatCOP(loanBreakdown.principalAmount)}
                                          </div>
                                          <div className="text-[9px] font-sans text-slate-500">
                                            Crédito desembolsado
                                          </div>
                                        </div>

                                        <div className="bg-slate-50 p-2 border border-slate-200">
                                          <div className="text-[9px] font-sans font-bold uppercase text-slate-500">
                                            2. Interés Empresa
                                          </div>
                                          <div className="font-extrabold text-purple-700 mt-0.5">
                                            {formatCOP(loanBreakdown.interestAmount)}
                                          </div>
                                          <div className="text-[9px] font-sans text-slate-500">
                                            {loanBreakdown.interestRatePercentage}% EM ({loanBreakdown.termMonths}m)
                                          </div>
                                        </div>

                                        <div className="bg-slate-50 p-2 border border-slate-200">
                                          <div className="text-[9px] font-sans font-bold uppercase text-slate-500">
                                            3. Fianza
                                          </div>
                                          <div className="font-extrabold text-slate-900 mt-0.5">
                                            {formatCOP(loanBreakdown.fianzaAmount)}
                                          </div>
                                          <div className="text-[9px] font-sans text-slate-500">
                                            Garantía ({loanBreakdown.fianzaPercentage}%)
                                          </div>
                                        </div>

                                        <div className="bg-slate-50 p-2 border border-slate-200">
                                          <div className="text-[9px] font-sans font-bold uppercase text-slate-500">
                                            4. Firma Electrónica
                                          </div>
                                          <div className="font-extrabold text-slate-900 mt-0.5">
                                            {formatCOP(loanBreakdown.electronicSignatureFee)}
                                          </div>
                                          <div className="text-[9px] font-sans text-emerald-700 truncate">
                                            {loanBreakdown.electronicSignatureCode}
                                          </div>
                                        </div>

                                        <div className="bg-slate-50 p-2 border border-slate-200">
                                          <div className="text-[9px] font-sans font-bold uppercase text-slate-500">
                                            5. Gastos Cobranza
                                          </div>
                                          <div className="font-extrabold text-rose-600 mt-0.5">
                                            {formatCOP(loanBreakdown.collectionExpenses)}
                                          </div>
                                          <div className="text-[9px] font-sans text-slate-500">
                                            Gestión de cobro
                                          </div>
                                        </div>

                                        <div className="bg-slate-50 p-2 border border-slate-200">
                                          <div className="text-[9px] font-sans font-bold uppercase text-slate-500">
                                            6. IVA ({loanBreakdown.ivaPercentage}%)
                                          </div>
                                          <div className="font-extrabold text-slate-900 mt-0.5">
                                            {formatCOP(loanBreakdown.ivaAmount)}
                                          </div>
                                          <div className="text-[9px] font-sans text-slate-500">
                                            Impuesto legal
                                          </div>
                                        </div>

                                        <div className="bg-slate-50 p-2 border border-slate-200">
                                          <div className="text-[9px] font-sans font-bold uppercase text-slate-500">
                                            7. Fecha Límite Pago
                                          </div>
                                          <div className="font-extrabold text-purple-900 mt-0.5 text-[11px]">
                                            {loanBreakdown.paymentDeadline}
                                          </div>
                                          <div className="text-[9px] font-sans text-slate-500">
                                            Vencimiento cuota
                                          </div>
                                        </div>

                                        <div className="bg-purple-50 p-2 border border-purple-300">
                                          <div className="text-[9px] font-sans font-extrabold uppercase text-purple-900">
                                            8. Pago Total Fijado
                                          </div>
                                          <div className="font-extrabold text-emerald-700 mt-0.5">
                                            {formatCOP(loanBreakdown.totalPaymentAmount)}
                                          </div>
                                          <div className="text-[9px] font-sans text-purple-800">
                                            Saldo: {formatCOP(user.availableBalance)}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Si el cliente NO tiene un crédito activo (ej. está en PAZ Y SALVO o PENDIENTE), permite crear y fijar un crédito nuevo */}
                                      {!isCreditLocked &&
                                        (isAdmin ||
                                          hasAccess('APROBAR_CREDITOS') ||
                                          hasAccess('EDITAR_CLIENTES')) && (
                                          <div className="pt-2 border-t border-purple-100 bg-purple-50/50 p-2.5 flex flex-wrap items-end gap-2">
                                            <div className="flex-1 min-w-[140px]">
                                              <label className="block text-[10px] font-bold text-purple-950 mb-0.5">
                                                Nuevo Monto Principal Desembolsado
                                              </label>
                                              <input
                                                type="number"
                                                placeholder="Ej. 12000000"
                                                value={
                                                  inlineNewCreditPrincipal[user.id] ??
                                                  String(user.creditLimit || 10000000)
                                                }
                                                onChange={e =>
                                                  setInlineNewCreditPrincipal(prev => ({
                                                    ...prev,
                                                    [user.id]: e.target.value
                                                  }))
                                                }
                                                className="inline-cell-input"
                                              />
                                            </div>
                                            <div className="w-24">
                                              <label className="block text-[10px] font-bold text-purple-950 mb-0.5">
                                                Plazo (Meses)
                                              </label>
                                              <input
                                                type="number"
                                                value={
                                                  inlineNewCreditTerm[user.id] ??
                                                  String(user.loanTermMonths || 12)
                                                }
                                                onChange={e =>
                                                  setInlineNewCreditTerm(prev => ({
                                                    ...prev,
                                                    [user.id]: e.target.value
                                                  }))
                                                }
                                                className="inline-cell-input"
                                              />
                                            </div>
                                            <div className="w-32">
                                              <label className="block text-[10px] font-bold text-purple-950 mb-0.5">
                                                Gastos Cobranza ($)
                                              </label>
                                              <input
                                                type="number"
                                                value={
                                                  inlineNewCreditCollection[user.id] ?? '0'
                                                }
                                                onChange={e =>
                                                  setInlineNewCreditCollection(prev => ({
                                                    ...prev,
                                                    [user.id]: e.target.value
                                                  }))
                                                }
                                                className="inline-cell-input"
                                              />
                                            </div>
                                            <div className="flex-1 min-w-[140px]">
                                              <label className="block text-[10px] font-bold text-purple-950 mb-0.5">
                                                Fecha Límite de Pago
                                              </label>
                                              <input
                                                type="text"
                                                value={
                                                  inlineNewCreditDeadline[user.id] ??
                                                  (user.nextPaymentDate || 'Día 05 (2026-11-05)')
                                                }
                                                onChange={e =>
                                                  setInlineNewCreditDeadline(prev => ({
                                                    ...prev,
                                                    [user.id]: e.target.value
                                                  }))
                                                }
                                                className="inline-cell-input"
                                              />
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleCreateAndLockNewClientCredit(user)
                                              }
                                              className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5 shrink-0"
                                            >
                                              <Lock className="w-3.5 h-3.5" />
                                              <span>Crear y Fijar Crédito Nuevo</span>
                                            </button>
                                          </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                      {/* Panel 1: Liquidación y Abono */}
                                      <div className="bg-white border border-slate-200 p-3 space-y-2.5">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                          <span className="text-xs font-bold text-slate-900">
                                            Liquidación y Abono
                                          </span>
                                          <span className="text-[11px] font-mono text-purple-700 font-bold">
                                            Cuota: {formatCOP(monthlyInstallment)}
                                          </span>
                                        </div>

                                        <div className="grid grid-cols-4 gap-1.5 text-[11px] font-mono">
                                          <div className="bg-slate-50 p-1.5 border border-slate-200">
                                            <div className="text-[9px] text-slate-500">
                                              Capital
                                            </div>
                                            <div className="font-bold text-slate-900">
                                              {formatCOP(metrics.balance)}
                                            </div>
                                          </div>
                                          <div className="bg-slate-50 p-1.5 border border-slate-200">
                                            <div className="text-[9px] text-slate-500">
                                              Interés
                                            </div>
                                            <div className="font-bold text-purple-700">
                                              {formatCOP(metrics.monthlyInterest)}
                                            </div>
                                          </div>
                                          <div className="bg-slate-50 p-1.5 border border-slate-200">
                                            <div className="text-[9px] text-slate-500">
                                              Mora
                                            </div>
                                            <div className="font-bold text-rose-600">
                                              {formatCOP(metrics.overduePenalty)}
                                            </div>
                                          </div>
                                          <div className="bg-slate-50 p-1.5 border border-slate-200">
                                            <div className="text-[9px] text-slate-500">
                                              Total
                                            </div>
                                            <div className="font-bold text-emerald-700">
                                              {formatCOP(metrics.totalPayable)}
                                            </div>
                                          </div>
                                        </div>

                                        {hasAccess('REGISTRAR_PAGOS') && (
                                          <div className="flex items-center gap-1.5">
                                            <input
                                              type="number"
                                              placeholder="Monto COP..."
                                              value={inlinePaymentAmounts[user.id] || ''}
                                              onChange={e =>
                                                setInlinePaymentAmounts(prev => ({
                                                  ...prev,
                                                  [user.id]: e.target.value
                                                }))
                                              }
                                              className="inline-cell-input flex-1"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleInlinePayment(user)}
                                              className="px-2.5 py-1.5 bg-emerald-600 text-white font-bold text-xs cursor-pointer"
                                            >
                                              Abonar
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleInlinePayment(
                                                  user,
                                                  monthlyInstallment
                                                )
                                              }
                                              className="px-2 py-1.5 bg-slate-100 border border-slate-300 text-slate-800 font-bold text-[11px] cursor-pointer"
                                            >
                                              1 Cuota
                                            </button>
                                          </div>
                                        )}
                                      </div>

                                      {/* Panel 2: Historial de Créditos */}
                                      <div className="bg-white border border-slate-200 p-3 space-y-2">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                          <span className="text-xs font-bold text-slate-900">
                                            Créditos Anteriores (
                                            {user.previousLoans?.length || 0})
                                          </span>
                                          {hasAccess('EDITAR_CLIENTES') && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleInlineAddPreviousLoan(user)
                                              }
                                              className="px-2 py-0.5 bg-teal-600 text-white text-[10px] font-bold cursor-pointer flex items-center gap-1"
                                            >
                                              <Plus className="w-3 h-3" />
                                              <span>Agregar</span>
                                            </button>
                                          )}
                                        </div>

                                        <div className="max-h-28 overflow-y-auto space-y-1">
                                          {(user.previousLoans || []).length === 0 ? (
                                            <div className="text-xs text-slate-400 py-3 text-center">
                                              Sin historial previo
                                            </div>
                                          ) : (
                                            (user.previousLoans || []).map(loan => (
                                              <div
                                                key={loan.id}
                                                className="bg-slate-50 border border-slate-200 px-2 py-1 flex items-center justify-between text-xs"
                                              >
                                                <div>
                                                  <span className="font-mono font-bold text-slate-800">
                                                    {loan.tramiteId}
                                                  </span>{' '}
                                                  •{' '}
                                                  <span className="font-mono text-emerald-700 font-semibold">
                                                    {formatCOP(loan.amountGranted)}
                                                  </span>
                                                  <span className="text-[10px] text-slate-500 ml-1.5">
                                                    ({loan.finalStatus})
                                                  </span>
                                                </div>
                                                {hasAccess('EDITAR_CLIENTES') && (
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleInlineDeletePreviousLoan(
                                                        user,
                                                        loan.id
                                                      )
                                                    }
                                                    className="text-rose-600 hover:opacity-75 p-0.5 cursor-pointer"
                                                  >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                  </button>
                                                )}
                                              </div>
                                            ))
                                          )}
                                        </div>
                                      </div>

                                      {/* Panel 3: Edición Directa de Contacto y Clave */}
                                      <div className="bg-white border border-slate-200 p-3 space-y-2">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                          <span className="text-xs font-bold text-slate-900">
                                            Contacto y Clave
                                          </span>
                                          <span className="status-tag emerald">
                                            2FA Activo
                                          </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                                          <div
                                            className="bg-slate-50 p-1.5 border border-slate-200 cursor-pointer"
                                            onClick={() => startCellEdit(user, 'phone')}
                                          >
                                            <div className="text-[9px] text-slate-500">
                                              Teléfono (Clic editar)
                                            </div>
                                            <div className="font-mono font-semibold text-slate-800">
                                              {user.phone}
                                            </div>
                                          </div>
                                          <div
                                            className="bg-slate-50 p-1.5 border border-slate-200 cursor-pointer"
                                            onClick={() => startCellEdit(user, 'email')}
                                          >
                                            <div className="text-[9px] text-slate-500">
                                              Correo (Clic editar)
                                            </div>
                                            <div className="font-mono text-slate-800 truncate">
                                              {user.email}
                                            </div>
                                          </div>
                                        </div>

                                        {hasAccess('EDITAR_CLIENTES') && (
                                          <div className="flex items-center gap-1.5">
                                            <input
                                              type="text"
                                              placeholder="Nueva clave..."
                                              value={inlineNewPassword[user.id] || ''}
                                              onChange={e =>
                                                setInlineNewPassword(prev => ({
                                                  ...prev,
                                                  [user.id]: e.target.value
                                                }))
                                              }
                                              className="inline-cell-input flex-1"
                                            />
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleInlinePasswordUpdate(user)
                                              }
                                              className="px-2.5 py-1.5 bg-purple-700 text-white font-bold text-xs cursor-pointer"
                                            >
                                              Cambiar Clave
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ACCIÓN 4: REGISTRAR ABONO RÁPIDO */}
              {activeAction === 'QUICK_PAYMENT' && hasAccess('REGISTRAR_PAGOS') && (
                <div className="bg-white border border-slate-200 p-4 space-y-4 action-panel-slide">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <h3 className="text-sm font-bold text-slate-900">
                      Caja Rápida • Registrar Abono
                    </h3>
                    <span className="status-tag emerald">Aplicación Inmediata</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end bg-slate-50 p-3 border border-slate-200">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Cliente
                      </label>
                      <select
                        value={quickPaySelectedUserId}
                        onChange={e => setQuickPaySelectedUserId(e.target.value)}
                        className="inline-cell-select"
                      >
                        <option value="">Seleccionar cliente...</option>
                        {clientUsers.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.fullName} ({u.cedula}) — Deuda:{' '}
                            {formatCOP(u.availableBalance)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Monto Abono (COP)
                      </label>
                      <input
                        type="number"
                        placeholder="Ej. 500000"
                        value={quickPayAmount}
                        onChange={e => setQuickPayAmount(e.target.value)}
                        className="inline-cell-input"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const target = clientUsers.find(
                            u => u.id === quickPaySelectedUserId
                          );
                          if (!target) {
                            showTransientBanner('amber', 'Seleccione un cliente');
                            return;
                          }
                          handleInlinePayment(target, Number(quickPayAmount));
                          setQuickPayAmount('');
                        }}
                        className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                      >
                        Aplicar Abono
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const target = clientUsers.find(
                            u => u.id === quickPaySelectedUserId
                          );
                          if (!target) return;
                          handleInlinePayment(target, target.availableBalance);
                        }}
                        className="py-2 px-3 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs cursor-pointer"
                      >
                        Pagar Todo
                      </button>
                    </div>
                  </div>

                  <div className="fintech-grid-container">
                    <table className="fintech-data-grid">
                      <thead>
                        <tr>
                          <th>Cédula</th>
                          <th>Cliente</th>
                          <th>Cupo</th>
                          <th>Deuda Actual</th>
                          <th>N° Pago / Estado</th>
                          <th>Estado</th>
                          <th>Abono en 1 Clic</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientUsers
                          .filter(u => u.availableBalance > 0)
                          .map(u => (
                            <tr key={u.id} className="grid-row">
                              <td className="font-mono font-bold">{u.cedula}</td>
                              <td className="font-semibold">{u.fullName}</td>
                              <td className="font-mono">{formatCOP(u.creditLimit)}</td>
                              <td className="font-mono font-bold text-rose-600">
                                {formatCOP(u.availableBalance)}
                              </td>
                              <td className="font-mono text-xs">
                                {u.lastPaymentNumber ? (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <strong className="text-purple-900">
                                      {u.lastPaymentNumber}
                                    </strong>
                                    <span
                                      className={`status-tag ${
                                        u.lastPaymentStatus === 'PAGO_CANCELADO'
                                          ? 'coral'
                                          : 'emerald'
                                      }`}
                                    >
                                      {u.lastPaymentStatus === 'PAGO_CANCELADO'
                                        ? 'PAGO CANCELADO'
                                        : 'PAGO PROCESADO'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">
                                    Sin pago reciente
                                  </span>
                                )}
                              </td>
                              <td>
                                <span
                                  className={`status-tag ${
                                    u.paymentStatus === 'EN_MORA' ? 'coral' : 'emerald'
                                  }`}
                                >
                                  {u.paymentStatus === 'EN_MORA' ? 'MORA' : 'AL DÍA'}
                                </span>
                              </td>
                              <td>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleInlinePayment(u, 500000)}
                                    className="px-2 py-1 bg-emerald-600 text-white text-[11px] font-bold cursor-pointer"
                                  >
                                    -$500.000
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleInlinePayment(u, 1000000)}
                                    className="px-2 py-1 bg-teal-600 text-white text-[11px] font-bold cursor-pointer"
                                  >
                                    -$1.000.000
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleInlinePayment(u, u.availableBalance)
                                    }
                                    className="px-2 py-1 bg-purple-700 text-white text-[11px] font-bold cursor-pointer"
                                  >
                                    Paz y Salvo
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ACCIÓN 5: CREAR CLIENTE O TRABAJADOR */}
              {activeAction === 'NEW_RECORD' && hasAccess('CREAR_USUARIOS') && (
                <div className="bg-white border border-slate-200 p-4 space-y-4 action-panel-slide">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <h3 className="text-sm font-bold text-slate-900">
                      {isAdmin ? 'Crear Cliente o Trabajador' : 'Crear Nuevo Cliente'}
                    </h3>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setNewRecordRole('CLIENT')}
                          className={`px-3 py-1 text-xs font-bold cursor-pointer ${
                            newRecordRole === 'CLIENT'
                              ? 'bg-purple-700 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          Cliente
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewRecordRole('WORKER')}
                          className={`px-3 py-1 text-xs font-bold cursor-pointer ${
                            newRecordRole === 'WORKER'
                              ? 'bg-teal-600 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          Trabajador
                        </button>
                      </div>
                    )}
                  </div>

                  <form
                    onSubmit={handleCreateInlineRecord}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
                  >
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Cédula / Código
                      </label>
                      <input
                        type="text"
                        required
                        value={newCedula}
                        onChange={e => setNewCedula(e.target.value)}
                        placeholder={
                          newRecordRole === 'WORKER' ? 'Ej. OP-2002' : 'Ej. 1040506070'
                        }
                        className="inline-cell-input"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Nombre Completo
                      </label>
                      <input
                        type="text"
                        required
                        value={newFullName}
                        onChange={e => setNewFullName(e.target.value)}
                        placeholder="Nombre y Apellido"
                        className="inline-cell-input"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Teléfono
                      </label>
                      <input
                        type="text"
                        value={newPhone}
                        onChange={e => setNewPhone(e.target.value)}
                        placeholder="+57 300..."
                        className="inline-cell-input"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Correo
                      </label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        placeholder="correo@ejemplo.com"
                        className="inline-cell-input"
                      />
                    </div>

                    {newRecordRole === 'CLIENT' || !isAdmin ? (
                      <>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            1. Monto Principal (Crédito Desembolsado)
                          </label>
                          <input
                            type="number"
                            value={newLimit}
                            onChange={e => {
                              setNewLimit(e.target.value);
                              setNewDebt(e.target.value);
                            }}
                            className="inline-cell-input"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Plazo del Crédito (Meses)
                          </label>
                          <input
                            type="number"
                            value={newTermMonths}
                            onChange={e => setNewTermMonths(e.target.value)}
                            className="inline-cell-input"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            2. Interés Ganancia Empresa (% EM)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={newInterestRate}
                            onChange={e => setNewInterestRate(e.target.value)}
                            className="inline-cell-input"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            3. Fianza (%)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={newFianzaRate}
                            onChange={e => setNewFianzaRate(e.target.value)}
                            className="inline-cell-input"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            4. Firma Electrónica (COP)
                          </label>
                          <input
                            type="number"
                            value={newSignatureFee}
                            onChange={e => setNewSignatureFee(e.target.value)}
                            className="inline-cell-input"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            5. Gastos de Cobranza (COP)
                          </label>
                          <input
                            type="number"
                            value={newCollectionExpenses}
                            onChange={e => setNewCollectionExpenses(e.target.value)}
                            className="inline-cell-input"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            6. IVA (%)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={newIvaRate}
                            onChange={e => setNewIvaRate(e.target.value)}
                            className="inline-cell-input"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            7. Fecha Límite de Pago
                          </label>
                          <input
                            type="text"
                            value={newPaymentDeadline}
                            onChange={e => setNewPaymentDeadline(e.target.value)}
                            className="inline-cell-input"
                          />
                        </div>

                        {/* Resumen de Liquidación Fija (No editable ni borrable mientras esté activo) */}
                        <div className="sm:col-span-2 lg:col-span-4 bg-purple-50 border border-purple-200 p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-extrabold text-purple-950 flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 text-purple-700" />
                              <span>
                                Resumen del Crédito Nuevo (Se fija sin poder editar, borrar ni cambiar mientras esté activo)
                              </span>
                            </span>
                            <span className="status-tag cyan">
                              8. Pago Total: {formatCOP(previewNewClientBreakdown.totalPaymentAmount)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-[11px] font-mono">
                            <div className="bg-white p-1.5 border border-purple-100">
                              <div className="text-[9px] text-slate-500 font-sans">Principal</div>
                              <div className="font-bold text-slate-900">
                                {formatCOP(previewNewClientBreakdown.principalAmount)}
                              </div>
                            </div>
                            <div className="bg-white p-1.5 border border-purple-100">
                              <div className="text-[9px] text-slate-500 font-sans">Interés</div>
                              <div className="font-bold text-purple-700">
                                {formatCOP(previewNewClientBreakdown.interestAmount)}
                              </div>
                            </div>
                            <div className="bg-white p-1.5 border border-purple-100">
                              <div className="text-[9px] text-slate-500 font-sans">Fianza</div>
                              <div className="font-bold text-slate-900">
                                {formatCOP(previewNewClientBreakdown.fianzaAmount)}
                              </div>
                            </div>
                            <div className="bg-white p-1.5 border border-purple-100">
                              <div className="text-[9px] text-slate-500 font-sans">Firma Elec.</div>
                              <div className="font-bold text-slate-900">
                                {formatCOP(previewNewClientBreakdown.electronicSignatureFee)}
                              </div>
                            </div>
                            <div className="bg-white p-1.5 border border-purple-100">
                              <div className="text-[9px] text-slate-500 font-sans">Cobranza</div>
                              <div className="font-bold text-rose-600">
                                {formatCOP(previewNewClientBreakdown.collectionExpenses)}
                              </div>
                            </div>
                            <div className="bg-white p-1.5 border border-purple-100">
                              <div className="text-[9px] text-slate-500 font-sans">IVA</div>
                              <div className="font-bold text-slate-900">
                                {formatCOP(previewNewClientBreakdown.ivaAmount)}
                              </div>
                            </div>
                            <div className="bg-white p-1.5 border border-purple-100">
                              <div className="text-[9px] text-slate-500 font-sans">Fecha Límite</div>
                              <div className="font-bold text-purple-900 truncate">
                                {previewNewClientBreakdown.paymentDeadline}
                              </div>
                            </div>
                            <div className="bg-emerald-50 p-1.5 border border-emerald-300">
                              <div className="text-[9px] text-emerald-800 font-sans font-bold">Pago Total</div>
                              <div className="font-extrabold text-emerald-700">
                                {formatCOP(previewNewClientBreakdown.totalPaymentAmount)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Accesos que tendrá este Trabajador
                        </label>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {ALL_WORKER_PERMISSIONS.map(p => {
                            const selected = newWorkerPerms.includes(p.key);
                            return (
                              <button
                                key={p.key}
                                type="button"
                                onClick={() =>
                                  setNewWorkerPerms(prev =>
                                    prev.includes(p.key)
                                      ? prev.filter(x => x !== p.key)
                                      : [...prev, p.key]
                                  )
                                }
                                className={`px-2.5 py-1 text-[11px] font-bold border cursor-pointer ${
                                  selected
                                    ? 'bg-teal-600 text-white border-teal-700'
                                    : 'bg-slate-50 text-slate-500 border-slate-300'
                                }`}
                              >
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Clave
                      </label>
                      <input
                        type="text"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="inline-cell-input"
                      />
                    </div>

                    <div className="sm:col-span-2 lg:col-span-4 flex justify-end pt-2">
                      <button
                        type="submit"
                        className="py-2 px-5 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5"
                      >
                        <Lock className="w-4 h-4" />
                        <span>
                          {newRecordRole === 'CLIENT' || !isAdmin
                            ? 'Crear Cliente y Fijar Crédito Activo'
                            : 'Guardar Trabajador'}
                        </span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ACCIÓN 6: TASAS Y CUPOS */}
              {activeAction === 'LOAN_POLICIES' && hasAccess('CONFIGURAR_SISTEMA') && (
                <div className="bg-white border border-slate-200 p-4 space-y-4 action-panel-slide">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Parámetros Financieros para Nuevos Créditos
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Estos valores se aplican al crear un crédito nuevo. Los créditos activos permanecen fijos e inmutables.
                      </p>
                    </div>
                    <span className="status-tag cyan">Sincronizado</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-slate-50 border border-slate-200 p-3">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Interés Ganancia Empresa (% EM)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={loanSettings.monthlyInterestRate}
                        onChange={e =>
                          handlePolicyInlineChange(
                            'monthlyInterestRate',
                            e.target.value
                          )
                        }
                        className="inline-cell-input"
                      />
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-3">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Fianza Garantía (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={loanSettings.fianzaPercentage ?? 3.5}
                        onChange={e =>
                          handlePolicyInlineChange('fianzaPercentage', e.target.value)
                        }
                        className="inline-cell-input"
                      />
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-3">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Firma Electrónica (COP)
                      </label>
                      <input
                        type="number"
                        value={loanSettings.electronicSignatureFee ?? 28500}
                        onChange={e =>
                          handlePolicyInlineChange(
                            'electronicSignatureFee',
                            e.target.value
                          )
                        }
                        className="inline-cell-input"
                      />
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-3">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Gastos de Cobranza Base (COP)
                      </label>
                      <input
                        type="number"
                        value={loanSettings.collectionExpensesDefault ?? 0}
                        onChange={e =>
                          handlePolicyInlineChange(
                            'collectionExpensesDefault',
                            e.target.value
                          )
                        }
                        className="inline-cell-input"
                      />
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-3">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Impuesto IVA (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={loanSettings.taxPercentage}
                        onChange={e =>
                          handlePolicyInlineChange('taxPercentage', e.target.value)
                        }
                        className="inline-cell-input"
                      />
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-3">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Interés Mora (%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={loanSettings.lateFeePercentage}
                        onChange={e =>
                          handlePolicyInlineChange('lateFeePercentage', e.target.value)
                        }
                        className="inline-cell-input"
                      />
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-3">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Monto Mínimo (COP)
                      </label>
                      <input
                        type="number"
                        value={loanSettings.minLoanAmount}
                        onChange={e =>
                          handlePolicyInlineChange('minLoanAmount', e.target.value)
                        }
                        className="inline-cell-input"
                      />
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-3">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Monto Máximo (COP)
                      </label>
                      <input
                        type="number"
                        value={loanSettings.maxLoanAmount}
                        onChange={e =>
                          handlePolicyInlineChange('maxLoanAmount', e.target.value)
                        }
                        className="inline-cell-input"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ACCIÓN 6.5: POSTERS PUBLICITARIOS (SUBIR IMAGEN O URL) */}
              {activeAction === 'AD_POSTERS' &&
                (isAdmin || hasAccess('CONFIGURAR_SISTEMA')) && (
                  <div className="bg-white border border-slate-200 p-4 space-y-4 action-panel-slide">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Posters Publicitarios (Dashboard Cliente)
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Suba una imagen desde su dispositivo o ingrese una URL para mostrar el poster en el rectángulo publicitario debajo de Disponible / Límite.
                        </p>
                      </div>
                      <span
                        className={`status-tag ${
                          loanSettings.adPosterUrl ? 'emerald' : 'amber'
                        }`}
                      >
                        {loanSettings.adPosterUrl ? 'Poster Activo' : 'Sin Imagen'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Opción 1: Subir archivo de imagen */}
                      <div className="bg-slate-50 border border-slate-200 p-4 space-y-2.5">
                        <label className="block text-xs font-bold text-slate-800">
                          1. Subir imagen desde dispositivo
                        </label>
                        <p className="text-[11px] text-slate-500">
                          Formatos admitidos: PNG, JPG, WEBP o GIF. Se ajustará automáticamente al rectángulo.
                        </p>
                        <label className="inline-flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold cursor-pointer transition">
                          <Upload className="w-4 h-4" />
                          <span>Seleccionar y subir imagen</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleAdPosterFileUpload}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {/* Opción 2: Ingresar URL de la imagen */}
                      <div className="bg-slate-50 border border-slate-200 p-4 space-y-2.5">
                        <label className="block text-xs font-bold text-slate-800">
                          2. Ingresar URL de imagen publicitaria
                        </label>
                        <p className="text-[11px] text-slate-500">
                          Pegue el enlace directo (https://...) o Data URL de la imagen del poster.
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={posterUrlInput}
                            onChange={e => setPosterUrlInput(e.target.value)}
                            placeholder="https://ejemplo.com/poster.jpg"
                            className="inline-cell-input flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveAdPosterUrl(posterUrlInput)}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shrink-0"
                          >
                            Guardar URL
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Vista previa del rectángulo tal como se ve en el cliente */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">
                          Vista previa del rectángulo en el Dashboard:
                        </span>
                        {loanSettings.adPosterUrl && (
                          <button
                            type="button"
                            onClick={() => handleSaveAdPosterUrl('')}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Quitar imagen (dejar rectángulo vacío)</span>
                          </button>
                        )}
                      </div>

                      <div className="max-w-2xl bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden w-full h-40 sm:h-48">
                        {loanSettings.adPosterUrl ? (
                          <img
                            src={loanSettings.adPosterUrl}
                            alt=""
                            className="w-full h-full object-cover block"
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

              {/* ACCIÓN 7: TRABAJADORES Y CONTROL DE ACCESOS (EXCLUSIVO ADMIN) */}
              {activeAction === 'WORKERS_TEAM' && isAdmin && (
                <div className="bg-white border border-slate-200 p-4 space-y-4 action-panel-slide">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Trabajadores y Control de Accesos ({workerUsers.length})
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Edite datos directamente con clic y active o desactive qué botones le aparecerán a cada trabajador.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNewRecordRole('WORKER');
                        setActiveAction('NEW_RECORD');
                      }}
                      className="px-3 py-1.5 bg-teal-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nuevo Trabajador</span>
                    </button>
                  </div>

                  <div className="fintech-grid-container">
                    <table className="fintech-data-grid">
                      <thead>
                        <tr>
                          <th>Código / Cédula</th>
                          <th>Nombre (Clic editar)</th>
                          <th>Teléfono / Correo (Clic editar)</th>
                          <th>Rol</th>
                          <th>Accesos Habilitados al Trabajador</th>
                          <th>Clave</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workerUsers.map(w => {
                          const isEditingW = (field: ActiveCellEdit['field']) =>
                            activeCell?.userId === w.id && activeCell?.field === field;

                          return (
                            <tr key={w.id} className="grid-row">
                              {/* Cédula / Código editable */}
                              <td
                                className="editable-cell font-mono font-bold text-teal-700"
                                onClick={() =>
                                  !isEditingW('cedula') && startCellEdit(w, 'cedula')
                                }
                              >
                                {isEditingW('cedula') ? (
                                  <input
                                    type="text"
                                    autoFocus
                                    value={activeCell?.value || ''}
                                    onChange={e =>
                                      setActiveCell(prev =>
                                        prev ? { ...prev, value: e.target.value } : null
                                      )
                                    }
                                    onBlur={commitCellEdit}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') commitCellEdit();
                                      if (e.key === 'Escape') setActiveCell(null);
                                    }}
                                    className="inline-cell-input w-28"
                                  />
                                ) : (
                                  w.cedula
                                )}
                              </td>

                              {/* Nombre editable */}
                              <td
                                className="editable-cell font-bold text-slate-900"
                                onClick={() =>
                                  !isEditingW('fullName') &&
                                  startCellEdit(w, 'fullName')
                                }
                              >
                                {isEditingW('fullName') ? (
                                  <input
                                    type="text"
                                    autoFocus
                                    value={activeCell?.value || ''}
                                    onChange={e =>
                                      setActiveCell(prev =>
                                        prev ? { ...prev, value: e.target.value } : null
                                      )
                                    }
                                    onBlur={commitCellEdit}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') commitCellEdit();
                                      if (e.key === 'Escape') setActiveCell(null);
                                    }}
                                    className="inline-cell-input"
                                  />
                                ) : (
                                  w.fullName
                                )}
                              </td>

                              {/* Teléfono y Correo editables */}
                              <td
                                className="editable-cell text-xs text-slate-600"
                                onClick={() =>
                                  !isEditingW('phone') && startCellEdit(w, 'phone')
                                }
                              >
                                {isEditingW('phone') ? (
                                  <input
                                    type="text"
                                    autoFocus
                                    value={activeCell?.value || ''}
                                    onChange={e =>
                                      setActiveCell(prev =>
                                        prev ? { ...prev, value: e.target.value } : null
                                      )
                                    }
                                    onBlur={commitCellEdit}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') commitCellEdit();
                                      if (e.key === 'Escape') setActiveCell(null);
                                    }}
                                    className="inline-cell-input"
                                  />
                                ) : (
                                  <div>
                                    <div>{w.phone}</div>
                                    <div className="text-[10px] text-slate-400">
                                      {w.email}
                                    </div>
                                  </div>
                                )}
                              </td>

                              <td>
                                <span
                                  className={`status-tag ${
                                    w.role === 'ADMIN' ? 'cyan' : 'teal'
                                  }`}
                                >
                                  {w.role}
                                </span>
                              </td>

                              {/* Botones de Permisos para dar/quitar acceso */}
                              <td>
                                {w.role === 'ADMIN' ? (
                                  <span className="text-xs font-bold text-purple-700">
                                    Acceso Total Permanente
                                  </span>
                                ) : (
                                  <div className="space-y-1.5">
                                    <div className="flex flex-wrap gap-1">
                                      {ALL_WORKER_PERMISSIONS.map(perm => {
                                        const hasPerm = (
                                          w.workerPermissions || []
                                        ).includes(perm.key);
                                        return (
                                          <button
                                            key={perm.key}
                                            type="button"
                                            onClick={() =>
                                              handleToggleWorkerPermission(w, perm.key)
                                            }
                                            className={`px-2 py-0.5 text-[10px] font-bold border cursor-pointer ${
                                              hasPerm
                                                ? 'bg-teal-600 text-white border-teal-700'
                                                : 'bg-slate-50 text-slate-400 border-slate-200'
                                            }`}
                                          >
                                            {perm.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleSetAllWorkerPermissions(w, true)
                                        }
                                        className="text-[10px] font-bold text-teal-700 hover:underline cursor-pointer"
                                      >
                                        Dar Todo
                                      </button>
                                      <span className="text-slate-300">·</span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleSetAllWorkerPermissions(w, false)
                                        }
                                        className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                                      >
                                        Quitar Todo
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </td>

                              {/* Cambiar Clave en línea */}
                              <td>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    placeholder="Nueva clave"
                                    value={inlineNewPassword[w.id] || ''}
                                    onChange={e =>
                                      setInlineNewPassword(prev => ({
                                        ...prev,
                                        [w.id]: e.target.value
                                      }))
                                    }
                                    className="inline-cell-input w-24"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleInlinePasswordUpdate(w)}
                                    className="px-2 py-1 bg-purple-700 text-white text-[10px] font-bold cursor-pointer"
                                  >
                                    OK
                                  </button>
                                </div>
                              </td>

                              {/* Estado Activo / Inactivo */}
                              <td>
                                {w.role === 'WORKER' ? (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await StorageService.toggleWorkerStatus(
                                        w.id,
                                        liveCurrentUser.fullName
                                      );
                                      await loadWorkspaceData();
                                      showTransientBanner(
                                        'teal',
                                        `Estado cambiado: ${w.fullName}`
                                      );
                                    }}
                                    className={`px-2.5 py-1 text-[10px] font-bold cursor-pointer border ${
                                      w.isActive !== false
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                        : 'bg-rose-50 text-rose-700 border-rose-300'
                                    }`}
                                  >
                                    {w.isActive !== false ? 'ACTIVO' : 'SIN ACCESO'}
                                  </button>
                                ) : (
                                  <span className="status-tag emerald">ACTIVO</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ACCIÓN 8: AUDITORÍA Y EXPORTACIÓN PDF */}
              {activeAction === 'AUDIT_LEDGER' && hasAccess('VER_AUDITORIA') && (
                <div className="bg-white border border-slate-200 p-4 space-y-4 action-panel-slide">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">
                        Registro de Auditoría ({auditChain.length + regulatoryLogs.length})
                      </h3>
                      <span
                        className={`status-tag ${
                          isChainValid && isRegulatoryCompliant ? 'emerald' : 'coral'
                        }`}
                      >
                        {isChainValid && isRegulatoryCompliant
                          ? 'Log Cifrado AES-256-GCM Íntegro'
                          : 'Revisar Integridad'}
                      </span>
                      <span className="status-tag cyan">
                        {regulatoryLogs.length} eventos en security-crypto.js
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Buscar cédula o evento..."
                        value={auditSearch}
                        onChange={e => setAuditSearch(e.target.value)}
                        className="bg-slate-50 border border-slate-300 text-xs text-slate-900 px-3 py-1.5"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          exportAuditTrailToProtectedPDF({
                            chain: auditChain,
                            isChainValid,
                            generatedBy: liveCurrentUser
                          });
                          showTransientBanner(
                            'cyan',
                            `PDF descargado (Clave: ${PDF_EXPORT_PASSWORD})`
                          );
                        }}
                        className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        <span>Descargar PDF</span>
                      </button>
                    </div>
                  </div>

                  <div className="fintech-grid-container max-h-[460px] overflow-y-auto">
                    <table className="fintech-data-grid">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Fecha / Hora</th>
                          <th>Acción</th>
                          <th>Cédula</th>
                          <th>Detalle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditChain
                          .filter(
                            b =>
                              !auditSearch ||
                              b.action
                                .toLowerCase()
                                .includes(auditSearch.toLowerCase()) ||
                              b.userCedula
                                .toLowerCase()
                                .includes(auditSearch.toLowerCase()) ||
                              b.details
                                .toLowerCase()
                                .includes(auditSearch.toLowerCase())
                          )
                          .map(block => (
                            <tr key={block.hash} className="grid-row">
                              <td className="font-mono font-bold text-purple-700">
                                #{block.index}
                              </td>
                              <td className="font-mono text-xs text-slate-500">
                                {new Date(block.timestamp).toLocaleString('es-CO')}
                              </td>
                              <td>
                                <span className="status-tag cyan">{block.action}</span>
                              </td>
                              <td className="font-mono font-bold text-slate-800">
                                {block.userCedula}
                              </td>
                              <td className="text-xs text-slate-700">
                                {block.details}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};
