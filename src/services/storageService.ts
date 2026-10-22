/**
 * Servicio de Almacenamiento Seguro con Detección Criptográfica de Manipulación
 * Plataforma CrediULEP
 * Soporte Multi-Rol: Clientes, Trabajadores y Administrador (ADMINIULEP)
 */

import {
  User,
  AuditBlock,
  CreditStatus,
  WorkerPermission,
  LegalSignatureRecord,
  LoanGeneralSettings,
  PreviousLoanRecord,
  ClientPaymentRecord,
  LoanFinancialBreakdown
} from '../types';
import {
  hashPassword,
  calculateUserIntegrityChecksum,
  verifyUserIntegrity,
  calculateBlockAuditHash,
  verifyAuditChainIntegrity,
  setEncryptedStorageItem,
  getEncryptedStorageItem
} from './cryptoService';
import { FirebaseService } from './firebaseService';
import { recordEncryptedAuditLog } from '../security-crypto.js';


const USERS_STORAGE_KEY = 'crediulep_secure_users_v2';
const AUDIT_STORAGE_KEY = 'crediulep_tamper_audit_v2';
const LOAN_SETTINGS_STORAGE_KEY = 'crediulep_general_loan_settings_v1';

const DEFAULT_LOAN_SETTINGS: LoanGeneralSettings = {
  taxPercentage: 19, // IVA aplicable sobre cargos y servicios (%)
  monthlyInterestRate: 1.85, // Interés mensual de ganancia de la empresa (% E.M.)
  annualEffectiveRate: 24.6, // Tasa Efectiva Anual (% E.A.)
  lateFeePercentage: 2.8, // Recargo por mora / cobranza (%)
  insurancePercentage: 0.45, // Seguro de vida deudor (%)
  fianzaPercentage: 6.5, // Fianza / garantía sobre monto desembolsado (%)
  electronicSignatureFee: 28500, // Costo de firma electrónica certificada OTP (COP)
  collectionExpensesDefault: 0, // Gastos de cobranza al originar (COP)
  adminStudyFee: 45000, // Estudio y administración (COP)
  minLoanAmount: 1000000, // Monto mínimo (COP)
  maxLoanAmount: 50000000, // Monto máximo (COP)
  defaultTermMonths: 12, // Plazo estándar (meses)
  maxTermMonths: 60, // Plazo máximo (meses)
  gracePeriodDays: 5, // Días de gracia
  allowCustomInstallments: true,
  earlyPaymentPenaltyPercentage: 0,
  adPosterUrl: '',
  updatedAt: '2026-10-19T08:00:00Z',
  updatedBy: 'ADMINIULEP'
};

let memoryLoanSettingsCache: LoanGeneralSettings = { ...DEFAULT_LOAN_SETTINGS };
let memoryUsersCache: User[] | null = null;
let isDefaultDataInitialized = false;
let defaultDataInitPromise: Promise<void> | null = null;

export class StorageService {
  /**
   * Determina si el crédito actual de un cliente está ACTIVO y por tanto FIJADO
   * (sin poder editar, borrar ni cambiar mientras esté activo)
   */
  static isCreditActiveAndLocked(user: User): boolean {
    if (user.role === 'ADMIN' || user.role === 'WORKER') return false;
    return (
      user.creditStatus === 'ASIGNADO' &&
      user.availableBalance > 0 &&
      user.paymentStatus !== 'PAZ_Y_SALVO' &&
      user.paymentStatus !== 'SIN_ACEPTAR'
    );
  }

  /**
   * Calcula y estructura todos los componentes obligatorios del crédito de una persona:
   * - Monto principal (crédito desembolsado)
   * - Interés (intereses de ganancia de la empresa)
   * - Fianza
   * - Firma electrónica
   * - Gastos de cobranza
   * - IVA
   * - Fecha límite de pago
   * - Pago total
   */
  static buildFixedLoanBreakdown(params: {
    tramiteId?: string;
    principalAmount: number;
    termMonths?: number;
    interestRatePercentage?: number;
    interestAmount?: number;
    fianzaPercentage?: number;
    fianzaAmount?: number;
    electronicSignatureFee?: number;
    electronicSignatureCode?: string;
    collectionExpenses?: number;
    ivaPercentage?: number;
    ivaAmount?: number;
    paymentDeadline?: string;
    totalPaymentAmountOverride?: number;
    lockedAt?: string;
    isLockedWhileActive?: boolean;
  }): LoanFinancialBreakdown {
    const settings = this.getLoanSettings();
    const resolvedTramiteId = (params.tramiteId || 'TRM-100000').trim();
    const principalAmount = Math.max(0, Math.round(Number(params.principalAmount) || 0));
    const termMonths = Math.max(1, Math.round(Number(params.termMonths || settings.defaultTermMonths || 12)));
    const interestRatePercentage = Number(
      params.interestRatePercentage ?? settings.monthlyInterestRate ?? 1.85
    );
    const fianzaPercentage = Number(
      params.fianzaPercentage ?? settings.fianzaPercentage ?? 6.5
    );
    const ivaPercentage = Number(
      params.ivaPercentage ?? settings.taxPercentage ?? 19
    );

    const interestAmount =
      params.interestAmount !== undefined
        ? Math.max(0, Math.round(Number(params.interestAmount)))
        : Math.round(principalAmount * (interestRatePercentage / 100) * termMonths);

    const fianzaAmount =
      params.fianzaAmount !== undefined
        ? Math.max(0, Math.round(Number(params.fianzaAmount)))
        : Math.round(principalAmount * (fianzaPercentage / 100));

    const electronicSignatureFee =
      params.electronicSignatureFee !== undefined
        ? Math.max(0, Math.round(Number(params.electronicSignatureFee)))
        : Math.round(Number(settings.electronicSignatureFee ?? 28500));

    const collectionExpenses =
      params.collectionExpenses !== undefined
        ? Math.max(0, Math.round(Number(params.collectionExpenses)))
        : Math.round(Number(settings.collectionExpensesDefault ?? 0));

    const ivaAmount =
      params.ivaAmount !== undefined
        ? Math.max(0, Math.round(Number(params.ivaAmount)))
        : Math.round(
            (fianzaAmount + electronicSignatureFee + collectionExpenses) *
              (ivaPercentage / 100)
          );

    const computedSum =
      principalAmount +
      interestAmount +
      fianzaAmount +
      electronicSignatureFee +
      collectionExpenses +
      ivaAmount;

    const totalPaymentAmount =
      params.totalPaymentAmountOverride !== undefined &&
      params.totalPaymentAmountOverride > 0
        ? Math.round(params.totalPaymentAmountOverride)
        : computedSum;

    const defaultDeadline = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .split('T')[0];

    const paymentDeadline =
      (params.paymentDeadline || '').trim() || defaultDeadline;

    const electronicSignatureCode =
      (params.electronicSignatureCode || '').trim() ||
      `FIRMA-OTP-${resolvedTramiteId.replace(/[^A-Z0-9]/gi, '').slice(-6)}`;

    const monthlyInstallmentAmount = Math.round(
      totalPaymentAmount / Math.max(1, termMonths)
    );

    return {
      tramiteId: resolvedTramiteId,
      principalAmount,
      interestAmount,
      interestRatePercentage,
      fianzaAmount,
      fianzaPercentage,
      electronicSignatureFee,
      electronicSignatureCode,
      collectionExpenses,
      ivaAmount,
      ivaPercentage,
      paymentDeadline,
      totalPaymentAmount,
      termMonths,
      monthlyInstallmentAmount,
      lockedAt: params.lockedAt || new Date().toISOString(),
      isLockedWhileActive:
        params.isLockedWhileActive !== undefined
          ? params.isLockedWhileActive
          : true
    };
  }

  /**
   * Garantiza que un usuario cliente tenga su activeLoanBreakdown y previousLoans completos
   */
  private static normalizeClientLoanBreakdown(user: User): User {
    if (user.role === 'ADMIN' || user.role === 'WORKER') return user;

    const isActive = this.isCreditActiveAndLocked(user);
    const termMonths = user.loanTermMonths || 12;

    let activeBreakdown = user.activeLoanBreakdown;
    if (!activeBreakdown) {
      // Si el usuario tiene un crédito asignado (ej. semilla $18.500.000 de pago total o principal),
      // estructuramos su desglose exacto para que la suma cuadre con el Pago Total del crédito
      const targetTotal =
        user.creditLimit > 0
          ? Math.max(user.creditLimit, user.availableBalance)
          : 12000000;
      const principal = Math.round(targetTotal / 1.305 / 10000) * 10000;
      const fianza = Math.round(principal * 0.065);
      const firma = 28500;
      const cobranza =
        user.paymentStatus === 'EN_MORA' || (user.daysOverdue || 0) > 0
          ? Math.round(principal * 0.028)
          : 0;
      const iva = Math.round((fianza + firma + cobranza) * 0.19);
      const interest = Math.max(
        0,
        targetTotal - (principal + fianza + firma + cobranza + iva)
      );

      activeBreakdown = this.buildFixedLoanBreakdown({
        tramiteId: user.creditTramiteId || 'TRM-100000',
        principalAmount: principal,
        termMonths,
        interestRatePercentage: user.interestRateApplied ?? 1.85,
        interestAmount: interest,
        fianzaPercentage: 6.5,
        fianzaAmount: fianza,
        electronicSignatureFee: firma,
        electronicSignatureCode: user.legalSignature?.otpCode
          ? `OTP-${user.legalSignature.otpCode} (${user.legalSignature.signatureId})`
          : `FIRMA-OTP-${user.creditTramiteId}`,
        collectionExpenses: cobranza,
        ivaPercentage: 19,
        ivaAmount: iva,
        paymentDeadline: user.nextPaymentDate || '2026-11-16',
        totalPaymentAmountOverride: targetTotal,
        lockedAt: user.creditAssignedDate || user.createdAt || new Date().toISOString(),
        isLockedWhileActive: isActive
      });
    } else {
      activeBreakdown = {
        ...activeBreakdown,
        isLockedWhileActive: isActive
      };
    }

    const normalizedPreviousLoans = (user.previousLoans || []).map(prev => {
      if (
        prev.principalAmount !== undefined &&
        prev.interestAmount !== undefined &&
        prev.fianzaAmount !== undefined &&
        prev.electronicSignatureFee !== undefined &&
        prev.collectionExpenses !== undefined &&
        prev.ivaAmount !== undefined &&
        prev.totalPaymentAmount !== undefined
      ) {
        return prev;
      }
      const principal = prev.amountGranted || 5000000;
      const fianza = Math.round(principal * 0.065);
      const firma = 28500;
      const cobranza =
        prev.paymentBehavior === 'CON_MORA_SUPERADA'
          ? Math.round(principal * 0.028)
          : 0;
      const iva = Math.round((fianza + firma + cobranza) * 0.19);
      const totalPaid =
        prev.totalPaid && prev.totalPaid > principal
          ? prev.totalPaid
          : principal +
            Math.round(principal * ((prev.interestRateApplied || 1.85) / 100) * (prev.termMonths || 12)) +
            fianza +
            firma +
            cobranza +
            iva;
      const interest = Math.max(
        0,
        totalPaid - (principal + fianza + firma + cobranza + iva)
      );

      return {
        ...prev,
        principalAmount: principal,
        interestAmount: interest,
        fianzaAmount: fianza,
        electronicSignatureFee: firma,
        electronicSignatureCode: `FIRMA-OTP-${prev.tramiteId}`,
        collectionExpenses: cobranza,
        ivaAmount: iva,
        paymentDeadline: prev.closedDate || prev.startDate,
        totalPaymentAmount: totalPaid,
        totalPaid
      };
    });

    return {
      ...user,
      activeLoanBreakdown: activeBreakdown,
      previousLoans: normalizedPreviousLoans
    };
  }

