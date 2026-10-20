/**
 * Ruta: src/fintech-state.js
 * Gestor de Estado Financiero Cifrado (Zero-Plaintext Policy)
 * Todo estado de préstamos, cupos, mora, impuestos e historial se persiste cifrado con AES-256-GCM + HMAC-SHA256
 */

import {
  saveEncryptedVault,
  readEncryptedVault,
  signHmacSha256,
  obfuscateDomToken
} from './security-crypto.js';

const VAULT_USERS_KEY = 'crediulep_secure_users_v2';
const VAULT_SETTINGS_KEY = 'crediulep_general_loan_settings_v1';
const VAULT_AUDIT_KEY = 'crediulep_tamper_audit_v2';

const DEFAULT_GENERAL_LOAN_SETTINGS = {
  taxPercentage: 4.5,
  monthlyInterestRate: 1.85,
  annualEffectiveRate: 24.6,
  lateFeePercentage: 2.8,
  insurancePercentage: 0.45,
  adminStudyFee: 45000,
  minLoanAmount: 1000000,
  maxLoanAmount: 50000000,
  defaultTermMonths: 12,
  maxTermMonths: 60,
  gracePeriodDays: 5,
  allowCustomInstallments: true,
  earlyPaymentPenaltyPercentage: 0
};

export class FintechEncryptedState {
  static async getLoanSettings() {
    const decrypted = await readEncryptedVault(VAULT_SETTINGS_KEY);
    if (!decrypted) {
      await saveEncryptedVault(VAULT_SETTINGS_KEY, DEFAULT_GENERAL_LOAN_SETTINGS);
      return { ...DEFAULT_GENERAL_LOAN_SETTINGS };
    }
    return { ...DEFAULT_GENERAL_LOAN_SETTINGS, ...decrypted };
  }

  static async updateLoanSettings(partialSettings, updatedBy) {
    const current = await this.getLoanSettings();
    const updated = {
      ...current,
      ...partialSettings,
      updatedAt: new Date().toISOString(),
      updatedBy
    };
    await saveEncryptedVault(VAULT_SETTINGS_KEY, updated);
    return updated;
  }

  static async getClientPortfolioState(userRecord) {
    const settings = await this.getLoanSettings();
    const isUnderValidation =
      userRecord.creditStatus === 'PENDIENTE' || userRecord.paymentStatus === 'SIN_ACEPTAR';
    const isOverdue =
      !isUnderValidation &&
      (userRecord.paymentStatus === 'EN_MORA' || (userRecord.daysOverdue || 0) > 0) &&
      userRecord.availableBalance > 0;

    const grantedAmount = userRecord.creditLimit || 0;
    const pendingBalance = isUnderValidation ? 0 : userRecord.availableBalance || 0;
    const termMonths = userRecord.loanTermMonths || settings.defaultTermMonths || 12;
    const baseInstallment =
      userRecord.customInstallmentAmount && userRecord.customInstallmentAmount > 0
        ? userRecord.customInstallmentAmount
        : grantedAmount > 0
        ? Math.round(grantedAmount / termMonths)
        : 0;

    const domToken = await obfuscateDomToken(userRecord.id || userRecord.cedula);
    const stateSignature = await signHmacSha256(
      `${userRecord.id}|${grantedAmount}|${pendingBalance}|${userRecord.creditStatus}|${userRecord.paymentStatus}`
    );

    return {
      domToken,
      stateSignature,
      isUnderValidation,
      isOverdue,
      daysOverdue: userRecord.daysOverdue || 0,
      grantedAmount,
      pendingBalance,
      installmentAmount: isOverdue ? pendingBalance : Math.min(pendingBalance, baseInstallment),
      allowedPaymentModes: isOverdue
        ? ['CREDITO_COMPLETO']
        : ['CUOTA', 'CUOTA_PERSONALIZADA'],
      previousLoans: Array.isArray(userRecord.previousLoans)
        ? userRecord.previousLoans.map(item => ({
            id: item.id,
            amountGranted: item.amountGranted,
            date: item.closedDate || item.startDate
          }))
        : []
    };
  }

  static async recordEncryptedAuditEvent(action, actorId, details) {
    const currentChain = (await readEncryptedVault(VAULT_AUDIT_KEY)) || [];
    const prevBlock = currentChain[currentChain.length - 1];
    const previousHash = prevBlock ? prevBlock.hash : '0';
    const index = currentChain.length;
    const timestamp = new Date().toISOString();
    const hash = await signHmacSha256(
      `${index}|${timestamp}|${action}|${actorId}|${details}|${previousHash}`
    );

    const block = {
      index,
      timestamp,
      action,
      userId: actorId,
      details,
      previousHash,
      hash
    };

    currentChain.push(block);
    await saveEncryptedVault(VAULT_AUDIT_KEY, currentChain);
    return block;
  }

  static async saveEncryptedUsers(usersList) {
    return await saveEncryptedVault(VAULT_USERS_KEY, usersList);
  }

  static async readEncryptedUsers() {
    return (await readEncryptedVault(VAULT_USERS_KEY)) || [];
  }
}
