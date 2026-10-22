export type CreditStatus = 'PENDIENTE' | 'ASIGNADO' | 'RECHAZADO';
export type PaymentTimeStatus =
  | 'AL_DIA'
  | 'PROXIMO_VENCIMIENTO'
  | 'EN_MORA'
  | 'PAZ_Y_SALVO'
  | 'SIN_ACEPTAR'
  | 'EN_DESEMBOLSO';
export type UserRole = 'CLIENT' | 'ADMIN' | 'WORKER';

export type WorkerPermission = 
  | 'VER_CARTERA'
  | 'EDITAR_CLIENTES'
  | 'CREAR_USUARIOS' 
  | 'APROBAR_CREDITOS' 
  | 'RECHAZAR_CREDITOS' 
  | 'REGISTRAR_PAGOS'
  | 'GESTIONAR_MORA'
  | 'CONFIGURAR_SISTEMA'
  | 'VER_AUDITORIA';

export interface LoanFinancialBreakdown {
  tramiteId: string;
  principalAmount: number; // Monto principal (crédito desembolsado)
  interestAmount: number; // Interés (intereses de ganancia de la empresa)
  interestRatePercentage: number; // Tasa de interés aplicada (%)
  fianzaAmount: number; // Fianza (garantía / aval)
  fianzaPercentage: number; // Porcentaje de fianza aplicado (%)
  electronicSignatureFee: number; // Firma electrónica (costo certificación OTP)
  electronicSignatureCode: string; // Código / hash de firma electrónica
  collectionExpenses: number; // Gastos de cobranza
  ivaAmount: number; // IVA
  ivaPercentage: number; // Porcentaje de IVA aplicado (%)
  paymentDeadline: string; // Fecha límite de pago
  totalPaymentAmount: number; // Pago total (suma integral del crédito)
  termMonths: number; // Plazo en meses
  monthlyInstallmentAmount: number; // Cuota mensual fijada
  lockedAt: string; // Fecha de fijación del crédito
  isLockedWhileActive: boolean; // Fijado sin poder editar, borrar ni cambiar mientras esté activo
}

export interface DisbursementRequest {
  tramiteId: string;
  requestedAmount: number;
  requestedTermMonths: number;
  estimatedMonthlyInstallment: number;
  bankEntity: string;
  accountType: 'AHORROS' | 'CORRIENTE' | 'BILLETERA_DIGITAL';
  accountNumber: string;
  otpCodeSigned: string;
  signatureHash: string;
  signedAt: string;
  acceptedTerms: boolean;
  acceptedPromissoryNote: boolean;
  acceptedBankMandate: boolean;
  bankApiReference: string;
  status: 'EN_PROCESO_DESEMBOLSO' | 'DESEMBOLSADO';
  confirmedBy?: string;
  confirmedAt?: string;
  loanBreakdown?: LoanFinancialBreakdown;
}

export interface UserSecurityIntegrity {
  checksum: string;
  lastUpdated: string;
}

export interface PreviousLoanRecord {
  id: string;
  tramiteId: string;
  amountGranted: number; // Monto principal desembolsado
  totalPaid: number; // Pago total efectuado
  termMonths: number;
  taxPercentageApplied: number;
  interestRateApplied: number;
  startDate: string;
  closedDate: string;
  finalStatus: 'PAZ_Y_SALVO' | 'REFINANCIADO' | 'FINALIZADO';
  paymentBehavior: 'EXCELENTE' | 'PUNTUAL' | 'CON_MORA_SUPERADA';
  principalAmount?: number;
  interestAmount?: number;
  fianzaAmount?: number;
  electronicSignatureFee?: number;
  electronicSignatureCode?: string;
  collectionExpenses?: number;
  ivaAmount?: number;
  paymentDeadline?: string;
  totalPaymentAmount?: number;
}