  /**
   * Obtiene los Datos Generales de Préstamos desde la bóveda en memoria sincronizada con almacenamiento cifrado AES-256-GCM
   */
  static getLoanSettings(): LoanGeneralSettings {
    return { ...memoryLoanSettingsCache };
  }

  /**
   * Actualiza los Datos Generales de Préstamos desde el Panel Admin (100% cifrado en localStorage)
   */
  static async updateLoanSettings(
    newSettings: Partial<LoanGeneralSettings>,
    adminName: string
  ): Promise<{ success: boolean; settings: LoanGeneralSettings; message: string }> {
    const current = this.getLoanSettings();
    const updated: LoanGeneralSettings = {
      ...current,
      ...newSettings,
      updatedAt: new Date().toISOString(),
      updatedBy: adminName
    };
    memoryLoanSettingsCache = updated;
    await setEncryptedStorageItem(LOAN_SETTINGS_STORAGE_KEY, updated);

    await this.addAuditEntry(
      'GENERAL_LOAN_SETTINGS_UPDATED',
      'usr-admin-master',
      'ADMINIULEP',
      `Parámetros generales de préstamos actualizados por ${adminName}: IVA=${updated.taxPercentage}%, Interés Mensual=${updated.monthlyInterestRate}%, Fianza=${updated.fianzaPercentage ?? 6.5}%, Firma Electrónica=$${(updated.electronicSignatureFee ?? 28500).toLocaleString('es-CO')}, Mora=${updated.lateFeePercentage}%.`
    );

    return {
      success: true,
      settings: updated,
      message: 'Datos generales de préstamos e impuestos actualizados correctamente.'
    };
  }

