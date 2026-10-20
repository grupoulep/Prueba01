/**
 * Módulo Criptográfico Dedicado: Zero-Plaintext Policy (E2EE)
 * Estándar: Web Crypto API nativa (SubtleCrypto)
 * - Cifrado simétrico: AES-GCM de 256 bits
 * - Derivación de claves: PBKDF2 (100,000 iteraciones, SHA-256) con Salt dinámico por operación
 * - Vector de Inicialización (IV): Único de 96 bits (12 bytes) por cada operación de cifrado
 * - Firma de Integridad: HMAC-SHA256 autenticado (Encrypt-then-MAC)
 */

export interface EncryptedEnvelope {
  v: 'AES256GCM-PBKDF2-HMACSHA256-v1';
  salt: string;
  iv: string;
  ciphertext: string;
  hmac: string;
  ts: number;
}

const MASTER_VAULT_PASSPHRASE =
  'CREDIULEP_FINTECH_ZERO_PLAINTEXT_MASTER_KEY_AES256GCM_PBKDF2_2026';
const HMAC_SIGNING_SECRET =
  'CREDIULEP_FINTECH_HMAC_SHA256_INTEGRITY_AUTHENTICATION_KEY_2026';
const PBKDF2_ITERATIONS = 100000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Deriva una clave simétrica AES-GCM de 256 bits mediante PBKDF2 y un Salt dinámico
 */
async function deriveAES256GCMKey(salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(MASTER_VAULT_PASSPHRASE),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Genera y verifica firmas de integridad HMAC-SHA256
 */
async function importHmacKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(HMAC_SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signHmacSha256(canonicalPayload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await importHmacKey();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(canonicalPayload));
  return bufferToHex(signature);
}

export async function verifyHmacSha256(
  canonicalPayload: string,
  expectedHexSignature: string
): Promise<boolean> {
  const computed = await signHmacSha256(canonicalPayload);
  return constantTimeHexEqual(computed, expectedHexSignature);
}

/**
 * Cifra cualquier estructura de datos sensible bajo la política Zero-Plaintext
 * con Salt dinámico de 16 bytes, IV único de 12 bytes y firma HMAC-SHA256.
 */
export async function encryptZeroPlaintext<T>(payload: T): Promise<EncryptedEnvelope> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAES256GCMKey(saltBytes);

  const encodedPlaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    aesKey,
    encodedPlaintext
  );

  const salt = bytesToBase64(saltBytes);
  const iv = bytesToBase64(ivBytes);
  const ciphertext = bytesToBase64(new Uint8Array(encryptedBuffer));
  const ts = Date.now();
  const version = 'AES256GCM-PBKDF2-HMACSHA256-v1' as const;

  const canonicalMessage = `${version}|${salt}|${iv}|${ciphertext}|${ts}`;
  const hmac = await signHmacSha256(canonicalMessage);

  return {
    v: version,
    salt,
    iv,
    ciphertext,
    hmac,
    ts
  };
}

/**
 * Verifica la firma HMAC-SHA256 y descifra un sobre encriptado AES-GCM de 256 bits.
 */
export async function decryptZeroPlaintext<T>(
  envelopeOrRaw: EncryptedEnvelope | string
): Promise<T | null> {
  try {
    const envelope: EncryptedEnvelope =
      typeof envelopeOrRaw === 'string' ? JSON.parse(envelopeOrRaw) : envelopeOrRaw;

    if (
      !envelope ||
      envelope.v !== 'AES256GCM-PBKDF2-HMACSHA256-v1' ||
      !envelope.salt ||
      !envelope.iv ||
      !envelope.ciphertext ||
      !envelope.hmac
    ) {
      return null;
    }

    const canonicalMessage = `${envelope.v}|${envelope.salt}|${envelope.iv}|${envelope.ciphertext}|${envelope.ts}`;
    const isAuthentic = await verifyHmacSha256(canonicalMessage, envelope.hmac);
    if (!isAuthentic) {
      return null;
    }

    const saltBytes = base64ToBytes(envelope.salt);
    const ivBytes = base64ToBytes(envelope.iv);
    const cipherBytes = base64ToBytes(envelope.ciphertext);

    const aesKey = await deriveAES256GCMKey(saltBytes);
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
      aesKey,
      cipherBytes as unknown as BufferSource
    );

    const decodedJson = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(decodedJson) as T;
  } catch {
    return null;
  }
}

/**
 * Determina si una cadena almacenada en localStorage/sessionStorage ya es un sobre encriptado E2EE
 */
export function isEncryptedEnvelopeString(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return Boolean(
      parsed &&
        parsed.v === 'AES256GCM-PBKDF2-HMACSHA256-v1' &&
        typeof parsed.salt === 'string' &&
        typeof parsed.iv === 'string' &&
        typeof parsed.ciphertext === 'string' &&
        typeof parsed.hmac === 'string'
    );
  } catch {
    return false;
  }
}

/**
 * Almacena datos cifrados en localStorage cumpliendo Zero-Plaintext Policy
 */
export async function setEncryptedStorageItem<T>(
  key: string,
  data: T,
  useSession = false
): Promise<EncryptedEnvelope> {
  const envelope = await encryptZeroPlaintext(data);
  const storage = useSession ? sessionStorage : localStorage;
  storage.setItem(key, JSON.stringify(envelope));
  return envelope;
}

/**
 * Lee y descifra datos de localStorage/sessionStorage. Si detecta datos legados en texto plano,
 * los migra inmediatamente a formato cifrado AES-256-GCM + HMAC-SHA256.
 */
export async function getEncryptedStorageItem<T>(
  key: string,
  useSession = false
): Promise<T | null> {
  const storage = useSession ? sessionStorage : localStorage;
  const raw = storage.getItem(key);
  if (!raw) return null;

  if (isEncryptedEnvelopeString(raw)) {
    return await decryptZeroPlaintext<T>(raw);
  }

  // Migración automática de datos legados en texto plano a sobre cifrado Zero-Plaintext
  try {
    const legacyParsed = JSON.parse(raw) as T;
    await setEncryptedStorageItem(key, legacyParsed, useSession);
    return legacyParsed;
  } catch {
    return null;
  }
}

/**
 * Ofusca identificadores para atributos del DOM sin exponer información financiera ni PII
 */
export async function obfuscateDomIdentifier(rawId: string): Promise<string> {
  const sig = await signHmacSha256(`DOM_MASK::${rawId}`);
  return `sec_${sig.substring(0, 16)}`;
}
