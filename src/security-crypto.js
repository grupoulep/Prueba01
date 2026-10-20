/**
 * Ruta: src/security-crypto.js
 * Módulo de Criptografía y Auditoría Normativa Fintech de Extremo a Extremo (Zero-Plaintext Policy)
 * API Nativa: Web Crypto API (window.crypto.subtle)
 * Estándares: AES-GCM 256 bits + PBKDF2 con Salt dinámico + IV único de 96 bits + Firma HMAC-SHA256
 */

const MASTER_KEY_MATERIAL = 'CREDIULEP_FINTECH_ZERO_PLAINTEXT_MASTER_KEY_AES256GCM_PBKDF2_2026';
const HMAC_SECRET_MATERIAL = 'CREDIULEP_FINTECH_HMAC_SHA256_INTEGRITY_AUTHENTICATION_KEY_2026';
const PBKDF2_ITERATIONS = 100000;
const ENVELOPE_VERSION = 'AES256GCM-PBKDF2-HMACSHA256-v1';
export const FINTECH_AUDIT_LOG_STORAGE_KEY = 'CREDIULEP_FINTECH_REGULATORY_AUDIT_LOG_ENC_V1';

function uint8ToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function deriveAesGcm256Key(saltBytes) {
  const encoder = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(MASTER_KEY_MATERIAL),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function getHmacSigningKey() {
  const encoder = new TextEncoder();
  return await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(HMAC_SECRET_MATERIAL),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signHmacSha256(message) {
  const encoder = new TextEncoder();
  const hmacKey = await getHmacSigningKey();
  const signatureBuffer = await window.crypto.subtle.sign(
    'HMAC',
    hmacKey,
    encoder.encode(message)
  );
  return arrayBufferToHex(signatureBuffer);
}

export async function verifyHmacSha256(message, expectedHexSignature) {
  const computedSignature = await signHmacSha256(message);
  return timingSafeEqualHex(computedSignature, expectedHexSignature);
}

export async function encryptSensitivePayload(payload) {
  const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
  const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAesGcm256Key(saltBytes);

  const encodedData = new TextEncoder().encode(JSON.stringify(payload));
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    aesKey,
    encodedData
  );

  const salt = uint8ToBase64(saltBytes);
  const iv = uint8ToBase64(ivBytes);
  const ciphertext = uint8ToBase64(new Uint8Array(encryptedBuffer));
  const ts = Date.now();
  const canonical = `${ENVELOPE_VERSION}|${salt}|${iv}|${ciphertext}|${ts}`;
  const hmac = await signHmacSha256(canonical);

  return {
    v: ENVELOPE_VERSION,
    salt,
    iv,
    ciphertext,
    hmac,
    ts
  };
}

export async function decryptSensitivePayload(rawOrEnvelope) {
  try {
    const envelope =
      typeof rawOrEnvelope === 'string' ? JSON.parse(rawOrEnvelope) : rawOrEnvelope;

    if (
      !envelope ||
      envelope.v !== ENVELOPE_VERSION ||
      !envelope.salt ||
      !envelope.iv ||
      !envelope.ciphertext ||
      !envelope.hmac
    ) {
      return null;
    }

    const canonical = `${envelope.v}|${envelope.salt}|${envelope.iv}|${envelope.ciphertext}|${envelope.ts}`;
    const validMac = await verifyHmacSha256(canonical, envelope.hmac);
    if (!validMac) {
      return null;
    }

    const saltBytes = base64ToUint8(envelope.salt);
    const ivBytes = base64ToUint8(envelope.iv);
    const cipherBytes = base64ToUint8(envelope.ciphertext);

    const aesKey = await deriveAesGcm256Key(saltBytes);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      aesKey,
      cipherBytes
    );

    const jsonString = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

export async function saveEncryptedVault(storageKey, data, useSessionStorage = false) {
  const envelope = await encryptSensitivePayload(data);
  const targetStorage = useSessionStorage ? window.sessionStorage : window.localStorage;
  targetStorage.setItem(storageKey, JSON.stringify(envelope));
  return envelope;
}

export async function readEncryptedVault(storageKey, useSessionStorage = false) {
  const targetStorage = useSessionStorage ? window.sessionStorage : window.localStorage;
  const raw = targetStorage.getItem(storageKey);
  if (!raw) return null;
  return await decryptSensitivePayload(raw);
}

export async function obfuscateDomToken(identifier) {
  const mac = await signHmacSha256(`DOM_TOKEN::${identifier}`);
  return `vault_${mac.substring(0, 16)}`;
}

// ============================================================================
// FUNCIÓN DE AUDITORÍA NORMATIVA FINTECH CIFRADA EN LOCALSTORAGE (AES-256-GCM)
// Registra cada acceso (ACCESS) y modificación (MODIFICATION) con cadena HMAC
// ============================================================================

/**
 * Registra un evento de acceso o modificación en un log cifrado con AES-256-GCM
 * y encadenado con HMAC-SHA256 en localStorage para cumplimiento normativo Fintech.
 *
 * @param {Object} eventData
 * @param {'ACCESS' | 'MODIFICATION' | 'SECURITY' | 'COMPLIANCE'} [eventData.category]
 * @param {string} eventData.action - Código de la acción (ej. 'MODULE_ACCESS', 'CELL_EDIT', 'LOAN_PAYMENT')
 * @param {string} [eventData.actorId] - ID del usuario u operador que realiza la acción
 * @param {string} [eventData.actorCedula] - Cédula o código del actor
 * @param {string} [eventData.actorName] - Nombre del actor
 * @param {string} [eventData.actorRole] - Rol ('ADMIN' | 'WORKER' | 'CLIENT')
 * @param {string} [eventData.targetId] - ID del registro afectado
 * @param {string} [eventData.field] - Campo modificado (si aplica)
 * @param {any} [eventData.previousValue] - Valor anterior (si aplica)
 * @param {any} [eventData.newValue] - Nuevo valor (si aplica)
 * @param {string} [eventData.details] - Descripción detallada para cumplimiento normativo
 */
export async function recordEncryptedAuditLog(eventData = {}) {
  try {
    const existingLogs = await readEncryptedVault(FINTECH_AUDIT_LOG_STORAGE_KEY, false);
    const logsArray = Array.isArray(existingLogs) ? existingLogs : [];

    const sequence = logsArray.length + 1;
    const previousEntry = logsArray.length > 0 ? logsArray[logsArray.length - 1] : null;
    const previousHash = previousEntry?.entryHmac || 'GENESIS_FINTECH_COMPLIANCE_000000000000';
    const timestamp = new Date().toISOString();

    const category =
      eventData.category ||
      (String(eventData.action || '').includes('ACCESS') ||
      String(eventData.action || '').includes('LOGIN') ||
      String(eventData.action || '').includes('VIEW')
        ? 'ACCESS'
        : 'MODIFICATION');

    const action = String(eventData.action || 'FINTECH_OPERATION').toUpperCase();
    const actorCedula = String(eventData.actorCedula || eventData.editor || 'SYSTEM');
    const actorName = String(eventData.actorName || eventData.editor || 'Sistema CrediULEP');
    const actorRole = String(eventData.actorRole || 'SYSTEM');
    const targetId = String(eventData.targetId || eventData.userId || 'GLOBAL');
    const field = eventData.field ? String(eventData.field) : undefined;
    const details =
      eventData.details ||
      (field
        ? `[${category}] ${actorName} (${actorRole}) modificó [${field}] en registro ${targetId}`
        : `[${category}] ${actorName} (${actorRole}) ejecutó ${action} sobre ${targetId}`);

    const canonicalRecord = [
      sequence,
      timestamp,
      category,
      action,
      actorCedula,
      actorRole,
      targetId,
      field || '',
      details,
      previousHash
    ].join('|');

    const entryHmac = await signHmacSha256(canonicalRecord);

    const newAuditEntry = {
      sequence,
      auditId: `AUD-${sequence}-${entryHmac.slice(0, 10).toUpperCase()}`,
      timestamp,
      category,
      action,
      actorCedula,
      actorName,
      actorRole,
      targetId,
      field,
      previousValue: eventData.previousValue,
      newValue: eventData.newValue,
      details,
      previousHash,
      entryHmac
    };

    logsArray.push(newAuditEntry);

    // Conservar los últimos 500 registros normativos cifrados en localStorage
    const boundedLogs = logsArray.length > 500 ? logsArray.slice(-500) : logsArray;
    const envelope = await saveEncryptedVault(FINTECH_AUDIT_LOG_STORAGE_KEY, boundedLogs, false);

    return {
      entry: newAuditEntry,
      envelopeHmac: envelope.hmac,
      totalEntries: boundedLogs.length
    };
  } catch (err) {
    console.error('Error registrando auditoría cifrada Fintech:', err);
    return null;
  }
}

/**
 * Descifra y verifica la integridad criptográfica (HMAC-SHA256) de todos los registros
 * del log de auditoría almacenado en localStorage.
 */
export async function getEncryptedAuditLogs() {
  try {
    const logs = await readEncryptedVault(FINTECH_AUDIT_LOG_STORAGE_KEY, false);
    if (!Array.isArray(logs)) {
      return { logs: [], isCompliant: true, totalEntries: 0 };
    }

    let isCompliant = true;
    for (let i = 0; i < logs.length; i++) {
      const item = logs[i];
      const canonical = [
        item.sequence,
        item.timestamp,
        item.category,
        item.action,
        item.actorCedula,
        item.actorRole,
        item.targetId,
        item.field || '',
        item.details,
        item.previousHash
      ].join('|');

      const isValid = await verifyHmacSha256(canonical, item.entryHmac);
      if (!isValid) {
        isCompliant = false;
        break;
      }
      if (i > 0 && item.previousHash !== logs[i - 1].entryHmac) {
        isCompliant = false;
        break;
      }
    }

    return {
      logs: [...logs].reverse(),
      isCompliant,
      totalEntries: logs.length
    };
  } catch {
    return { logs: [], isCompliant: false, totalEntries: 0 };
  }
}

// Exportaciones estandarizadas para el motor de paneles Fintech
export const encryptPayloadAesGcm = encryptSensitivePayload;
export const decryptPayloadAesGcm = decryptSensitivePayload;
export const saveEncryptedStorage = saveEncryptedVault;
export const loadEncryptedStorage = readEncryptedVault;