  /**
   * Inicializa datos semilla protegidos criptográficamente (Zero-Plaintext Policy) si no existen
   */
  static async initializeDefaultData(): Promise<void> {
    if (isDefaultDataInitialized) return;
    if (defaultDataInitPromise) return defaultDataInitPromise;

    defaultDataInitPromise = (async () => {
      try {
        const storedLoanSettings = await getEncryptedStorageItem<LoanGeneralSettings>(
          LOAN_SETTINGS_STORAGE_KEY
        );
        if (storedLoanSettings) {
          memoryLoanSettingsCache = { ...DEFAULT_LOAN_SETTINGS, ...storedLoanSettings };
        } else {
          memoryLoanSettingsCache = { ...DEFAULT_LOAN_SETTINGS };
          await setEncryptedStorageItem(LOAN_SETTINGS_STORAGE_KEY, memoryLoanSettingsCache);
        }

        const decryptedUsers = await getEncryptedStorageItem<User[]>(USERS_STORAGE_KEY);
        let users: User[] = Array.isArray(decryptedUsers) ? decryptedUsers : [];

        // 1. Garantizar que el Administrador Principal (ADMINIULEP) siempre exista
        const adminCedula = 'ADMINIULEP';
        const adminExists = users.some(u => u.cedula.toUpperCase() === adminCedula);

        if (!adminExists) {
          const adminPassHash = await hashPassword('ADMINIULEP', adminCedula);
          const adminUserBase: Omit<User, 'integrityChecksum'> = {
            id: 'usr-admin-master',
            cedula: adminCedula,
            fullName: 'Administrador General ULEP',
            email: 'admin@crediulep.com',
            phone: '+57 300 999 8888',
            passwordHash: adminPassHash,
            role: 'ADMIN',
            workerPermissions: [
              'CREAR_USUARIOS',
              'APROBAR_CREDITOS',
              'RECHAZAR_CREDITOS',
              'VER_AUDITORIA',
              'CONFIGURAR_SISTEMA'
            ],
            isActive: true,
            createdAt: '2026-10-15T08:00:00Z',
            twoFactorEnabled: true,
            creditStatus: 'ASIGNADO',
            availableBalance: 0,
            creditLimit: 0,
            creditTramiteId: 'ADM-001',
            acceptedPrivacyPolicy: true,
            acceptedPrivacyDate: '2026-10-15T08:00:00Z',
            failedLoginAttempts: 0
          };
          const adminChecksum = await calculateUserIntegrityChecksum(adminUserBase);
          users.unshift({ ...adminUserBase, integrityChecksum: adminChecksum });
        }

        // 2. Semillas de Clientes de Demostración (Al Día, En Mora y Sin Aceptar)
        const valPreviousLoans: PreviousLoanRecord[] = [
          {
            id: 'prev-val-01',
            tramiteId: 'TRM-410290',
            amountGranted: 8000000,
            totalPaid: 10421915,
            termMonths: 12,
            taxPercentageApplied: 19,
            interestRateApplied: 1.85,
            startDate: '2024-06-10',
            closedDate: '2025-06-08',
            finalStatus: 'PAZ_Y_SALVO',
            paymentBehavior: 'EXCELENTE',
            principalAmount: 8000000,
            interestAmount: 1776000,
            fianzaAmount: 520000,
            electronicSignatureFee: 28500,
            electronicSignatureCode: 'OTP-410290 (SIG-VAL-2024)',
            collectionExpenses: 0,
            ivaAmount: 97415,
            paymentDeadline: '2025-06-08',
            totalPaymentAmount: 10421915
          },
          {
            id: 'prev-val-02',
            tramiteId: 'TRM-652811',
            amountGranted: 12500000,
            totalPaid: 16278040,
            termMonths: 12,
            taxPercentageApplied: 19,
            interestRateApplied: 1.85,
            startDate: '2025-07-15',
            closedDate: '2026-07-12',
            finalStatus: 'PAZ_Y_SALVO',
            paymentBehavior: 'EXCELENTE',
            principalAmount: 12500000,
            interestAmount: 2775000,
            fianzaAmount: 812500,
            electronicSignatureFee: 28500,
            electronicSignatureCode: 'OTP-652811 (SIG-VAL-2025)',
            collectionExpenses: 0,
            ivaAmount: 162040,
            paymentDeadline: '2026-07-12',
            totalPaymentAmount: 16278040
          }
        ];

        // 2.1 Cliente con Crédito AL DÍA
        const valIndex = users.findIndex(u => u.cedula === '1020304050');
        if (valIndex === -1) {
          const cedula1 = '1020304050';
          const passHash1 = await hashPassword('Password123!', cedula1);
          const valBreakdown = this.buildFixedLoanBreakdown({
            tramiteId: 'TRM-884210',
            principalAmount: 14180000,
            termMonths: 12,
            interestRatePercentage: 1.85,
            interestAmount: 3189624,
            fianzaPercentage: 6.5,
            fianzaAmount: 921700,
            electronicSignatureFee: 28500,
            electronicSignatureCode: 'OTP-849201 (SIG-VAL-88210)',
            collectionExpenses: 0,
            ivaPercentage: 19,
            ivaAmount: 180176,
            paymentDeadline: '2026-11-16',
            totalPaymentAmountOverride: 18500000,
            lockedAt: '2026-10-16T10:02:15Z',
            isLockedWhileActive: true
          });
          const user1Base: Omit<User, 'integrityChecksum'> = {
            id: 'usr-val-001',
            cedula: cedula1,
            fullName: 'Valentina Ríos Gómez',
            email: 'v.rios@seguro.com',
            phone: '+57 312 458 9012',
            passwordHash: passHash1,
            role: 'CLIENT',
            isActive: true,
            createdAt: '2026-10-16T10:00:00Z',
            twoFactorEnabled: true,
            creditStatus: 'ASIGNADO',
            availableBalance: 18500000,
            creditLimit: 18500000,
            creditAssignedDate: '2026-10-16',
            creditTramiteId: 'TRM-884210',
            paymentStatus: 'AL_DIA',
            daysOverdue: 0,
            loanTermMonths: 12,
            customInstallmentAmount: 1541667,
            nextPaymentDate: '2026-11-16',
            taxPercentageApplied: 19,
            interestRateApplied: 1.85,
            activeLoanBreakdown: valBreakdown,
            previousLoans: valPreviousLoans,
            acceptedPrivacyPolicy: true,
            acceptedPrivacyDate: '2026-10-16T10:00:00Z',
            failedLoginAttempts: 0,
            legalSignature: {
              signatureId: 'SIG-VAL-88210',
              phoneVerified: '+57 312 458 9012',
              otpCode: '849201',
              signedAt: '2026-10-16T10:02:15Z',
              ipAddress: '190.25.144.82',
              userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0',
              platform: 'Win32 / Desktop',
              screenResolution: '1920x1080',
              language: 'es-CO',
              signatureHash: 'a7c9f82e1d044bb78921e56cf7891234abcd5678ef0123456789abcdef012345',
              firestoreSynced: true,
              firestoreDocId: 'firestore_vault_val_88210',
              acceptedPolicies: {
                termsAndConditions: true,
                privacyPolicy: true,
                financialDataConsent: true,
                otpElectronicSignatureAgreement: true,
                version: 'v2026.1 - Políticas de Protección y Contrato Financiero',
                acceptedAt: '2026-10-16T10:02:15Z'
              }
            }
          };
          const checksum1 = await calculateUserIntegrityChecksum(user1Base);
          users.push({ ...user1Base, integrityChecksum: checksum1 });
        }

        // 2.2 Cliente con Crédito EN MORA
        const moraPreviousLoans: PreviousLoanRecord[] = [
          {
            id: 'prev-mor-01',
            tramiteId: 'TRM-319402',
            amountGranted: 6500000,
            totalPaid: 7746365,
            termMonths: 6,
            taxPercentageApplied: 19,
            interestRateApplied: 1.85,
            startDate: '2025-11-05',
            closedDate: '2026-05-05',
            finalStatus: 'PAZ_Y_SALVO',
            paymentBehavior: 'PUNTUAL',
            principalAmount: 6500000,
            interestAmount: 721500,
            fianzaAmount: 422500,
            electronicSignatureFee: 28500,
            electronicSignatureCode: 'OTP-319402 (SIG-MOR-2025)',
            collectionExpenses: 0,
            ivaAmount: 73865,
            paymentDeadline: '2026-05-05',
            totalPaymentAmount: 7746365
          }
        ];
        const moraIndex = users.findIndex(u => u.cedula === '1030405060');
        if (moraIndex === -1) {
          const cedulaMora = '1030405060';
          const passHashMora = await hashPassword('Password123!', cedulaMora);
          const moraBreakdown = this.buildFixedLoanBreakdown({
            tramiteId: 'TRM-772190',
            principalAmount: 9000000,
            termMonths: 12,
            interestRatePercentage: 1.85,
            interestAmount: 1978480,
            fianzaPercentage: 6.5,
            fianzaAmount: 585000,
            electronicSignatureFee: 28500,
            electronicSignatureCode: 'OTP-514892 (SIG-MOR-77219)',
            collectionExpenses: 252000,
            ivaPercentage: 19,
            ivaAmount: 156020,
            paymentDeadline: '2026-09-04',
            totalPaymentAmountOverride: 12000000,
            lockedAt: '2026-08-10T09:16:30Z',
            isLockedWhileActive: true
          });
          const userMoraBase: Omit<User, 'integrityChecksum'> = {
            id: 'usr-mora-003',
            cedula: cedulaMora,
            fullName: 'Andrés Felipe Morales',
            email: 'a.morales@seguro.com',
            phone: '+57 315 880 3344',
            passwordHash: passHashMora,
            role: 'CLIENT',
            isActive: true,
            createdAt: '2026-08-10T09:15:00Z',
            twoFactorEnabled: true,
            creditStatus: 'ASIGNADO',
            availableBalance: 11200000,
            creditLimit: 12000000,
            creditAssignedDate: '2026-08-10',
            creditTramiteId: 'TRM-772190',
            paymentStatus: 'EN_MORA',
            daysOverdue: 45,
            loanTermMonths: 12,
            customInstallmentAmount: 1000000,
            nextPaymentDate: '2026-09-04',
            taxPercentageApplied: 19,
            interestRateApplied: 1.85,
            activeLoanBreakdown: moraBreakdown,
            previousLoans: moraPreviousLoans,
            acceptedPrivacyPolicy: true,
            acceptedPrivacyDate: '2026-08-10T09:15:00Z',
            failedLoginAttempts: 0,
            legalSignature: {
              signatureId: 'SIG-MOR-77219',
              phoneVerified: '+57 315 880 3344',
              otpCode: '514892',
              signedAt: '2026-08-10T09:16:30Z',
              ipAddress: '181.50.112.40',
              userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0',
              platform: 'Win32 / Desktop',
              screenResolution: '1920x1080',
              language: 'es-CO',
              signatureHash: 'b4d2c99182fa1c149afbf4c8996fb92427ae41e4649b934ca495991b7852a111',
              firestoreSynced: true,
              firestoreDocId: 'firestore_vault_mor_77219',
              acceptedPolicies: {
                termsAndConditions: true,
                privacyPolicy: true,
                financialDataConsent: true,
                otpElectronicSignatureAgreement: true,
                version: 'v2026.1 - Políticas de Protección y Contrato Financiero',
                acceptedAt: '2026-08-10T09:16:30Z'
              }
            }
          };
          const checksumMora = await calculateUserIntegrityChecksum(userMoraBase);
          users.push({ ...userMoraBase, integrityChecksum: checksumMora });
        }

        // 2.3 Cliente con Crédito SIN ACEPTAR (PENDIENTE)
        const matIndex = users.findIndex(u => u.cedula === '9876543210');
        if (matIndex === -1) {
          const cedula2 = '9876543210';
          const passHash2 = await hashPassword('Password123!', cedula2);
          const matBreakdown = this.buildFixedLoanBreakdown({
            tramiteId: 'TRM-993104',
            principalAmount: 12000000,
            termMonths: 12,
            interestRatePercentage: 1.85,
            fianzaPercentage: 6.5,
            electronicSignatureFee: 28500,
            electronicSignatureCode: 'OTP-621908 (SIG-MAT-99104)',
            collectionExpenses: 0,
            ivaPercentage: 19,
            paymentDeadline: '2026-11-24',
            lockedAt: '2026-10-18T14:31:40Z',
            isLockedWhileActive: false
          });
          const user2Base: Omit<User, 'integrityChecksum'> = {
            id: 'usr-mat-002',
            cedula: cedula2,
            fullName: 'Mateo Restrepo Cárdenas',
            email: 'm.restrepo@seguro.com',
            phone: '+57 301 987 6543',
            passwordHash: passHash2,
            role: 'CLIENT',
            isActive: true,
            createdAt: '2026-10-18T14:30:00Z',
            twoFactorEnabled: true,
            creditStatus: 'PENDIENTE',
            availableBalance: 0,
            creditLimit: 12000000,
            creditEstimatedDate: '2026-10-24',
            creditTramiteId: 'TRM-993104',
            paymentStatus: 'SIN_ACEPTAR',
            daysOverdue: 0,
            loanTermMonths: 12,
            customInstallmentAmount: matBreakdown.monthlyInstallmentAmount,
            activeLoanBreakdown: matBreakdown,
            acceptedPrivacyPolicy: true,
            acceptedPrivacyDate: '2026-10-18T14:30:00Z',
            failedLoginAttempts: 0,
            legalSignature: {
              signatureId: 'SIG-MAT-99104',
              phoneVerified: '+57 301 987 6543',
              otpCode: '621908',
              signedAt: '2026-10-18T14:31:40Z',
              ipAddress: '186.84.90.115',
              userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
              platform: 'iPhone / Mobile Safari',
              screenResolution: '393x852',
              language: 'es-ES',
              signatureHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
              firestoreSynced: true,
              firestoreDocId: 'firestore_vault_mat_99104',
              acceptedPolicies: {
                termsAndConditions: true,
                privacyPolicy: true,
                financialDataConsent: true,
                otpElectronicSignatureAgreement: true,
                version: 'v2026.1 - Políticas de Protección y Contrato Financiero',
                acceptedAt: '2026-10-18T14:31:40Z'
              }
            }
          };
          const checksum2 = await calculateUserIntegrityChecksum(user2Base);
          users.push({ ...user2Base, integrityChecksum: checksum2 });
        }

        // 2.4 Cliente con Cupo Aprobado y Solicitud de Desembolso Pendiente de Aprobar
        const lauraIndex = users.findIndex(u => u.cedula === '1040506070');
        if (lauraIndex === -1) {
          const cedulaLaura = '1040506070';
          const passHashLaura = await hashPassword('Password123!', cedulaLaura);
          const lauraBreakdown = this.buildFixedLoanBreakdown({
            tramiteId: 'TRM-554120',
            principalAmount: 10000000,
            termMonths: 12,
            interestRatePercentage: 1.85,
            fianzaPercentage: 6.5,
            electronicSignatureFee: 28500,
            electronicSignatureCode: 'OTP-774102 (SIG-LAU-55412)',
            collectionExpenses: 0,
            ivaPercentage: 19,
            paymentDeadline: '2026-11-25',
            lockedAt: '2026-10-20T11:20:00Z',
            isLockedWhileActive: false
          });
          const userLauraBase: Omit<User, 'integrityChecksum'> = {
            id: 'usr-lau-004',
            cedula: cedulaLaura,
            fullName: 'Laura Sofía Mendoza',
            email: 'l.mendoza@seguro.com',
            phone: '+57 318 440 2211',
            passwordHash: passHashLaura,
            role: 'CLIENT',
            isActive: true,
            createdAt: '2026-10-20T11:00:00Z',
            twoFactorEnabled: true,
            creditStatus: 'ASIGNADO',
            availableBalance: 0,
            creditLimit: 15000000,
            creditAssignedDate: '2026-10-20',
            creditTramiteId: 'TRM-554120',
            paymentStatus: 'EN_DESEMBOLSO',
            daysOverdue: 0,
            loanTermMonths: 12,
            customInstallmentAmount: lauraBreakdown.monthlyInstallmentAmount,
            nextPaymentDate: '2026-11-25',
            taxPercentageApplied: 19,
            interestRateApplied: 1.85,
            activeLoanBreakdown: lauraBreakdown,
            disbursementRequest: {
              tramiteId: 'TRM-554120',
              requestedAmount: 10000000,
              requestedTermMonths: 12,
              estimatedMonthlyInstallment: lauraBreakdown.monthlyInstallmentAmount,
              bankEntity: 'Bancolombia',
              accountType: 'AHORROS',
              accountNumber: '4590-7712-9081',
              otpCodeSigned: '774102',
              signatureHash: 'c8f1e44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852d901',
              signedAt: '2026-10-20T11:20:00Z',
              acceptedTerms: true,
              acceptedPromissoryNote: true,
              acceptedBankMandate: true,
              bankApiReference: 'ACH-BANC-554120',
              status: 'EN_PROCESO_DESEMBOLSO',
              loanBreakdown: lauraBreakdown
            },
            acceptedPrivacyPolicy: true,
            acceptedPrivacyDate: '2026-10-20T11:00:00Z',
            failedLoginAttempts: 0
          };
          const checksumLaura = await calculateUserIntegrityChecksum(userLauraBase);
          users.push({ ...userLauraBase, integrityChecksum: checksumLaura });
        }

        // 3. Semilla de Trabajador / Operador
        const workerExists = users.some(u => u.cedula === 'OP-2001');
        if (!workerExists) {
          const workerCedula = 'OP-2001';
          const workerPass = await hashPassword('Worker123!', workerCedula);
          const workerBase: Omit<User, 'integrityChecksum'> = {
            id: 'usr-wrk-001',
            cedula: workerCedula,
            fullName: 'Carlos Andrés Méndez',
            email: 'c.mendez@crediulep.com',
            phone: '+57 310 555 7788',
            passwordHash: workerPass,
            role: 'WORKER',
            workerPermissions: ['CREAR_USUARIOS', 'APROBAR_CREDITOS', 'RECHAZAR_CREDITOS', 'CONFIGURAR_SISTEMA'],
            isActive: true,
            createdAt: '2026-10-17T09:00:00Z',
            twoFactorEnabled: true,
            creditStatus: 'ASIGNADO',
            availableBalance: 0,
            creditLimit: 0,
            creditTramiteId: 'OP-01',
            acceptedPrivacyPolicy: true,
            acceptedPrivacyDate: '2026-10-17T09:00:00Z',
            failedLoginAttempts: 0
          };
          const checksumWorker = await calculateUserIntegrityChecksum(workerBase);
          users.push({ ...workerBase, integrityChecksum: checksumWorker });
        }

        // Normalizar desglose de todos los clientes existentes
        for (let i = 0; i < users.length; i++) {
          const normalized = this.normalizeClientLoanBreakdown(users[i]);
          const { integrityChecksum, ...base } = normalized;
          const checksum = await calculateUserIntegrityChecksum(base);
          users[i] = { ...base, integrityChecksum: checksum };
        }

        memoryUsersCache = users;
        await setEncryptedStorageItem(USERS_STORAGE_KEY, users);

    // Inicializar Auditoría Inmutable si no existe
    const existingAudit = await getEncryptedStorageItem<AuditBlock[]>(AUDIT_STORAGE_KEY);
    let auditChain: AuditBlock[] = Array.isArray(existingAudit) ? existingAudit : [];
    if (auditChain.length === 0) {
      const genesisTimestamp = new Date().toISOString();
      const genesisHash = await calculateBlockAuditHash(
        0,
        genesisTimestamp,
        'SYSTEM_GENESIS_INITIALIZATION',
        'SYSTEM',
        'Sistema de auditoría CrediULEP inicializado con roles y permisos de acceso',
        '0'
      );

      const genesisBlock: AuditBlock = {
        index: 0,
        timestamp: genesisTimestamp,
        action: 'SYSTEM_GENESIS_INITIALIZATION',
        userId: 'SYSTEM',
        userCedula: 'SYSTEM',
        details: 'Sistema de auditoría CrediULEP inicializado con roles y permisos de acceso',
        previousHash: '0',
        hash: genesisHash
      };

      auditChain = [genesisBlock];
      await setEncryptedStorageItem(AUDIT_STORAGE_KEY, auditChain);
    }

    // Sincronización única y controlada con la bóveda cifrada
    FirebaseService.syncAllUsers(users).catch(() => {});
    if (auditChain.length > 0) {
      FirebaseService.syncAllAuditBlocks(auditChain).catch(() => {});
    }
    isDefaultDataInitialized = true;
      } finally {
        defaultDataInitPromise = null;
      }
    })();

    return defaultDataInitPromise;
  }

