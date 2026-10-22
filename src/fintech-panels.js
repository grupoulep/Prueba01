/**
 * Ruta: src/fintech-panels.js
 * Motor Reactivo de Sincronización entre Panel Administrativo y Panel de Trabajadores
 * Incluye: Edición Directa en Celda (Inline Editing), Auditoría Cifrada en localStorage y Cifrado AES-256-GCM
 */

import {
  encryptPayloadAesGcm,
  decryptPayloadAesGcm,
  saveEncryptedStorage,
  loadEncryptedStorage,
  recordEncryptedAuditLog,
  getEncryptedAuditLogs
} from './security-crypto.js';

const UNIFIED_STORAGE_KEY = 'CREDIULEP_UNIFIED_PANELS_ENC_STATE_V2';

export class FintechPanelsEngine {
  constructor() {
    this.subscribers = new Set();
    this.lastSyncHash = 'AES256-GCM-INIT';
    this.lastSyncTimestamp = new Date().toISOString();
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify(eventPayload) {
    this.lastSyncTimestamp = new Date().toISOString();
    for (const cb of this.subscribers) {
      cb(eventPayload);
    }
  }

  async encryptAndBroadcastChange(changeRecord) {
    const envelope = await encryptPayloadAesGcm({
      ...changeRecord,
      timestamp: new Date().toISOString()
    });
    this.lastSyncHash = envelope.hmac.slice(0, 16).toUpperCase();
    await saveEncryptedStorage(UNIFIED_STORAGE_KEY, changeRecord);

    // Registrar automáticamente cada modificación en el log de auditoría cifrado en localStorage
    await recordEncryptedAuditLog({
      category: 'MODIFICATION',
      action: changeRecord.action || (changeRecord.field ? `EDIT_${String(changeRecord.field).toUpperCase()}` : 'PANEL_DATA_UPDATE'),
      actorName: changeRecord.editor || 'Operador Autorizado',
      actorRole: changeRecord.actorRole || 'ADMIN_OR_WORKER',
      targetId: changeRecord.userId || changeRecord.workerId || changeRecord.cedula || 'GLOBAL',
      field: changeRecord.field,
      newValue: changeRecord.newValue ?? changeRecord.value,
      details: changeRecord.details
    });

    this.notify({
      type: 'CRYPTO_SYNC_EVENT',
      hash: this.lastSyncHash,
      timestamp: this.lastSyncTimestamp,
      envelope
    });
    return {
      hash: this.lastSyncHash,
      timestamp: this.lastSyncTimestamp,
      envelope
    };
  }

  async recordAccessEvent(accessData) {
    const auditResult = await recordEncryptedAuditLog({
      category: 'ACCESS',
      action: accessData.action || 'MODULE_ACCESS',
      actorCedula: accessData.actorCedula,
      actorName: accessData.actorName,
      actorRole: accessData.actorRole,
      targetId: accessData.module || 'WORKSPACE',
      details: accessData.details || `Acceso al módulo [${accessData.module}] por ${accessData.actorName} (${accessData.actorRole})`
    });

    if (auditResult?.envelopeHmac) {
      this.lastSyncHash = auditResult.envelopeHmac.slice(0, 16).toUpperCase();
    }

    this.notify({
      type: 'CRYPTO_AUDIT_ACCESS_EVENT',
      hash: this.lastSyncHash,
      timestamp: new Date().toISOString()
    });

    return auditResult;
  }

  async getRegulatoryAuditLogs() {
    return await getEncryptedAuditLogs();
  }

  static calculateLoanMetrics(loan, globalPolicy) {
    const breakdown = loan.activeLoanBreakdown;
    const limit = Number(breakdown?.principalAmount ?? loan.creditLimit) || 0;
    const balance = Number(loan.availableBalance) || 0;
    const daysOverdue = Number(loan.daysOverdue) || 0;
    const baseRate = Number(
      breakdown?.interestRatePercentage ??
        loan.interestRate ??
        globalPolicy?.interestRatePercentage ??
        1.85
    );
    const lateFeeRate = Number(globalPolicy?.lateFeePercentage ?? 2.8);
    const taxRate = Number(
      breakdown?.ivaPercentage ?? globalPolicy?.taxPercentage ?? 19
    );
    const fianzaRate = Number(
      breakdown?.fianzaPercentage ?? globalPolicy?.fianzaPercentage ?? 6.5
    );

    const principalAmount = limit;
    const interestAmount =
      breakdown?.interestAmount !== undefined
        ? Number(breakdown.interestAmount)
        : Math.round(principalAmount * (baseRate / 100) * (Number(loan.termMonths) || 12));
    const fianzaAmount =
      breakdown?.fianzaAmount !== undefined
        ? Number(breakdown.fianzaAmount)
        : Math.round(principalAmount * (fianzaRate / 100));
    const electronicSignatureFee =
      breakdown?.electronicSignatureFee !== undefined
        ? Number(breakdown.electronicSignatureFee)
        : Number(globalPolicy?.electronicSignatureFee ?? 28500);
    const collectionExpenses =
      breakdown?.collectionExpenses !== undefined
        ? Number(breakdown.collectionExpenses)
        : daysOverdue > 0
        ? Math.round(
            principalAmount * (lateFeeRate / 100) * Math.min(daysOverdue / 30, 6)
          )
        : Number(globalPolicy?.collectionExpensesDefault ?? 0);
    const ivaAmount =
      breakdown?.ivaAmount !== undefined
        ? Number(breakdown.ivaAmount)
        : Math.round(
            (fianzaAmount + electronicSignatureFee + collectionExpenses) *
              (taxRate / 100)
          );
    const totalPaymentAmount =
      breakdown?.totalPaymentAmount !== undefined
        ? Number(breakdown.totalPaymentAmount)
        : principalAmount +
          interestAmount +
          fianzaAmount +
          electronicSignatureFee +
          collectionExpenses +
          ivaAmount;

    const monthlyInterest = Math.round(principalAmount * (baseRate / 100));
    const overduePenalty = collectionExpenses;
    const taxAmount = ivaAmount;
    const totalPayable = balance > 0 ? balance : totalPaymentAmount;

    return {
      limit,
      balance,
      daysOverdue,
      principalAmount,
      interestAmount,
      fianzaAmount,
      electronicSignatureFee,
      collectionExpenses,
      ivaAmount,
      totalPaymentAmount,
      monthlyInterest,
      overduePenalty,
      taxAmount,
      totalPayable
    };
  }
}

export const fintechPanelsEngine = new FintechPanelsEngine();
