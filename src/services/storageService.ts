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
  PreviousLoanRecord
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
import { notificationService } from './notificationService';
import { FirebaseService } from './firebaseService';
import { recordEncryptedAuditLog } from '../security-crypto.js';


const USERS_STORAGE_KEY = 'crediulep_secure_users_v2';
const AUDIT_STORAGE_KEY = 'crediulep_tamper_audit_v2';
const LOAN_SETTINGS_STORAGE_KEY = 'crediulep_general_loan_settings_v1';

const DEFAULT_LOAN_SETTINGS: LoanGeneralSettings = {
  taxPercentage: 4.5, // Impuesto / Gravamen sobre crédito (%)
  monthlyInterestRate: 1.85, // Interés mensual (% E.M.)
  annualEffectiveRate: 24.6, // Tasa Efectiva Anual (% E.A.)
  lateFeePercentage: 2.8, // Recargo por mora (%)
  insurancePercentage: 0.45, // Seguro de vida deudor (%)
  adminStudyFee: 45000, // Estudio y administración (COP)
  minLoanAmount: 1000000, // Monto mínimo (COP)
  maxLoanAmount: 50000000, // Monto máximo (COP)
  defaultTermMonths: 12, // Plazo estándar (meses)
  maxTermMonths: 60, // Plazo máximo (meses)
  gracePeriodDays: 5, // Días de gracia
  allowCustomInstallments: true,
  earlyPaymentPenaltyPercentage: 0,
  updatedAt: '2026-10-19T08:00:00Z',
  updatedBy: 'ADMINIULEP'
};

let memoryLoanSettingsCache: LoanGeneralSettings = { ...DEFAULT_LOAN_SETTINGS };
let memoryUsersCache: User[] | null = null;
let isDefaultDataInitialized = false;
let defaultDataInitPromise: Promise<void> | null = null;