  /**
   * Obtiene todos los usuarios descifrando el sobre AES-256-GCM y verifica su integridad criptográfica
   */
  static async getUsers(): Promise<{ users: User[]; tamperedUsers: string[] }> {
    await this.initializeDefaultData();
    const storedLoanSettings = await getEncryptedStorageItem<LoanGeneralSettings>(
      LOAN_SETTINGS_STORAGE_KEY
    );
    if (storedLoanSettings) {
      memoryLoanSettingsCache = { ...DEFAULT_LOAN_SETTINGS, ...storedLoanSettings };
    }
    const decryptedUsers = await getEncryptedStorageItem<User[]>(USERS_STORAGE_KEY);
    const users: User[] = Array.isArray(decryptedUsers)
      ? decryptedUsers
      : memoryUsersCache || [];
    if (users.length === 0) return { users: [], tamperedUsers: [] };

    try {
      memoryUsersCache = users;
      const tamperedUsers: string[] = [];

      for (const u of users) {
        this.normalizeClientLoanBreakdown(u);
        const isValid = await verifyUserIntegrity(u);
        if (!isValid) {
          tamperedUsers.push(u.cedula);
        }
      }

      return { users, tamperedUsers };
    } catch {
      return { users: [], tamperedUsers: [] };
    }
  }

  /**
   * Busca un usuario por Cédula (insensible a mayúsculas para cédulas tipo ADMINIULEP)
   */
  static async getUserByCedula(cedula: string): Promise<{ user: User | null; isTampered: boolean }> {
    const { users, tamperedUsers } = await this.getUsers();
    const cleanCedula = cedula.trim().toUpperCase();
    const user = users.find(u => u.cedula.trim().toUpperCase() === cleanCedula) || null;

    if (user && tamperedUsers.includes(user.cedula)) {
      return { user: null, isTampered: true };
    }

    return { user, isTampered: false };
  }

  /**
   * Valida credenciales (Cédula y Contraseña) con protección anti-fuerza bruta
   */
  static async validateCredentials(cedula: string, password: string): Promise<{
    success: boolean;
    user?: User;
    errorType?: 'NOT_FOUND' | 'PASSWORD_INCORRECT' | 'LOCKED' | 'TAMPERED';
    message: string;
    lockSecondsLeft?: number;
  }> {
    const { user, isTampered } = await this.getUserByCedula(cedula);

    if (isTampered) {
      await this.addAuditEntry(
        'SECURITY_TAMPER_DETECTED',
        'UNKNOWN',
        cedula,
        'ALERTA CRÍTICA: Intento de acceso a cuenta con datos manipulados en cliente.'
      );
      return {
        success: false,
        errorType: 'TAMPERED',
        message: 'ALERTA DE SEGURIDAD: Inconsistencia de datos detectada en esta cuenta.'
      };
    }

    if (!user) {
      return {
        success: false,
        errorType: 'NOT_FOUND',
        message: 'No existe ninguna cuenta registrada con esta Cédula.'
      };
    }

    // Comprobar bloqueo por intentos fallidos
    const now = Date.now();
    if (user.lockedUntil && user.lockedUntil > now) {
      const secondsLeft = Math.ceil((user.lockedUntil - now) / 1000);
      return {
        success: false,
        errorType: 'LOCKED',
        lockSecondsLeft: secondsLeft,
        message: `Cuenta bloqueada temporalmente. Intente en ${secondsLeft} segundos.`
      };
    }

    // Comprobar contraseña
    const incomingHash = await hashPassword(password, user.cedula);
    if (incomingHash !== user.passwordHash) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      let lockedUntil: number | undefined = undefined;

      if (attempts >= 3) {
        lockedUntil = Date.now() + 60 * 1000;
      }

      await this.updateUserDirectly({
        ...user,
        failedLoginAttempts: attempts,
        lockedUntil
      });

      await this.addAuditEntry(
        'LOGIN_FAILED',
        user.id,
        user.cedula,
        `Contraseña errónea. Intento #${attempts}.`
      );

      return {
        success: false,
        errorType: 'PASSWORD_INCORRECT',
        message: attempts >= 3
          ? 'Has excedido los intentos permitidos. Cuenta bloqueada por 60 segundos.'
          : `Contraseña incorrecta. Te quedan ${3 - attempts} intento(s).`
      };
    }