export interface LoanGeneralSettings {
  taxPercentage: number; // Porcentaje de IVA aplicable (%)
  monthlyInterestRate: number; // Tasa de interés corriente mensual (% E.M.)
  annualEffectiveRate: number; // Tasa efectiva anual (% E.A.)
  lateFeePercentage: number; // Tasa de recargo / interés de mora (%)
  insurancePercentage: number; // Seguro de vida deudor (%)
  fianzaPercentage?: number; // Porcentaje de fianza sobre monto desembolsado (%)
  electronicSignatureFee?: number; // Costo de firma electrónica certificada (COP)
  collectionExpensesDefault?: number; // Gastos de cobranza base (COP)
  adminStudyFee: number; // Costo administrativo / estudio de crédito (COP)
  minLoanAmount: number; // Monto mínimo de préstamo (COP)
  maxLoanAmount: number; // Monto máximo de préstamo (COP)
  defaultTermMonths: number; // Plazo predeterminado (meses)
  maxTermMonths: number; // Plazo máximo permitido (meses)
  gracePeriodDays: number; // Días de gracia antes de entrar en mora
  allowCustomInstallments: boolean; // Permitir abonos y cuotas personalizadas
  earlyPaymentPenaltyPercentage: number; // Penalidad por pago anticipado (%)
  adPosterUrl?: string; // Imagen o URL del poster publicitario en el Dashboard
  updatedAt: string;
  updatedBy: string;
}

export interface ClientPaymentRecord {
  paymentNumber: string;
  transactionId: string;
  authorizationCode: string;
  amount: number;
  paymentMethod: string;
  payerFullName: string;
  payerCedula: string;
  payerEmail: string;
  status: 'PAGO_PROCESADO' | 'PAGO_CANCELADO';
  paidAt: string;
}

export interface User {
  id: string;
  cedula: string;
  fullName: string;
  email: string;
  phone: string;
  passwordHash: string;
  role?: UserRole;
  workerPermissions?: WorkerPermission[];
  isActive?: boolean;
  createdAt?: string;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  creditStatus: CreditStatus;
  availableBalance: number; // Saldo pendiente actual sobre el Pago Total del crédito activo
  creditLimit: number; // Cupo / Monto principal o límite aprobado
  creditAssignedDate?: string;
  creditEstimatedDate?: string;
  creditTramiteId: string;
  paymentStatus?: PaymentTimeStatus;
  daysOverdue?: number;
  loanTermMonths?: number;
  customInstallmentAmount?: number;
  nextPaymentDate?: string;
  taxPercentageApplied?: number;
  interestRateApplied?: number;
  activeLoanBreakdown?: LoanFinancialBreakdown; // Desglose fijo e inmutable mientras el crédito está activo
  previousLoans?: PreviousLoanRecord[];
  disbursementRequest?: DisbursementRequest;
  lastPaymentNumber?: string;
  lastPaymentStatus?: 'PAGO_PROCESADO' | 'PAGO_CANCELADO';
  lastPaymentAmount?: number;
  lastPaymentMethod?: string;
  lastPaymentDate?: string;
  paymentRecords?: ClientPaymentRecord[];
  acceptedPrivacyPolicy: boolean;
  acceptedPrivacyDate: string;
  failedLoginAttempts: number;
  lockedUntil?: number;
  integrityChecksum: string; // Hash SHA-256 para prevenir y detectar manipulación de datos sensibles
  legalSignature?: LegalSignatureRecord;
}

export interface PolicyAgreements {
  termsAndConditions: boolean;
  privacyPolicy: boolean;
  financialDataConsent: boolean;
  otpElectronicSignatureAgreement: boolean;
  version: string;
  acceptedAt: string;
}

export interface LegalSignatureRecord {
  signatureId: string;
  phoneVerified: string;
  otpCode: string;
  firebasePhoneVerificationToken?: string;
  signedAt: string;
  ipAddress: string;
  userAgent: string;
  platform: string;
  screenResolution: string;
  language: string;
  signatureHash: string; // Hash SHA-256 legal del consentimiento y OTP
  firestoreSynced: boolean;
  firestoreDocId?: string;
  acceptedPolicies: PolicyAgreements;
}

export interface PushNotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: 'credit_assigned' | 'credit_pending' | 'security_alert' | 'login_2fa';
}

export interface AuditBlock {
  index: number;
  timestamp: string;
  action: string;
  userId: string;
  userCedula: string;
  details: string;
  previousHash: string;
  hash: string;
}

export interface SessionState {
  user: User | null;
  isAuthenticated: boolean;
  is2FAVerified: boolean;
  tokenExpiresAt: number | null;
}

