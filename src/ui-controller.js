/**
 * Ruta: src/ui-controller.js
 * Controlador de Interfaz Fintech con Ofuscación de DOM y Política Cero Texto Plano
 * Garantiza que ningún atributo del DOM ni la consola expongan montos, cédulas o estados sensibles
 */

import { FintechEncryptedState } from './fintech-state.js';
import { obfuscateDomToken } from './security-crypto.js';

export class FintechUIController {
  static formatCurrencyCOP(amount) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(Number(amount) || 0);
  }

  static async bindSecureDomAttributes(element, rawEntityId) {
    if (!element) return;
    const maskedToken = await obfuscateDomToken(rawEntityId);
    element.setAttribute('data-vault-ref', maskedToken);
    element.removeAttribute('data-id');
    element.removeAttribute('data-cedula');
    element.removeAttribute('data-balance');
  }

  static computeCircleMetrics(pendingBalance, grantedAmount, isOverdue, daysOverdue) {
    const radius = 116;
    const circumference = 2 * Math.PI * radius;
    const debtRatio =
      grantedAmount > 0 ? Math.min(100, Math.round((pendingBalance / grantedAmount) * 100)) : 0;
    const isPaidOff = grantedAmount > 0 && pendingBalance === 0;
    const progressPercent = isPaidOff ? 100 : Math.max(8, debtRatio);
    const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

    if (isPaidOff) {
      return {
        radius,
        circumference,
        strokeDashoffset,
        strokeColor: '#059669',
        trackColor: '#d1fae5',
        statusLabel: 'PAZ Y SALVO • 100% PAGADO'
      };
    }

    if (isOverdue) {
      return {
        radius,
        circumference,
        strokeDashoffset,
        strokeColor: '#dc2626',
        trackColor: '#fee2e2',
        statusLabel: `EN MORA (${daysOverdue || 30} DÍAS)`
      };
    }

    return {
      radius,
      circumference,
      strokeDashoffset,
      strokeColor: '#059669',
      trackColor: '#d1fae5',
      statusLabel: 'CRÉDITO AL DÍA'
    };
  }

  static async prepareDashboardViewModel(userRecord) {
    const portfolio = await FintechEncryptedState.getClientPortfolioState(userRecord);
    const circle = this.computeCircleMetrics(
      portfolio.pendingBalance,
      portfolio.grantedAmount,
      portfolio.isOverdue,
      portfolio.daysOverdue
    );

    return {
      domToken: portfolio.domToken,
      stateSignature: portfolio.stateSignature,
      isUnderValidation: portfolio.isUnderValidation,
      isOverdue: portfolio.isOverdue,
      formattedPendingBalance: this.formatCurrencyCOP(portfolio.pendingBalance),
      formattedGrantedAmount: this.formatCurrencyCOP(portfolio.grantedAmount),
      formattedInstallment: this.formatCurrencyCOP(portfolio.installmentAmount),
      allowedPaymentModes: portfolio.allowedPaymentModes,
      previousLoans: portfolio.previousLoans.map(loan => ({
        id: loan.id,
        formattedAmountGranted: this.formatCurrencyCOP(loan.amountGranted),
        date: loan.date
      })),
      circle
    };
  }
}