    // Reiniciar intentos
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.updateUserDirectly({
        ...user,
        failedLoginAttempts: 0,
        lockedUntil: undefined
      });
    }

    return {
      success: true,
      user,
      message: 'Credenciales validadas. Requiere verificación de segundo factor (2FA).'
    };
  }

  /**
   * Registra un cliente de forma pública o por formulario, calculando y fijando el desglose del crédito si nace activo
   */
  static async registerUser(params: {
    cedula: string;
    fullName: string;
    email: string;
    phone: string;
    password: string;
    creditStatus: CreditStatus;
    initialBalance?: number;
    role?: 'CLIENT' | 'WORKER';
    workerPermissions?: WorkerPermission[];
    legalSignature?: LegalSignatureRecord;
    loanParams?: {
      principalAmount?: number;
      termMonths?: number;
      interestAmount?: number;
      fianzaAmount?: number;
      electronicSignatureFee?: number;
      electronicSignatureCode?: string;
      collectionExpenses?: number;
      ivaAmount?: number;
      paymentDeadline?: string;
    };
  }): Promise<{ success: boolean; message: string; user?: User }> {
    const { users } = await this.getUsers();
    const cleanCedula = params.cedula.trim().toUpperCase();

    if (users.some(u => u.cedula.trim().toUpperCase() === cleanCedula)) {
      return { success: false, message: 'La cédula ingresada ya se encuentra registrada.' };
    }

    const passwordHash = await hashPassword(params.password, params.cedula.trim());
    const creditTramiteId = 'TRM-' + Math.floor(100000 + Math.random() * 900000);
    const role = params.role || 'CLIENT';
    const settings = this.getLoanSettings();

    const principalAmount =
      params.loanParams?.principalAmount ??
      params.initialBalance ??
      10000000;
    const termMonths =
      params.loanParams?.termMonths ?? settings.defaultTermMonths ?? 12;

    const breakdown =
      role === 'CLIENT'
        ? this.buildFixedLoanBreakdown({
            tramiteId: creditTramiteId,
            principalAmount,
            termMonths,
            interestAmount: params.loanParams?.interestAmount,
            fianzaAmount: params.loanParams?.fianzaAmount,
            electronicSignatureFee: params.loanParams?.electronicSignatureFee,
            electronicSignatureCode:
              params.loanParams?.electronicSignatureCode ||
              (params.legalSignature?.otpCode
                ? `OTP-${params.legalSignature.otpCode} (${params.legalSignature.signatureId})`
                : `FIRMA-OTP-${creditTramiteId}`),
            collectionExpenses: params.loanParams?.collectionExpenses,
            ivaAmount: params.loanParams?.ivaAmount,
            paymentDeadline: params.loanParams?.paymentDeadline,
            isLockedWhileActive: params.creditStatus === 'ASIGNADO'
          })
        : undefined;

    const availableBalance =
      role === 'CLIENT' && params.creditStatus === 'ASIGNADO' && breakdown
        ? breakdown.totalPaymentAmount
        : 0;

    const baseUser: Omit<User, 'integrityChecksum'> = {
      id: 'usr-' + Date.now(),
      cedula: params.cedula.trim(),
      fullName: params.fullName.trim(),
      email: params.email.trim().toLowerCase(),
      phone: params.phone.trim(),
      passwordHash,
      role,
      workerPermissions: params.workerPermissions || [],
      isActive: true,
      createdAt: new Date().toISOString(),
      twoFactorEnabled: true,
      creditStatus: params.creditStatus,
      availableBalance,
      creditLimit:
        role === 'CLIENT' && breakdown ? breakdown.principalAmount : 0,
      creditAssignedDate:
        params.creditStatus === 'ASIGNADO'
          ? new Date().toISOString().split('T')[0]
          : undefined,
      creditEstimatedDate:
        params.creditStatus === 'PENDIENTE' ? 'En evaluación' : undefined,
      creditTramiteId,
      paymentStatus:
        role === 'CLIENT'
          ? params.creditStatus === 'ASIGNADO'
            ? 'AL_DIA'
            : 'SIN_ACEPTAR'
          : undefined,
      daysOverdue: 0,
      loanTermMonths: termMonths,
      customInstallmentAmount: breakdown?.monthlyInstallmentAmount,
      nextPaymentDate: breakdown?.paymentDeadline,
      taxPercentageApplied: settings.taxPercentage,
      interestRateApplied: settings.monthlyInterestRate,
      activeLoanBreakdown: breakdown,
      acceptedPrivacyPolicy: true,
      acceptedPrivacyDate: new Date().toISOString(),
      failedLoginAttempts: 0,
      legalSignature: params.legalSignature
    };

    const integrityChecksum = await calculateUserIntegrityChecksum(baseUser);
    const newUser: User = { ...baseUser, integrityChecksum };

    users.push(newUser);
    memoryUsersCache = users;
    await setEncryptedStorageItem(USERS_STORAGE_KEY, users);

    // Sincronización cifrada en segundo plano con Firebase Firestore
    FirebaseService.saveEncryptedUser(newUser).catch(() => {});
    if (params.legalSignature) {
      FirebaseService.saveEncryptedLegalSignature(newUser.id, newUser.cedula, params.legalSignature).catch(() => {});
    }

    await this.addAuditEntry(
      'USER_REGISTRATION',
      newUser.id,
      newUser.cedula,
      `Nuevo ${role} registrado: ${newUser.fullName}. Estado de crédito: ${newUser.creditStatus}.${
        breakdown && params.creditStatus === 'ASIGNADO'
          ? ` Crédito FIJADO INMUTABLE: Principal=$${breakdown.principalAmount.toLocaleString('es-CO')}, Interés=$${breakdown.interestAmount.toLocaleString('es-CO')}, Fianza=$${breakdown.fianzaAmount.toLocaleString('es-CO')}, Firma=$${breakdown.electronicSignatureFee.toLocaleString('es-CO')}, Cobranza=$${breakdown.collectionExpenses.toLocaleString('es-CO')}, IVA=$${breakdown.ivaAmount.toLocaleString('es-CO')}, Límite Pago=${breakdown.paymentDeadline}, Pago Total=$${breakdown.totalPaymentAmount.toLocaleString('es-CO')}.`
          : ''
      }`
    );

    if (params.legalSignature) {
      await this.addAuditEntry(
        'LEGAL_OTP_SIGNATURE_REGISTERED',
        newUser.id,
        newUser.cedula,
        `Firma Electrónica OTP Certificada (${params.legalSignature.otpCode}) y políticas corporativas formalizadas desde IP ${params.legalSignature.ipAddress}. Sincronizado en Firestore.`
      );
    }

    return { success: true, message: 'Registro exitoso.', user: newUser };
  }

  /**
   * Crea y FIJA un crédito nuevo para un cliente existente.
   * REGLA FINTECH INMUTABLE: Si el cliente ya tiene un crédito activo, NO se puede editar, borrar ni cambiar mientras esté activo.
   */
  static async createAndLockClientCredit(
    userId: string,
    params: {
      principalAmount: number;
      termMonths?: number;
      interestRatePercentage?: number;
      interestAmount?: number;
      fianzaPercentage?: number;
      fianzaAmount?: number;
      electronicSignatureFee?: number;
      electronicSignatureCode?: string;
      collectionExpenses?: number;
      ivaPercentage?: number;
      ivaAmount?: number;
      paymentDeadline?: string;
    },
    actorName: string
  ): Promise<{ success: boolean; user?: User; message: string }> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
      return { success: false, message: 'Usuario no encontrado.' };
    }

    const user = users[index];
    if (this.isCreditActiveAndLocked(user)) {
      return {
        success: false,
        message:
          'BLOQUEO FINTECH: Este cliente ya tiene un crédito ACTIVO y FIJADO. No se puede editar, borrar ni cambiar mientras esté el crédito activo.'
      };
    }

    const loanSettings = this.getLoanSettings();
    const newTramiteId =
      user.creditStatus === 'PENDIENTE' && user.creditTramiteId
        ? user.creditTramiteId
        : 'TRM-' + Math.floor(100000 + Math.random() * 900000);

    const breakdown = this.buildFixedLoanBreakdown({
      tramiteId: newTramiteId,
      principalAmount: params.principalAmount,
      termMonths: params.termMonths || user.loanTermMonths || loanSettings.defaultTermMonths || 12,
      interestRatePercentage: params.interestRatePercentage,
      interestAmount: params.interestAmount,
      fianzaPercentage: params.fianzaPercentage,
      fianzaAmount: params.fianzaAmount,
      electronicSignatureFee: params.electronicSignatureFee,
      electronicSignatureCode:
        params.electronicSignatureCode ||
        (user.legalSignature?.otpCode
          ? `OTP-${user.legalSignature.otpCode}`
          : `FIRMA-OTP-${newTramiteId}`),
      collectionExpenses: params.collectionExpenses,
      ivaPercentage: params.ivaPercentage,
      ivaAmount: params.ivaAmount,
      paymentDeadline: params.paymentDeadline,
      isLockedWhileActive: true
    });

    const updatedUser: User = {
      ...user,
      creditStatus: 'ASIGNADO',
      paymentStatus: 'AL_DIA',
      creditTramiteId: newTramiteId,
      creditLimit: breakdown.principalAmount,
      availableBalance: breakdown.totalPaymentAmount,
      daysOverdue: 0,
      loanTermMonths: breakdown.termMonths,
      customInstallmentAmount: breakdown.monthlyInstallmentAmount,
      taxPercentageApplied: breakdown.ivaPercentage,
      interestRateApplied: breakdown.interestRatePercentage,
      creditAssignedDate: new Date().toISOString().split('T')[0],
      nextPaymentDate: breakdown.paymentDeadline,
      activeLoanBreakdown: breakdown,
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    await this.addAuditEntry(
      'NEW_CREDIT_CREATED_AND_LOCKED',
      user.id,
      user.cedula,
      `Nuevo crédito creado y FIJADO por ${actorName} (${newTramiteId}): Monto Principal Desembolsado=$${breakdown.principalAmount.toLocaleString('es-CO')}, Interés Empresa=$${breakdown.interestAmount.toLocaleString('es-CO')}, Fianza=$${breakdown.fianzaAmount.toLocaleString('es-CO')}, Firma Electrónica=$${breakdown.electronicSignatureFee.toLocaleString('es-CO')} (${breakdown.electronicSignatureCode}), Gastos Cobranza=$${breakdown.collectionExpenses.toLocaleString('es-CO')}, IVA=$${breakdown.ivaAmount.toLocaleString('es-CO')}, Fecha Límite=${breakdown.paymentDeadline}, Pago Total=$${breakdown.totalPaymentAmount.toLocaleString('es-CO')}. Bloqueado contra edición mientras esté activo.`
    );

    return {
      success: true,
      user: saved,
      message:
        'Crédito nuevo creado y FIJADO correctamente. No podrá ser editado, borrado ni cambiado mientras esté activo.'
    };
  }

  /**
   * Aprobación de CUPO por persona (Iniciando con Deuda en $0) por Administrador o Trabajador autorizado.
   * Al aprobarse el registro, se habilita únicamente el cupo del cliente iniciando en 0 de deuda,
   * para que el cliente pueda solicitar posteriormente su desembolso.
   */
  static async approveUserCredit(userId: string, newBalance: number, adminName: string): Promise<{ success: boolean; user?: User; message: string }> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
      return { success: false, message: 'Usuario no encontrado.' };
    }

    const user = users[index];
    if (this.isCreditActiveAndLocked(user)) {
      return {
        success: false,
        message:
          'BLOQUEO FINTECH: El crédito del cliente ya está ACTIVO y FIJADO con deuda vigente. No se puede editar mientras esté activo.'
      };
    }

    const approvedCupo =
      newBalance > 0
        ? Math.round(newBalance)
        : user.creditLimit > 0
        ? user.creditLimit
        : user.activeLoanBreakdown?.principalAmount || 10000000;

    const loanSettings = this.getLoanSettings();
    const tramiteId =
      user.creditTramiteId || 'TRM-' + Math.floor(100000 + Math.random() * 900000);
    const termMonths = user.loanTermMonths || loanSettings.defaultTermMonths || 12;
    const defaultDeadline =
      user.nextPaymentDate ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const cupoReferenceBreakdown = this.buildFixedLoanBreakdown({
      tramiteId,
      principalAmount: approvedCupo,
      termMonths,
      paymentDeadline: defaultDeadline,
      isLockedWhileActive: false
    });

    const updatedUser: User = {
      ...user,
      creditStatus: 'ASIGNADO',
      paymentStatus: 'PAZ_Y_SALVO',
      creditTramiteId: tramiteId,
      creditLimit: approvedCupo,
      availableBalance: 0, // Inicia en $0 de deuda; solo se aprueba el cupo
      daysOverdue: 0,
      loanTermMonths: termMonths,
      customInstallmentAmount: 0,
      creditAssignedDate: new Date().toISOString().split('T')[0],
      nextPaymentDate: defaultDeadline,
      activeLoanBreakdown: cupoReferenceBreakdown,
      disbursementRequest: undefined,
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    await this.addAuditEntry(
      'CREDIT_LIMIT_APPROVED_ZERO_DEBT',
      user.id,
      user.cedula,
      `Cupo aprobado por ${adminName} (${tramiteId}): Cupo Habilitado=$${approvedCupo.toLocaleString('es-CO')} COP, Deuda Inicial=$0 COP. Cliente habilitado para solicitar desembolso.`
    );

    return {
      success: true,
      user: saved,
      message: `Cupo de $${approvedCupo.toLocaleString('es-CO')} aprobado para ${user.fullName} (Deuda inicial: $0).`
    };
  }

  /**
   * Edición de datos del usuario (Panel Admin y Panel Trabajadores).
   * REGLA FINTECH: Si el cliente tiene un crédito ACTIVO, éste se encuentra FIJADO y NO se puede editar, borrar ni cambiar ningún dato del crédito mientras esté activo.
   */
  static async updateUserCompleteData(
    userId: string,
    updates: {
      cedula: string;
      fullName: string;
      email: string;
      phone: string;
      newPassword?: string;
      isActive?: boolean;
      creditStatus: CreditStatus;
      creditTramiteId: string;
      creditLimit: number;
      availableBalance: number;
      customInstallmentAmount?: number;
      loanTermMonths?: number;
      paymentStatus?: User['paymentStatus'];
      daysOverdue?: number;
      creditAssignedDate?: string;
      nextPaymentDate?: string;
      taxPercentageApplied?: number;
      interestRateApplied?: number;
      previousLoans?: PreviousLoanRecord[];
      workerPermissions?: WorkerPermission[];
    },
    editorName: string
  ): Promise<{ success: boolean; user?: User; message: string }> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
      return { success: false, message: 'Usuario no encontrado.' };
    }

    const cleanNewCedula = updates.cedula.trim();
    const duplicate = users.some(
      (u, idx) => idx !== index && u.cedula.trim().toUpperCase() === cleanNewCedula.toUpperCase()
    );
    if (duplicate) {
      return { success: false, message: 'La cédula ingresada ya pertenece a otro usuario registrado.' };
    }

    const current = users[index];
    const isLockedActiveCredit = this.isCreditActiveAndLocked(current);

    if (isLockedActiveCredit) {
      const creditFieldChanged =
        updates.creditStatus !== current.creditStatus ||
        (updates.creditTramiteId &&
          updates.creditTramiteId.trim() !== current.creditTramiteId) ||
        Number(updates.creditLimit) !== Number(current.creditLimit) ||
        Number(updates.availableBalance) !== Number(current.availableBalance) ||
        (updates.customInstallmentAmount !== undefined &&
          Number(updates.customInstallmentAmount) !==
            Number(current.customInstallmentAmount)) ||
        (updates.loanTermMonths !== undefined &&
          Number(updates.loanTermMonths) !== Number(current.loanTermMonths || 12)) ||
        (updates.nextPaymentDate !== undefined &&
          updates.nextPaymentDate !== current.nextPaymentDate) ||
        (updates.taxPercentageApplied !== undefined &&
          Number(updates.taxPercentageApplied) !==
            Number(current.taxPercentageApplied)) ||
        (updates.interestRateApplied !== undefined &&
          Number(updates.interestRateApplied) !==
            Number(current.interestRateApplied)) ||
        (updates.paymentStatus !== undefined &&
          updates.paymentStatus !== current.paymentStatus) ||
        (updates.daysOverdue !== undefined &&
          Number(updates.daysOverdue) !== Number(current.daysOverdue || 0));

      if (creditFieldChanged) {
        await this.addAuditEntry(
          'BLOCKED_ACTIVE_LOAN_EDIT_ATTEMPT',
          current.id,
          current.cedula,
          `Intento bloqueado de modificar el crédito activo (${current.creditTramiteId}) por ${editorName}. El crédito se encuentra FIJADO mientras esté activo.`
        );
        return {
          success: false,
          message:
            'CRÉDITO FIJADO: No se puede editar, borrar ni cambiar la información del crédito mientras el crédito esté activo.'
        };
      }
    }

    let passwordHash = current.passwordHash;
    if (updates.newPassword && updates.newPassword.trim().length > 0) {
      passwordHash = await hashPassword(updates.newPassword.trim(), cleanNewCedula);
    } else if (cleanNewCedula !== current.cedula.trim()) {
      passwordHash = await hashPassword('Password123!', cleanNewCedula);
    }

    const hasActiveDebt = Number(updates.availableBalance) > 0;
    const becomingActive =
      !isLockedActiveCredit &&
      (!current.role || current.role === 'CLIENT') &&
      updates.creditStatus === 'ASIGNADO' &&
      Number(updates.creditLimit) > 0;

    const newTramite = updates.creditTramiteId.trim() || current.creditTramiteId;
    const newBreakdown = isLockedActiveCredit
      ? current.activeLoanBreakdown
      : becomingActive
      ? this.buildFixedLoanBreakdown({
          tramiteId: newTramite,
          principalAmount: Number(updates.creditLimit) || 10000000,
          termMonths: Number(updates.loanTermMonths) || 12,
          interestRatePercentage:
            updates.interestRateApplied !== undefined
              ? Number(updates.interestRateApplied)
              : current.interestRateApplied,
          ivaPercentage:
            updates.taxPercentageApplied !== undefined
              ? Number(updates.taxPercentageApplied)
              : current.taxPercentageApplied,
          paymentDeadline: updates.nextPaymentDate || current.nextPaymentDate,
          isLockedWhileActive: hasActiveDebt
        })
      : current.activeLoanBreakdown;

    const updatedUser: User = {
      ...current,
      cedula: isLockedActiveCredit ? current.cedula : cleanNewCedula,
      fullName: updates.fullName.trim(),
      email: updates.email.trim().toLowerCase(),
      phone: updates.phone.trim(),
      passwordHash,
      isActive: updates.isActive !== undefined ? updates.isActive : current.isActive,
      creditStatus: isLockedActiveCredit ? current.creditStatus : updates.creditStatus,
      creditTramiteId: isLockedActiveCredit ? current.creditTramiteId : newTramite,
      creditLimit: isLockedActiveCredit
        ? current.creditLimit
        : Number(updates.creditLimit) || 0,
      availableBalance: isLockedActiveCredit
        ? current.availableBalance
        : updates.creditStatus === 'ASIGNADO'
        ? Math.max(0, Number(updates.availableBalance) || 0)
        : 0,
      customInstallmentAmount: isLockedActiveCredit
        ? current.customInstallmentAmount
        : updates.customInstallmentAmount !== undefined
        ? Number(updates.customInstallmentAmount)
        : hasActiveDebt
        ? newBreakdown?.monthlyInstallmentAmount ?? current.customInstallmentAmount
        : 0,
      loanTermMonths: isLockedActiveCredit
        ? current.loanTermMonths
        : Number(updates.loanTermMonths) || 12,
      paymentStatus: isLockedActiveCredit
        ? current.paymentStatus
        : updates.paymentStatus ||
          (updates.creditStatus === 'ASIGNADO'
            ? hasActiveDebt
              ? 'AL_DIA'
              : 'PAZ_Y_SALVO'
            : 'SIN_ACEPTAR'),
      daysOverdue: isLockedActiveCredit
        ? current.daysOverdue
        : Number(updates.daysOverdue) || 0,
      creditAssignedDate: isLockedActiveCredit
        ? current.creditAssignedDate
        : updates.creditAssignedDate || current.creditAssignedDate,
      nextPaymentDate: isLockedActiveCredit
        ? current.nextPaymentDate
        : updates.nextPaymentDate || newBreakdown?.paymentDeadline || current.nextPaymentDate,
      taxPercentageApplied: isLockedActiveCredit
        ? current.taxPercentageApplied
        : updates.taxPercentageApplied !== undefined
        ? Number(updates.taxPercentageApplied)
        : current.taxPercentageApplied,
      interestRateApplied: isLockedActiveCredit
        ? current.interestRateApplied
        : updates.interestRateApplied !== undefined
        ? Number(updates.interestRateApplied)
        : current.interestRateApplied,
      activeLoanBreakdown: newBreakdown,
      previousLoans:
        updates.previousLoans !== undefined
          ? updates.previousLoans
          : current.previousLoans,
      workerPermissions:
        updates.workerPermissions !== undefined
          ? updates.workerPermissions
          : current.workerPermissions,
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    await this.addAuditEntry(
      'USER_AND_LOAN_DATA_EDITED',
      saved.id,
      saved.cedula,
      `Datos actualizados por ${editorName}: Titular=${saved.fullName}, Estado=${saved.creditStatus}, Cartera=${saved.paymentStatus}, Principal=$${saved.creditLimit.toLocaleString('es-CO')}, Saldo Pago Total=$${saved.availableBalance.toLocaleString('es-CO')}.`
    );

    return {
      success: true,
      user: saved,
      message: 'Datos actualizados correctamente.'
    };
  }

  /**
   * Procesa el pago de cuota o cuota personalizada del préstamo sobre el Pago Total
   */
  static async payLoan(
    userId: string,
    amount: number,
    paymentType: 'CUOTA' | 'CUOTA_PERSONALIZADA' | 'CUOTA_COMPLETA' | 'TOTALIDAD',
    paymentMethod: string,
    paymentDetails?: {
      paymentNumber: string;
      transactionId: string;
      authorizationCode: string;
      payerFullName: string;
      payerCedula: string;
      payerEmail: string;
    }
  ): Promise<{ success: boolean; user?: User; paymentNumber: string; message: string }> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
      return { success: false, paymentNumber: '', message: 'Usuario no encontrado.' };
    }

    const user = users[index];
    if (amount <= 0 || user.availableBalance <= 0) {
      return { success: false, paymentNumber: '', message: 'No hay saldo pendiente por pagar.' };
    }

    const appliedAmount = Math.min(user.availableBalance, amount);
    const newBalance = Math.max(0, user.availableBalance - appliedAmount);
    const labelTipo =
      paymentType === 'CUOTA_PERSONALIZADA'
        ? 'Pago Parcial / Personalizado'
        : paymentType === 'TOTALIDAD'
        ? 'Pago de Totalidad del Préstamo'
        : 'Pago de Cuota';

    const generatedPaymentNumber =
      paymentDetails?.paymentNumber ||
      `PAG-${Math.floor(100000 + Math.random() * 900000)}`;
    const nowIso = new Date().toISOString();

    const newPaymentRecord: ClientPaymentRecord = {
      paymentNumber: generatedPaymentNumber,
      transactionId: paymentDetails?.transactionId || generatedPaymentNumber,
      authorizationCode: paymentDetails?.authorizationCode || 'AUTH-OK',
      amount: appliedAmount,
      paymentMethod,
      payerFullName: paymentDetails?.payerFullName || user.fullName,
      payerCedula: paymentDetails?.payerCedula || user.cedula,
      payerEmail: paymentDetails?.payerEmail || user.email,
      status: 'PAGO_PROCESADO',
      paidAt: nowIso
    };

    const loanSettings = this.getLoanSettings();
    const breakdown = user.activeLoanBreakdown;
    const updatedPreviousLoans: PreviousLoanRecord[] = [...(user.previousLoans || [])];
    // Si el saldo llega a 0, el crédito activo finaliza y se archiva con su desglose completo en previousLoans
    if (newBalance === 0 && !updatedPreviousLoans.some(p => p.tramiteId === user.creditTramiteId)) {
      const principalAmt = breakdown?.principalAmount || user.creditLimit || appliedAmount;
      const totalPaidAmt = breakdown?.totalPaymentAmount || user.creditLimit || appliedAmount;
      updatedPreviousLoans.unshift({
        id: 'prev-' + Date.now(),
        tramiteId: user.creditTramiteId,
        amountGranted: principalAmt,
        totalPaid: totalPaidAmt,
        termMonths: breakdown?.termMonths || user.loanTermMonths || 12,
        taxPercentageApplied: breakdown?.ivaPercentage ?? user.taxPercentageApplied ?? loanSettings.taxPercentage,
        interestRateApplied: breakdown?.interestRatePercentage ?? user.interestRateApplied ?? loanSettings.monthlyInterestRate,
        startDate: user.creditAssignedDate || new Date().toISOString().split('T')[0],
        closedDate: new Date().toISOString().split('T')[0],
        finalStatus: 'PAZ_Y_SALVO',
        paymentBehavior: user.daysOverdue && user.daysOverdue > 0 ? 'CON_MORA_SUPERADA' : 'EXCELENTE',
        principalAmount: principalAmt,
        interestAmount: breakdown?.interestAmount ?? 0,
        fianzaAmount: breakdown?.fianzaAmount ?? 0,
        electronicSignatureFee: breakdown?.electronicSignatureFee ?? 28500,
        electronicSignatureCode: breakdown?.electronicSignatureCode ?? `FIRMA-OTP-${user.creditTramiteId}`,
        collectionExpenses: breakdown?.collectionExpenses ?? 0,
        ivaAmount: breakdown?.ivaAmount ?? 0,
        paymentDeadline: breakdown?.paymentDeadline || user.nextPaymentDate || new Date().toISOString().split('T')[0],
        totalPaymentAmount: totalPaidAmt
      });
    }

    const updatedBreakdown = breakdown
      ? {
          ...breakdown,
          isLockedWhileActive: newBalance > 0
        }
      : undefined;

    const updatedUser: User = {
      ...user,
      availableBalance: newBalance,
      paymentStatus: newBalance === 0 ? 'PAZ_Y_SALVO' : 'AL_DIA',
      daysOverdue: 0,
      activeLoanBreakdown: updatedBreakdown,
      previousLoans: updatedPreviousLoans,
      lastPaymentNumber: generatedPaymentNumber,
      lastPaymentStatus: 'PAGO_PROCESADO',
      lastPaymentAmount: appliedAmount,
      lastPaymentMethod: paymentMethod,
      lastPaymentDate: nowIso,
      paymentRecords: [newPaymentRecord, ...(user.paymentRecords || [])].slice(0, 30),
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    await this.addAuditEntry(
      paymentType === 'CUOTA_PERSONALIZADA' ? 'LOAN_CUSTOM_PAYMENT' : 'LOAN_INSTALLMENT_PAYMENT',
      user.id,
      user.cedula,
      `CUOTA PAGADA (WEBHOOK VERIFICADO) • N° Pago: ${generatedPaymentNumber} • ${labelTipo} vía ${paymentMethod} por valor de $ ${appliedAmount.toLocaleString('es-CO')} COP. Pagador identificado: ${newPaymentRecord.payerFullName} (CC ${newPaymentRecord.payerCedula} | ${newPaymentRecord.payerEmail}). Saldo restante: $ ${newBalance.toLocaleString('es-CO')} COP.`
    );

    return {
      success: true,
      user: saved,
      paymentNumber: generatedPaymentNumber,
      message: `CUOTA PAGADA • N° de Pago: ${generatedPaymentNumber}`
    };
  }

  /**
   * Registra un intento de pago cancelado o no completado en la pasarela de pagos
   */
  static async recordCancelledPayment(
    userId: string,
    amount: number,
    paymentMethod: string,
    payerInfo?: {
      paymentNumber?: string;
      payerFullName?: string;
      payerCedula?: string;
      payerEmail?: string;
    }
  ): Promise<{ success: boolean; user?: User; paymentNumber: string; message: string }> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
      return { success: false, paymentNumber: '', message: 'Usuario no encontrado.' };
    }

    const user = users[index];
    const cancelledNumber =
      payerInfo?.paymentNumber ||
      `CANC-${Math.floor(100000 + Math.random() * 900000)}`;
    const nowIso = new Date().toISOString();

    const cancelledRecord: ClientPaymentRecord = {
      paymentNumber: cancelledNumber,
      transactionId: cancelledNumber,
      authorizationCode: 'CANCELADO',
      amount: Math.max(0, amount),
      paymentMethod,
      payerFullName: payerInfo?.payerFullName || user.fullName,
      payerCedula: payerInfo?.payerCedula || user.cedula,
      payerEmail: payerInfo?.payerEmail || user.email,
      status: 'PAGO_CANCELADO',
      paidAt: nowIso
    };

    const updatedUser: User = {
      ...user,
      lastPaymentNumber: cancelledNumber,
      lastPaymentStatus: 'PAGO_CANCELADO',
      lastPaymentAmount: Math.max(0, amount),
      lastPaymentMethod: paymentMethod,
      lastPaymentDate: nowIso,
      paymentRecords: [cancelledRecord, ...(user.paymentRecords || [])].slice(0, 30),
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    await this.addAuditEntry(
      'LOAN_PAYMENT_CANCELLED',
      user.id,
      user.cedula,
      `PAGO CANCELADO • Ref: ${cancelledNumber} • Intento de pago por $ ${Math.max(0, amount).toLocaleString('es-CO')} COP vía ${paymentMethod} fue cancelado o no procesado.`
    );

    return {
      success: true,
      user: saved,
      paymentNumber: cancelledNumber,
      message: 'PAGO CANCELADO'
    };
  }

  /**
   * Solicitud de nuevo crédito tras finalizar el anterior:
   * Registra firma electrónica por OTP, aceptación de condiciones y FIJA el desglose del nuevo crédito
   */
  static async requestNewLoanWithOtpSignature(
    userId: string,
    params: {
      requestedAmount: number;
      requestedTermMonths: number;
      estimatedMonthlyInstallment: number;
      bankEntity: string;
      accountType: 'AHORROS' | 'CORRIENTE' | 'BILLETERA_DIGITAL';
      accountNumber: string;
      otpCodeSigned: string;
      acceptedTerms: boolean;
      acceptedPromissoryNote: boolean;
      acceptedBankMandate: boolean;
      updatedEmail?: string;
      updatedPhone?: string;
      nextPaymentDate?: string;
    }
  ): Promise<{ success: boolean; user?: User; message: string }> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
      return { success: false, message: 'Usuario no encontrado.' };
    }

    const user = users[index];
    if (this.isCreditActiveAndLocked(user)) {
      return {
        success: false,
        message:
          'Ya cuentas con un crédito ACTIVO y FIJADO. No es posible crear o modificar otro crédito mientras el actual esté activo.'
      };
    }

    const newTramiteId = `TRM-${Math.floor(100000 + Math.random() * 900000)}`;
    const bankApiReference = `ACH-${params.bankEntity
      .slice(0, 4)
      .toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const signedAt = new Date().toISOString();

    const sigHash = await hashPassword(
      `${user.cedula}|${newTramiteId}|${params.requestedAmount}|${params.otpCodeSigned}|${signedAt}`,
      user.cedula
    );

    const newBreakdown = this.buildFixedLoanBreakdown({
      tramiteId: newTramiteId,
      principalAmount: params.requestedAmount,
      termMonths: params.requestedTermMonths,
      electronicSignatureCode: `OTP-${params.otpCodeSigned} (${sigHash.slice(0, 10).toUpperCase()})`,
      paymentDeadline: params.nextPaymentDate || user.nextPaymentDate,
      lockedAt: signedAt,
      isLockedWhileActive: false
    });

    // Conservar el cupo total aprobado del cliente (se disminuirá su disponible al aprobarse el desembolso)
    const preservedCupoLimit = Math.max(
      user.creditLimit || 0,
      newBreakdown.principalAmount
    );

    const updatedUser: User = {
      ...user,
      email: params.updatedEmail ? params.updatedEmail.trim() : user.email,
      phone: params.updatedPhone ? params.updatedPhone.trim() : user.phone,
      nextPaymentDate: newBreakdown.paymentDeadline,
      creditStatus: 'ASIGNADO',
      paymentStatus: 'EN_DESEMBOLSO',
      creditTramiteId: newTramiteId,
      creditLimit: preservedCupoLimit,
      availableBalance: 0,
      loanTermMonths: newBreakdown.termMonths,
      customInstallmentAmount: newBreakdown.monthlyInstallmentAmount,
      daysOverdue: 0,
      activeLoanBreakdown: newBreakdown,
      disbursementRequest: {
        tramiteId: newTramiteId,
        requestedAmount: newBreakdown.principalAmount,
        requestedTermMonths: newBreakdown.termMonths,
        estimatedMonthlyInstallment: newBreakdown.monthlyInstallmentAmount,
        bankEntity: params.bankEntity,
        accountType: params.accountType,
        accountNumber: params.accountNumber,
        otpCodeSigned: params.otpCodeSigned,
        signatureHash: sigHash,
        signedAt,
        acceptedTerms: params.acceptedTerms,
        acceptedPromissoryNote: params.acceptedPromissoryNote,
        acceptedBankMandate: params.acceptedBankMandate,
        bankApiReference,
        status: 'EN_PROCESO_DESEMBOLSO',
        loanBreakdown: newBreakdown
      },
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    await this.addAuditEntry(
      'NEW_LOAN_SIGNED_OTP_DISBURSEMENT_PENDING',
      user.id,
      user.cedula,
      `Solicitud de desembolso firmada con OTP (${params.otpCodeSigned}): Cupo Aprobado=$${preservedCupoLimit.toLocaleString('es-CO')}, Desembolso Solicitado=$${newBreakdown.principalAmount.toLocaleString('es-CO')}, Interés=$${newBreakdown.interestAmount.toLocaleString('es-CO')}, Fianza=$${newBreakdown.fianzaAmount.toLocaleString('es-CO')}, Firma=$${newBreakdown.electronicSignatureFee.toLocaleString('es-CO')}, IVA=$${newBreakdown.ivaAmount.toLocaleString('es-CO')}, Deuda Total a Cargar=$${newBreakdown.totalPaymentAmount.toLocaleString('es-CO')}. Pendiente de aprobación en Panel Aprobar Desembolso.`
    );

    return {
      success: true,
      user: saved,
      message: 'Solicitud de desembolso enviada. Se reflejará como deuda y disminución de tu cupo al ser aprobada.'
    };
  }

  /**
   * Aprueba y confirma el desembolso de un crédito desde el Panel Admin / Trabajador ("Aprobar Desembolso").
   * Esta aprobación se marca como disminución del cupo disponible del cliente y como deuda activa en su panel.
   */
  static async confirmLoanDisbursement(
    userId: string,
    confirmedBySource: string,
    customDisbursementPrincipal?: number
  ): Promise<{ success: boolean; user?: User; message: string }> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
      return { success: false, message: 'Usuario no encontrado.' };
    }

    const user = users[index];
    const req = user.disbursementRequest;
    const disbursedPrincipal =
      customDisbursementPrincipal && customDisbursementPrincipal > 0
        ? Math.round(customDisbursementPrincipal)
        : req?.loanBreakdown?.principalAmount ||
          req?.requestedAmount ||
          user.activeLoanBreakdown?.principalAmount ||
          user.creditLimit ||
          10000000;
    const termMonths =
      req?.loanBreakdown?.termMonths ||
      req?.requestedTermMonths ||
      user.loanTermMonths ||
      12;
    const todayDate = new Date().toISOString().split('T')[0];

    const nextDateObj = new Date();
    nextDateObj.setMonth(nextDateObj.getMonth() + 1);
    const nextPaymentDate =
      req?.loanBreakdown?.paymentDeadline ||
      user.nextPaymentDate ||
      nextDateObj.toISOString().split('T')[0];

    const lockedBreakdown: LoanFinancialBreakdown =
      customDisbursementPrincipal && customDisbursementPrincipal > 0
        ? this.buildFixedLoanBreakdown({
            tramiteId: req?.tramiteId || user.creditTramiteId,
            principalAmount: disbursedPrincipal,
            termMonths,
            electronicSignatureCode: req?.otpCodeSigned
              ? `OTP-${req.otpCodeSigned}`
              : undefined,
            paymentDeadline: nextPaymentDate,
            isLockedWhileActive: true
          })
        : req?.loanBreakdown ||
          user.activeLoanBreakdown ||
          this.buildFixedLoanBreakdown({
            tramiteId: req?.tramiteId || user.creditTramiteId,
            principalAmount: disbursedPrincipal,
            termMonths,
            electronicSignatureCode: req?.otpCodeSigned
              ? `OTP-${req.otpCodeSigned}`
              : undefined,
            paymentDeadline: nextPaymentDate,
            isLockedWhileActive: true
          });

    lockedBreakdown.isLockedWhileActive = true;
    lockedBreakdown.lockedAt = new Date().toISOString();

    // El cupo total aprobado del cliente se mantiene; su cupo disponible disminuye por el desembolso y pasa a ser deuda
    const approvedCupoLimit = Math.max(
      user.creditLimit || 0,
      lockedBreakdown.principalAmount
    );
    const remainingAvailableCupo = Math.max(
      0,
      approvedCupoLimit - lockedBreakdown.principalAmount
    );

    const updatedUser: User = {
      ...user,
      creditStatus: 'ASIGNADO',
      paymentStatus: 'AL_DIA',
      creditLimit: approvedCupoLimit,
      availableBalance: lockedBreakdown.totalPaymentAmount,
      loanTermMonths: lockedBreakdown.termMonths,
      customInstallmentAmount: lockedBreakdown.monthlyInstallmentAmount,
      creditAssignedDate: todayDate,
      nextPaymentDate: lockedBreakdown.paymentDeadline,
      daysOverdue: 0,
      activeLoanBreakdown: lockedBreakdown,
      disbursementRequest: req
        ? {
            ...req,
            status: 'DESEMBOLSADO',
            confirmedBy: confirmedBySource,
            confirmedAt: new Date().toISOString(),
            loanBreakdown: lockedBreakdown
          }
        : {
            tramiteId: lockedBreakdown.tramiteId,
            requestedAmount: lockedBreakdown.principalAmount,
            requestedTermMonths: lockedBreakdown.termMonths,
            estimatedMonthlyInstallment: lockedBreakdown.monthlyInstallmentAmount,
            bankEntity: 'Transferencia Autorizada',
            accountType: 'AHORROS',
            accountNumber: 'Cuenta Registrada',
            otpCodeSigned: 'AUTORIZADO-ADMIN',
            signatureHash: 'DirectDisbursementApproved',
            signedAt: new Date().toISOString(),
            acceptedTerms: true,
            acceptedPromissoryNote: true,
            acceptedBankMandate: true,
            bankApiReference: `DES-${lockedBreakdown.tramiteId}`,
            status: 'DESEMBOLSADO',
            confirmedBy: confirmedBySource,
            confirmedAt: new Date().toISOString(),
            loanBreakdown: lockedBreakdown
          },
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    await this.addAuditEntry(
      'LOAN_DISBURSEMENT_APPROVED_DEBT_ASSIGNED',
      user.id,
      user.cedula,
      `Desembolso aprobado por [${confirmedBySource}]: Disminución de Cupo=-$${lockedBreakdown.principalAmount.toLocaleString('es-CO')} COP (Cupo Total=$${approvedCupoLimit.toLocaleString('es-CO')}, Cupo Disponible Restante=$${remainingAvailableCupo.toLocaleString('es-CO')}), Deuda Cargada al Cliente=$${lockedBreakdown.totalPaymentAmount.toLocaleString('es-CO')} COP. Ref: ${req?.bankApiReference || user.creditTramiteId}.`
    );

    return {
      success: true,
      user: saved,
      message: `Desembolso aprobado: Disminución de cupo por $${lockedBreakdown.principalAmount.toLocaleString('es-CO')} y deuda activa de $${lockedBreakdown.totalPaymentAmount.toLocaleString('es-CO')}.`
    };
  }

  /**
   * Rechaza o cancela una solicitud de desembolso pendiente, restaurando el cupo disponible sin cargar deuda
   */
  static async rejectLoanDisbursement(
    userId: string,
    reason: string,
    actorName: string
  ): Promise<{ success: boolean; user?: User; message: string }> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
      return { success: false, message: 'Usuario no encontrado.' };
    }

    const user = users[index];
    const updatedUser: User = {
      ...user,
      creditStatus: 'ASIGNADO',
      paymentStatus: 'PAZ_Y_SALVO',
      availableBalance: 0,
      customInstallmentAmount: 0,
      disbursementRequest: undefined,
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    await this.addAuditEntry(
      'LOAN_DISBURSEMENT_REJECTED',
      user.id,
      user.cedula,
      `Solicitud de desembolso rechazada por ${actorName}. Motivo: ${reason}. El cupo de $${(user.creditLimit || 0).toLocaleString('es-CO')} permanece intacto con deuda $0.`
    );

    return {
      success: true,
      user: saved,
      message: `Solicitud de desembolso rechazada para ${user.fullName}. Su cupo sigue en $0 de deuda.`
    };
  }

  /**
   * Rechazo de crédito por Administrador (solo permitido si el crédito NO está activo)
   */
  static async rejectUserCredit(userId: string, reason: string, adminName: string): Promise<{ success: boolean; user?: User; message: string }> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
      return { success: false, message: 'Usuario no encontrado.' };
    }

    const user = users[index];
    if (this.isCreditActiveAndLocked(user)) {
      return {
        success: false,
        message:
          'BLOQUEO FINTECH: No se puede rechazar, borrar ni cambiar un crédito que ya se encuentra ACTIVO y FIJADO.'
      };
    }

    const updatedUser: User = {
      ...user,
      creditStatus: 'RECHAZADO',
      availableBalance: 0,
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    await this.addAuditEntry(
      'CREDIT_REJECTED_BY_ADMIN',
      user.id,
      user.cedula,
      `Crédito rechazado por ${adminName}. Motivo: ${reason}`
    );

    return { success: true, user: saved, message: 'Solicitud rechazada.' };
  }

  /**
   * Crear Trabajador con permisos específicos
   */
  static async createWorker(params: {
    cedula: string;
    fullName: string;
    email: string;
    phone: string;
    password: string;
    permissions: WorkerPermission[];
    creatorName: string;
  }): Promise<{ success: boolean; message: string; worker?: User }> {
    const result = await this.registerUser({
      cedula: params.cedula,
      fullName: params.fullName,
      email: params.email,
      phone: params.phone,
      password: params.password,
      creditStatus: 'ASIGNADO',
      initialBalance: 0,
      role: 'WORKER',
      workerPermissions: params.permissions
    });

    if (result.success && result.user) {
      await this.addAuditEntry(
        'WORKER_CREATED',
        result.user.id,
        result.user.cedula,
        `Trabajador creado por ${params.creatorName}. Permisos: ${params.permissions.join(', ')}.`
      );
    }

    return { success: result.success, message: result.message, worker: result.user };
  }

  /**
   * Alternar estado de activación de un trabajador
   */
  static async toggleWorkerStatus(workerId: string, adminName: string): Promise<User | null> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === workerId);
    if (index === -1) return null;

    const worker = users[index];
    const newStatus = !worker.isActive;
    const updated = await this.updateUserDirectly({
      ...worker,
      isActive: newStatus
    });

    await this.addAuditEntry(
      'WORKER_STATUS_CHANGED',
      worker.id,
      worker.cedula,
      `Estado del trabajador ${worker.fullName} cambiado a ${newStatus ? 'ACTIVO' : 'INACTIVO'} por ${adminName}.`
    );

    return updated;
  }

  /**
   * Actualizar permisos de un trabajador
   */
  static async updateWorkerPermissions(workerId: string, permissions: WorkerPermission[], adminName: string): Promise<User | null> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === workerId);
    if (index === -1) return null;

    const worker = users[index];
    const updated = await this.updateUserDirectly({
      ...worker,
      workerPermissions: permissions
    });

    await this.addAuditEntry(
      'WORKER_PERMISSIONS_UPDATED',
      worker.id,
      worker.cedula,
      `Permisos actualizados por ${adminName}: ${permissions.join(', ')}.`
    );

    return updated;
  }

  /**
   * Cambia el estado del crédito de prueba (PENDIENTE <-> ASIGNADO)
   */
  static async toggleCreditStatus(userId: string): Promise<User | null> {
    const { users } = await this.getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) return null;

    const user = users[userIndex];
    const newStatus: CreditStatus = user.creditStatus === 'PENDIENTE' ? 'ASIGNADO' : 'PENDIENTE';
    const newBalance = newStatus === 'ASIGNADO' ? 18500000 : 0;

    const updatedUser: User = {
      ...user,
      creditStatus: newStatus,
      availableBalance: newBalance,
      creditLimit: newStatus === 'ASIGNADO' ? newBalance : user.creditLimit,
      creditAssignedDate: newStatus === 'ASIGNADO' ? new Date().toISOString().split('T')[0] : undefined,
      creditEstimatedDate: newStatus === 'PENDIENTE' ? 'En evaluación' : undefined,
      integrityChecksum: ''
    };

    const savedUser = await this.updateUserDirectly(updatedUser);

    await this.addAuditEntry(
      'CREDIT_STATUS_CHANGED',
      user.id,
      user.cedula,
      `Estado modificado a ${newStatus}. Préstamo: $ ${newBalance.toLocaleString('es-CO')}.`
    );

    return savedUser;
  }

  /**
   * Restablecimiento seguro de clave
   */
  static async resetPassword(cedula: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const { user, isTampered } = await this.getUserByCedula(cedula);
    if (isTampered || !user) {
      return { success: false, message: 'Usuario no encontrado o no autorizado.' };
    }

    const newHash = await hashPassword(newPassword, user.cedula);
    const updatedUser = {
      ...user,
      passwordHash: newHash,
      failedLoginAttempts: 0,
      lockedUntil: undefined
    };

    await this.updateUserDirectly(updatedUser);

    await this.addAuditEntry(
      'PASSWORD_RESET',
      user.id,
      user.cedula,
      'Contraseña restablecida con OTP.'
    );

    return { success: true, message: 'Contraseña actualizada con éxito.' };
  }

  /**
   * Actualiza el usuario recalculando su checksum criptográfico de integridad
   */
  private static async updateUserDirectly(user: User): Promise<User> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === user.id);

    const { integrityChecksum, ...base } = user;
    const newChecksum = await calculateUserIntegrityChecksum(base);
    const finalUser: User = { ...base, integrityChecksum: newChecksum };

    if (index !== -1) {
      users[index] = finalUser;
    } else {
      users.push(finalUser);
    }

    memoryUsersCache = users;
    await setEncryptedStorageItem(USERS_STORAGE_KEY, users);

    // Sincronización cifrada en segundo plano con Firebase Firestore
    FirebaseService.saveEncryptedUser(finalUser).catch(() => {});

    return finalUser;
  }

  /**
   * Registro Inmutable en el libro de auditoría (Blockchain Ledger cifrado en reposo)
   */
  static async addAuditEntry(action: string, userId: string, userCedula: string, details: string): Promise<AuditBlock> {
    const decryptedAudit = await getEncryptedStorageItem<AuditBlock[]>(AUDIT_STORAGE_KEY);
    const chain: AuditBlock[] = Array.isArray(decryptedAudit) ? decryptedAudit : [];

    const previousBlock = chain[chain.length - 1];
    const previousHash = previousBlock ? previousBlock.hash : '0';
    const index = chain.length;
    const timestamp = new Date().toISOString();

    const hash = await calculateBlockAuditHash(index, timestamp, action, userId, details, previousHash);

    const newBlock: AuditBlock = {
      index,
      timestamp,
      action,
      userId,
      userCedula,
      details,
      previousHash,
      hash
    };

    chain.push(newBlock);
    await setEncryptedStorageItem(AUDIT_STORAGE_KEY, chain);

    // Registrar también en el log normativo cifrado (AES-256-GCM + HMAC-SHA256) de security-crypto.js
    recordEncryptedAuditLog({
      category:
        action.includes('SESSION') || action.includes('LOGIN') || action.includes('ACCESS')
          ? 'ACCESS'
          : 'MODIFICATION',
      action,
      actorCedula: userCedula,
      actorName: userCedula,
      targetId: userId,
      details
    }).catch(() => {});

    // Sincronización cifrada en segundo plano con Firebase Firestore
    FirebaseService.saveEncryptedAuditBlock(newBlock).catch(() => {});

    return newBlock;
  }

  /**
   * Obtiene la cadena completa de auditoría descifrada y verifica su integridad
   */
  static async getAuditChain(): Promise<{ chain: AuditBlock[]; isChainValid: boolean }> {
    await this.initializeDefaultData();
    const chain = await getEncryptedStorageItem<AuditBlock[]>(AUDIT_STORAGE_KEY);
    if (!chain || !Array.isArray(chain)) return { chain: [], isChainValid: true };

    try {
      const isChainValid = await verifyAuditChainIntegrity(chain);
      return { chain, isChainValid };
    } catch {
      return { chain: [], isChainValid: false };
    }
  }

  /**
   * Estadísticas globales de la plataforma
   */
  static async getStatistics() {
    const { users, tamperedUsers } = await this.getUsers();
    const { chain, isChainValid } = await this.getAuditChain();

    const clients = users.filter(u => !u.role || u.role === 'CLIENT');
    const workers = users.filter(u => u.role === 'WORKER');
    const approvedCredits = clients.filter(u => u.creditStatus === 'ASIGNADO');
    const pendingCredits = clients.filter(u => u.creditStatus === 'PENDIENTE');
    const rejectedCredits = clients.filter(u => u.creditStatus === 'RECHAZADO');

    const totalDisbursed = approvedCredits.reduce((acc, curr) => acc + (curr.availableBalance || 0), 0);
    const totalCreditLimit = approvedCredits.reduce((acc, curr) => acc + (curr.creditLimit || 0), 0);

    const totalLogins = chain.filter(b => b.action.includes('LOGIN') || b.action.includes('SESSION')).length;

    return {
      totalUsers: clients.length,
      totalWorkers: workers.length,
      approvedCount: approvedCredits.length,
      pendingCount: pendingCredits.length,
      rejectedCount: rejectedCredits.length,
      totalDisbursed,
      totalCreditLimit,
      totalAuditBlocks: chain.length,
      totalLogins,
      isChainValid,
      hasTamperedUsers: tamperedUsers.length > 0,
      tamperedCount: tamperedUsers.length
    };
  }

  /**
   * Simula manipulación de datos sensibles
   */
  static simulateTamper(cedula: string, newTamperedBalance: number): boolean {
    if (!memoryUsersCache) return false;
    const user = memoryUsersCache.find(u => u.cedula.toUpperCase() === cedula.toUpperCase());
    if (user) {
      user.availableBalance = newTamperedBalance;
      setEncryptedStorageItem(USERS_STORAGE_KEY, memoryUsersCache).catch(() => {});
      return true;
    }
    return false;
  }

  /**
   * Restaura la integridad
   */
  static async restoreUserIntegrity(cedula: string): Promise<boolean> {
    const users = await getEncryptedStorageItem<User[]>(USERS_STORAGE_KEY);
    if (!users || !Array.isArray(users)) return false;

    try {
      const user = users.find(u => u.cedula.toUpperCase() === cedula.toUpperCase());
      if (user) {
        const { integrityChecksum, ...base } = user;
        user.integrityChecksum = await calculateUserIntegrityChecksum(base);
        memoryUsersCache = users;
        await setEncryptedStorageItem(USERS_STORAGE_KEY, users);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }
}
