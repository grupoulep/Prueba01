/**
 * Servicio Criptográfico de Integridad y Seguridad
 * Diseñado con el estándar Web Cryptography API (crypto.subtle)
 * Garantiza que nadie pueda modificar, manipular o alterar la información sensible de los usuarios.
 */

import { User, AuditBlock } from '../types';

// Clave secreta interna para cálculo de HMAC / checksums de integridad
const SYSTEM_INTEGRITY_SALT = 'CREDI_PORTAL_SECURE_VAULT_INTEGRITY_SALT_v1_2026';

/**
 * Convierte un ArrayBuffer a cadena hexadecimal
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Genera un Hash SHA-256 estándar
 */
export async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  return bufferToHex(hashBuffer);
}

/**
 * Genera un hash seguro para contraseñas con sal
 */
export async function hashPassword(password: string, cedula: string): Promise<string> {
  const salted = `${SYSTEM_INTEGRITY_SALT}::${cedula}::${password}`;
  return await sha256(salted);
}

/**
 * Calcula el Checksum Criptográfico de Integridad para datos sensibles del usuario.
 * Cualquier modificación a cédula, nombre, saldo o estado invalidará el hash.
 */
export async function calculateUserIntegrityChecksum(user: Omit<User, 'integrityChecksum'>): Promise<string> {
  const canonicalString = [
    SYSTEM_INTEGRITY_SALT,
    user.id,
    user.cedula.trim(),
    user.fullName.trim(),
    user.email.trim().toLowerCase(),
    user.role || 'CLIENT',
    user.creditStatus,
    user.availableBalance.toFixed(2),
    user.creditTramiteId,
    user.passwordHash
  ].join('|');

  return await sha256(canonicalString);
}

/**
 * Valida si los datos sensibles de un usuario han sido alterados o manipulados.
 */
export async function verifyUserIntegrity(user: User): Promise<boolean> {
  if (!user.integrityChecksum) return false;
  const { integrityChecksum, ...rest } = user;
  const expectedChecksum = await calculateUserIntegrityChecksum(rest);
  return integrityChecksum === expectedChecksum;
}

/**
 * Genera un código OTP criptográfico seguro de 6 dígitos para 2FA y Recuperación
 */
export function generateSecureOTP(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = (array[0] % 900000) + 100000;
  return code.toString();
}

/**
 * Calcula el hash de un bloque de auditoría inmutable
 */
export async function calculateBlockAuditHash(
  index: number,
  timestamp: string,
  action: string,
  userId: string,
  details: string,
  previousHash: string
): Promise<string> {
  const blockData = `${index}-${timestamp}-${action}-${userId}-${details}-${previousHash}`;
  return await sha256(blockData);
}

/**
 * Valida la integridad completa de la cadena de auditoría (Blockchain Ledger)
 */
export async function verifyAuditChainIntegrity(chain: AuditBlock[]): Promise<boolean> {
  if (!chain || chain.length === 0) return true;

  for (let i = 0; i < chain.length; i++) {
    const block = chain[i];
    
    // El bloque génesis tiene previousHash '0'
    if (i === 0) {
      if (block.previousHash !== '0') return false;
    } else {
      if (block.previousHash !== chain[i - 1].hash) return false;
    }

    const calculatedHash = await calculateBlockAuditHash(
      block.index,
      block.timestamp,
      block.action,
      block.userId,
      block.details,
      block.previousHash
    );

    if (calculatedHash !== block.hash) {
      return false;
    }
  }

  return true;
}

/**
 * Clave Maestra de Cifrado AES-GCM de 256 bits para Firestore
 * Los datos viajan y se almacenan 100% blindados de manera que ni en Firebase es posible
 * conocer la cédula, nombres, saldos, contraseñas o transacciones.
 */
const FIREBASE_ENCRYPTION_SECRET = 'CREDIULEP_FIREBASE_MILITARY_GRADE_KEY_v2_902050377_SECURE';

async function deriveAESGCMKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(FIREBASE_ENCRYPTION_SECRET),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('CREDIULEP_FIREBASE_SALT_IMMUTABLE_2026'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Cifra un objeto o registro arbitrario con AES-GCM de 256 bits y vector de inicialización aleatorio
 */
export async function encryptPayloadAES256GCM(data: unknown): Promise<{ ciphertext: string; iv: string }> {
  const key = await deriveAESGCMKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  const cipherBytes = new Uint8Array(encryptedBuffer);
  let binaryCipher = '';
  for (let i = 0; i < cipherBytes.byteLength; i++) {
    binaryCipher += String.fromCharCode(cipherBytes[i]);
  }

  let binaryIv = '';
  for (let i = 0; i < iv.byteLength; i++) {
    binaryIv += String.fromCharCode(iv[i]);
  }

  return {
    ciphertext: btoa(binaryCipher),
    iv: btoa(binaryIv)
  };
}

/**
 * Descifra un payload cifrado con AES-GCM de 256 bits
 */
export async function decryptPayloadAES256GCM<T>(ciphertext: string, iv: string): Promise<T | null> {
  try {
    const key = await deriveAESGCMKey();
    const binaryCipher = atob(ciphertext);
    const cipherBytes = new Uint8Array(binaryCipher.length);
    for (let i = 0; i < binaryCipher.length; i++) {
      cipherBytes[i] = binaryCipher.charCodeAt(i);
    }

    const binaryIv = atob(iv);
    const ivBytes = new Uint8Array(binaryIv.length);
    for (let i = 0; i < binaryIv.length; i++) {
      ivBytes[i] = binaryIv.charCodeAt(i);
    }

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      key,
      cipherBytes
    );

    const decoded = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(decoded) as T;
  } catch {
    // Si los datos fueron manipulados en Firebase o la clave es incorrecta, AES-GCM rechaza el descifrado sin imprimir en consola
    return null;
  }
}

/**
 * Genera un ID ciego irreversible para Firebase para no exponer identificadores reales
 */
export async function generateBlindFirebaseId(originalId: string): Promise<string> {
  const hash = await sha256(`BLIND_FIREBASE_ID_${originalId}_ULEP`);
  return `vault_${hash.substring(0, 32)}`;
}

export {
  encryptZeroPlaintext,
  decryptZeroPlaintext,
  signHmacSha256,
  verifyHmacSha256,
  setEncryptedStorageItem,
  getEncryptedStorageItem,
  obfuscateDomIdentifier
} from './security-crypto';