export class StorageService {
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
      `Parámetros generales de préstamos actualizados por ${adminName}: Impuesto=${updated.taxPercentage}%, Interés Mensual=${updated.monthlyInterestRate}%, Mora=${updated.lateFeePercentage}%, Seguro=${updated.insurancePercentage}%, Estudio=$${updated.adminStudyFee.toLocaleString('es-CO')}.`
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
        totalPaid: 8960000,
        termMonths: 12,
        taxPercentageApplied: 4.5,
        interestRateApplied: 1.85,
        startDate: '2024-06-10',
        closedDate: '2025-06-08',
        finalStatus: 'PAZ_Y_SALVO',
        paymentBehavior: 'EXCELENTE'
      },
      {
        id: 'prev-val-02',
        tramiteId: 'TRM-652811',
        amountGranted: 12500000,
        totalPaid: 14125000,
        termMonths: 12,
        taxPercentageApplied: 4.5,
        interestRateApplied: 1.85,
        startDate: '2025-07-15',
        closedDate: '2026-07-12',
        finalStatus: 'PAZ_Y_SALVO',
        paymentBehavior: 'EXCELENTE'
      }
    ];

    // 2.1 Cliente con Crédito AL DÍA
    const valIndex = users.findIndex(u => u.cedula === '1020304050');
    if (valIndex === -1) {
      const cedula1 = '1020304050';
      const passHash1 = await hashPassword('Password123!', cedula1);
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
        taxPercentageApplied: 4.5,
        interestRateApplied: 1.85,
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
    } else {
      if (!users[valIndex].paymentStatus) {
        users[valIndex].paymentStatus = 'AL_DIA';
        users[valIndex].daysOverdue = 0;
        users[valIndex].loanTermMonths = users[valIndex].loanTermMonths || 12;
        users[valIndex].nextPaymentDate = users[valIndex].nextPaymentDate || '2026-11-16';
      }
      if (!users[valIndex].previousLoans) {
        users[valIndex].previousLoans = valPreviousLoans;
      }
      if (users[valIndex].taxPercentageApplied === undefined) {
        users[valIndex].taxPercentageApplied = 4.5;
        users[valIndex].interestRateApplied = 1.85;
      }
    }

    // 2.2 Cliente con Crédito EN MORA
    const moraPreviousLoans: PreviousLoanRecord[] = [
      {
        id: 'prev-mor-01',
        tramiteId: 'TRM-319402',
        amountGranted: 6500000,
        totalPaid: 7312000,
        termMonths: 6,
        taxPercentageApplied: 4.5,
        interestRateApplied: 1.85,
        startDate: '2025-11-05',
        closedDate: '2026-05-05',
        finalStatus: 'PAZ_Y_SALVO',
        paymentBehavior: 'PUNTUAL'
      }
    ];
    const moraIndex = users.findIndex(u => u.cedula === '1030405060');
    if (moraIndex === -1) {
      const cedulaMora = '1030405060';
      const passHashMora = await hashPassword('Password123!', cedulaMora);
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
        taxPercentageApplied: 4.5,
        interestRateApplied: 1.85,
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
    } else if (!users[moraIndex].previousLoans) {
      users[moraIndex].previousLoans = moraPreviousLoans;
    }

    // 2.3 Cliente con Crédito SIN ACEPTAR (PENDIENTE)
    const matIndex = users.findIndex(u => u.cedula === '9876543210');
    if (matIndex === -1) {
      const cedula2 = '9876543210';
      const passHash2 = await hashPassword('Password123!', cedula2);
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
        customInstallmentAmount: 1000000,
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
    } else if (!users[matIndex].paymentStatus) {
      users[matIndex].paymentStatus = 'SIN_ACEPTAR';
      users[matIndex].daysOverdue = 0;
      users[matIndex].loanTermMonths = users[matIndex].loanTermMonths || 12;
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
    const decryptedUsers = await getEncryptedStorageItem<User[]>(USERS_STORAGE_KEY);
    const users: User[] = Array.isArray(decryptedUsers)
      ? decryptedUsers
      : memoryUsersCache || [];
    if (users.length === 0) return { users: [], tamperedUsers: [] };

    try {
      memoryUsersCache = users;
      const tamperedUsers: string[] = [];

      for (const u of users) {
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
   * Registra un cliente de forma pública o por formulario
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
  }): Promise<{ success: boolean; message: string; user?: User }> {
    const { users } = await this.getUsers();
    const cleanCedula = params.cedula.trim().toUpperCase();

    if (users.some(u => u.cedula.trim().toUpperCase() === cleanCedula)) {
      return { success: false, message: 'La cédula ingresada ya se encuentra registrada.' };
    }

    const passwordHash = await hashPassword(params.password, params.cedula.trim());
    const availableBalance = params.creditStatus === 'ASIGNADO' ? (params.initialBalance || 15000000) : 0;
    const creditTramiteId = 'TRM-' + Math.floor(100000 + Math.random() * 900000);
    const role = params.role || 'CLIENT';

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
      creditLimit: params.creditStatus === 'ASIGNADO' ? availableBalance * 1.5 : 10000000,
      creditAssignedDate: params.creditStatus === 'ASIGNADO' ? new Date().toISOString().split('T')[0] : undefined,
      creditEstimatedDate: params.creditStatus === 'PENDIENTE' ? 'En evaluación' : undefined,
      creditTramiteId,
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
      `Nuevo ${role} registrado: ${newUser.fullName}. Estado de crédito: ${newUser.creditStatus}.`
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
   * Aprobación de crédito por Administrador o Trabajador autorizado
   */
  static async approveUserCredit(userId: string, newBalance: number, adminName: string): Promise<{ success: boolean; user?: User; message: string }> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
      return { success: false, message: 'Usuario no encontrado.' };
    }

    const user = users[index];
    const loanSettings = this.getLoanSettings();
    const termMonths = user.loanTermMonths || loanSettings.defaultTermMonths || 12;

    // Si el usuario ya tenía un préstamo asignado anterior, archivarlo en previousLoans
    const updatedPreviousLoans: PreviousLoanRecord[] = [...(user.previousLoans || [])];
    if (user.creditStatus === 'ASIGNADO' && user.creditLimit > 0) {
      updatedPreviousLoans.unshift({
        id: 'prev-' + Date.now(),
        tramiteId: user.creditTramiteId,
        amountGranted: user.creditLimit,
        totalPaid: user.creditLimit,
        termMonths: user.loanTermMonths || 12,
        taxPercentageApplied: user.taxPercentageApplied ?? loanSettings.taxPercentage,
        interestRateApplied: user.interestRateApplied ?? loanSettings.monthlyInterestRate,
        startDate: user.creditAssignedDate || new Date().toISOString().split('T')[0],
        closedDate: new Date().toISOString().split('T')[0],
        finalStatus: 'REFINANCIADO',
        paymentBehavior: user.daysOverdue && user.daysOverdue > 0 ? 'CON_MORA_SUPERADA' : 'PUNTUAL'
      });
    }

    const updatedUser: User = {
      ...user,
      creditStatus: 'ASIGNADO',
      availableBalance: newBalance,
      creditLimit: newBalance,
      paymentStatus: 'AL_DIA',
      daysOverdue: 0,
      loanTermMonths: termMonths,
      customInstallmentAmount: Math.round(newBalance / termMonths),
      taxPercentageApplied: loanSettings.taxPercentage,
      interestRateApplied: loanSettings.monthlyInterestRate,
      previousLoans: updatedPreviousLoans,
      creditAssignedDate: new Date().toISOString().split('T')[0],
      nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    // Enviar notificación Push en tiempo real al cliente
    notificationService.sendPush({
      title: '🎉 ¡Préstamo Otorgado en CrediULEP!',
      message: `Estimado/a ${user.fullName}, su préstamo ${user.creditTramiteId} ha sido otorgado por valor de $ ${newBalance.toLocaleString('es-CO')} COP.`,
      type: 'credit_assigned'
    });

    await this.addAuditEntry(
      'CREDIT_APPROVED_BY_ADMIN',
      user.id,
      user.cedula,
      `Préstamo otorgado por ${adminName}. Monto prestado: $ ${newBalance.toLocaleString('es-CO')} COP.`
    );

    return { success: true, user: saved, message: 'Préstamo aprobado y notificado al cliente.' };
  }

  /**
   * Edición completa de todos los datos del usuario y del préstamo (Panel Admin y Panel Trabajadores)
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
    let passwordHash = current.passwordHash;
    if (updates.newPassword && updates.newPassword.trim().length > 0) {
      passwordHash = await hashPassword(updates.newPassword.trim(), cleanNewCedula);
    } else if (cleanNewCedula !== current.cedula.trim()) {
      // Si cambió la cédula sin ingresar nueva clave, mantenemos la clave por defecto o requerimos clave si se desea;
      // actualizamos el hash con Password123! para cuentas de prueba si no especificaron nueva clave
      passwordHash = await hashPassword('Password123!', cleanNewCedula);
    }

    const updatedUser: User = {
      ...current,
      cedula: cleanNewCedula,
      fullName: updates.fullName.trim(),
      email: updates.email.trim().toLowerCase(),
      phone: updates.phone.trim(),
      passwordHash,
      isActive: updates.isActive !== undefined ? updates.isActive : current.isActive,
      creditStatus: updates.creditStatus,
      creditTramiteId: updates.creditTramiteId.trim() || current.creditTramiteId,
      creditLimit: Number(updates.creditLimit) || 0,
      availableBalance: updates.creditStatus === 'ASIGNADO' ? Number(updates.availableBalance) || 0 : 0,
      customInstallmentAmount: updates.customInstallmentAmount !== undefined ? Number(updates.customInstallmentAmount) : current.customInstallmentAmount,
      loanTermMonths: Number(updates.loanTermMonths) || 12,
      paymentStatus: updates.paymentStatus || (updates.creditStatus === 'ASIGNADO' ? 'AL_DIA' : 'SIN_ACEPTAR'),
      daysOverdue: Number(updates.daysOverdue) || 0,
      creditAssignedDate: updates.creditAssignedDate || current.creditAssignedDate,
      nextPaymentDate: updates.nextPaymentDate || current.nextPaymentDate,
      taxPercentageApplied: updates.taxPercentageApplied !== undefined ? Number(updates.taxPercentageApplied) : current.taxPercentageApplied,
      interestRateApplied: updates.interestRateApplied !== undefined ? Number(updates.interestRateApplied) : current.interestRateApplied,
      previousLoans: updates.previousLoans !== undefined ? updates.previousLoans : current.previousLoans,
      workerPermissions: updates.workerPermissions !== undefined ? updates.workerPermissions : current.workerPermissions,
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    await this.addAuditEntry(
      'USER_AND_LOAN_DATA_EDITED',
      saved.id,
      saved.cedula,
      `Datos integrales y de préstamo actualizados por ${editorName}: Titular=${saved.fullName}, Estado=${saved.creditStatus}, Cartera=${saved.paymentStatus}, Prestado=$${saved.creditLimit.toLocaleString('es-CO')}, Deuda=$${saved.availableBalance.toLocaleString('es-CO')}.`
    );

    return {
      success: true,
      user: saved,
      message: 'Todos los datos del usuario y del préstamo han sido actualizados correctamente.'
    };
  }

  /**
   * Procesa el pago de cuota o cuota personalizada del préstamo
   */
  static async payLoan(
    userId: string,
    amount: number,
    paymentType: 'CUOTA' | 'CUOTA_PERSONALIZADA' | 'CUOTA_COMPLETA' | 'TOTALIDAD',
    paymentMethod: string
  ): Promise<{ success: boolean; user?: User; message: string }> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
      return { success: false, message: 'Usuario no encontrado.' };
    }

    const user = users[index];
    if (amount <= 0 || user.availableBalance <= 0) {
      return { success: false, message: 'No hay saldo pendiente por pagar.' };
    }

    const appliedAmount = Math.min(user.availableBalance, amount);
    const newBalance = Math.max(0, user.availableBalance - appliedAmount);
    const labelTipo =
      paymentType === 'CUOTA_PERSONALIZADA'
        ? 'Pago de Cuota Personalizada'
        : paymentType === 'TOTALIDAD'
        ? 'Pago de Totalidad del Préstamo'
        : 'Pago de Cuota';

    const loanSettings = this.getLoanSettings();
    const updatedPreviousLoans: PreviousLoanRecord[] = [...(user.previousLoans || [])];
    // Si el saldo llega a 0, se registra automáticamente en el historial de créditos anteriores
    if (newBalance === 0 && !updatedPreviousLoans.some(p => p.tramiteId === user.creditTramiteId)) {
      updatedPreviousLoans.unshift({
        id: 'prev-' + Date.now(),
        tramiteId: user.creditTramiteId,
        amountGranted: user.creditLimit || appliedAmount,
        totalPaid: user.creditLimit || appliedAmount,
        termMonths: user.loanTermMonths || 12,
        taxPercentageApplied: user.taxPercentageApplied ?? loanSettings.taxPercentage,
        interestRateApplied: user.interestRateApplied ?? loanSettings.monthlyInterestRate,
        startDate: user.creditAssignedDate || new Date().toISOString().split('T')[0],
        closedDate: new Date().toISOString().split('T')[0],
        finalStatus: 'PAZ_Y_SALVO',
        paymentBehavior: user.daysOverdue && user.daysOverdue > 0 ? 'CON_MORA_SUPERADA' : 'EXCELENTE'
      });
    }

    const updatedUser: User = {
      ...user,
      availableBalance: newBalance,
      paymentStatus: newBalance === 0 ? 'PAZ_Y_SALVO' : 'AL_DIA',
      daysOverdue: 0,
      previousLoans: updatedPreviousLoans,
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    notificationService.sendPush({
      title: `✅ ${labelTipo} Exitoso`,
      message: `Se registró tu pago por $ ${appliedAmount.toLocaleString('es-CO')} COP vía ${paymentMethod}. Saldo pendiente del préstamo: $ ${newBalance.toLocaleString('es-CO')} COP.`,
      type: 'credit_assigned'
    });

    await this.addAuditEntry(
      paymentType === 'CUOTA_PERSONALIZADA' ? 'LOAN_CUSTOM_PAYMENT' : 'LOAN_INSTALLMENT_PAYMENT',
      user.id,
      user.cedula,
      `${labelTipo} realizado vía ${paymentMethod} por valor de $ ${appliedAmount.toLocaleString('es-CO')} COP. Saldo restante: $ ${newBalance.toLocaleString('es-CO')} COP.`
    );

    return {
      success: true,
      user: saved,
      message: `${labelTipo} procesado exitosamente.`
    };
  }

  /**
   * Solicitud de nuevo crédito tras finalizar el anterior:
   * Registra firma electrónica por OTP, aceptación de condiciones y deja el crédito EN PROCESO DE DESEMBOLSO
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
    const newTramiteId = `TRM-${Math.floor(100000 + Math.random() * 900000)}`;
    const bankApiReference = `ACH-${params.bankEntity
      .slice(0, 4)
      .toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const signedAt = new Date().toISOString();

    const sigHash = await hashPassword(
      `${user.cedula}|${newTramiteId}|${params.requestedAmount}|${params.otpCodeSigned}|${signedAt}`,
      user.cedula
    );

    const updatedUser: User = {
      ...user,
      email: params.updatedEmail ? params.updatedEmail.trim() : user.email,
      phone: params.updatedPhone ? params.updatedPhone.trim() : user.phone,
      nextPaymentDate: params.nextPaymentDate || user.nextPaymentDate,
      creditStatus: 'ASIGNADO',
      paymentStatus: 'EN_DESEMBOLSO',
      creditTramiteId: newTramiteId,
      creditLimit: params.requestedAmount,
      availableBalance: 0,
      loanTermMonths: params.requestedTermMonths,
      customInstallmentAmount: params.estimatedMonthlyInstallment,
      daysOverdue: 0,
      disbursementRequest: {
        tramiteId: newTramiteId,
        requestedAmount: params.requestedAmount,
        requestedTermMonths: params.requestedTermMonths,
        estimatedMonthlyInstallment: params.estimatedMonthlyInstallment,
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
        status: 'EN_PROCESO_DESEMBOLSO'
      },
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    notificationService.sendPush({
      title: 'Firma Electrónica OTP Verificada • En Desembolso',
      message: `Tu nuevo crédito por $ ${params.requestedAmount.toLocaleString('es-CO')} COP fue firmado con OTP (${params.otpCodeSigned}) y está en proceso de desembolso hacia ${params.bankEntity} (${bankApiReference}).`,
      type: 'credit_pending'
    });

    await this.addAuditEntry(
      'NEW_LOAN_SIGNED_OTP_DISBURSEMENT_PENDING',
      user.id,
      user.cedula,
      `Nuevo crédito firmado con OTP (${params.otpCodeSigned}) por $${params.requestedAmount.toLocaleString('es-CO')} COP a ${params.requestedTermMonths} meses. Contacto verificado: ${updatedUser.email} / ${updatedUser.phone}. Entidad: ${params.bankEntity} (${params.accountType} ${params.accountNumber}). Ref Bancaria: ${bankApiReference}. Estado: EN PROCESO DE DESEMBOLSO.`
    );

    return {
      success: true,
      user: saved,
      message: 'Firma electrónica OTP validada. Tu crédito está en proceso de desembolso.'
    };
  }

  /**
   * Activa y confirma el desembolso de un crédito (ya sea vía API de la Entidad Bancaria o por aceptación del Personal)
   */
  static async confirmLoanDisbursement(
    userId: string,
    confirmedBySource: string
  ): Promise<{ success: boolean; user?: User; message: string }> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
      return { success: false, message: 'Usuario no encontrado.' };
    }

    const user = users[index];
    const req = user.disbursementRequest;
    const disbursedAmount = req?.requestedAmount || user.creditLimit || 10000000;
    const termMonths = req?.requestedTermMonths || user.loanTermMonths || 12;
    const installment =
      req?.estimatedMonthlyInstallment ||
      user.customInstallmentAmount ||
      Math.round(disbursedAmount / termMonths);
    const todayDate = new Date().toISOString().split('T')[0];

    const nextDateObj = new Date();
    nextDateObj.setMonth(nextDateObj.getMonth() + 1);
    const nextPaymentDate =
      user.nextPaymentDate || nextDateObj.toISOString().split('T')[0];

    const updatedUser: User = {
      ...user,
      creditStatus: 'ASIGNADO',
      paymentStatus: 'AL_DIA',
      creditLimit: disbursedAmount,
      availableBalance: disbursedAmount,
      loanTermMonths: termMonths,
      customInstallmentAmount: installment,
      creditAssignedDate: todayDate,
      nextPaymentDate,
      daysOverdue: 0,
      disbursementRequest: req
        ? {
            ...req,
            status: 'DESEMBOLSADO',
            confirmedBy: confirmedBySource,
            confirmedAt: new Date().toISOString()
          }
        : undefined,
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    notificationService.sendPush({
      title: '¡Desembolso Exitoso y Crédito Activo!',
      message: `Tu crédito por $ ${disbursedAmount.toLocaleString('es-CO')} COP ha sido desembolsado y activado (${confirmedBySource}).`,
      type: 'credit_assigned'
    });

    await this.addAuditEntry(
      'LOAN_DISBURSEMENT_ACTIVATED',
      user.id,
      user.cedula,
      `Desembolso confirmado y activado por [${confirmedBySource}] por valor de $${disbursedAmount.toLocaleString('es-CO')} COP. Ref: ${req?.bankApiReference || user.creditTramiteId}.`
    );

    return {
      success: true,
      user: saved,
      message: `Desembolso confirmado (${confirmedBySource}). El crédito ya está activo.`
    };
  }

  /**
   * Rechazo de crédito por Administrador
   */
  static async rejectUserCredit(userId: string, reason: string, adminName: string): Promise<{ success: boolean; user?: User; message: string }> {
    const { users } = await this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
      return { success: false, message: 'Usuario no encontrado.' };
    }

    const user = users[index];
    const updatedUser: User = {
      ...user,
      creditStatus: 'RECHAZADO',
      availableBalance: 0,
      integrityChecksum: ''
    };

    const saved = await this.updateUserDirectly(updatedUser);

    notificationService.sendPush({
      title: 'Estado del Trámite Actualizado',
      message: `El trámite ${user.creditTramiteId} no cumple los requisitos vigentes: ${reason}`,
      type: 'credit_pending'
    });

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

    if (newStatus === 'ASIGNADO') {
      notificationService.sendPush({
        title: '🎉 ¡Préstamo Otorgado!',
        message: `Estimado/a ${user.fullName}, préstamo trámite ${user.creditTramiteId} otorgado por $ 18.500.000 COP.`,
        type: 'credit_assigned'
      });
    } else {
      notificationService.sendPush({
        title: '📋 Trámite Pendiente',
        message: `El trámite ${user.creditTramiteId} se encuentra en evaluación.`,
        type: 'credit_pending'
      });
    }

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
