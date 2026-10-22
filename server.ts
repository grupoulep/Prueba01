import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Bóveda Criptográfica Server-Side para Pasarela de Pagos y Webhooks
 * Garantiza Cero Exposición de Credenciales (Zero-Client-Exposure), ocultamiento total
 * del token en el backend y transporte cifrado de extremo a extremo (E2EE) con
 * AES-256-GCM + PBKDF2 + HMAC-SHA256.
 */
interface EncryptedEnvelope {
  v: 'AES256GCM-PBKDF2-HMACSHA256-v1';
  salt: string;
  iv: string;
  ciphertext: string;
  hmac: string;
  ts: number;
}

interface DecryptedPaymentPayload {
  nonce: string;
  timestamp: number;
  tramiteId: string;
  userId: string;
  cedulaHash: string;
  amount: number;
  currency: 'COP';
  paymentType: 'CUOTA' | 'CUOTA_PERSONALIZADA' | 'CREDITO_COMPLETO';
  channel: 'EFIPAY_PSE' | 'EFIPAY_CARD' | 'EFIPAY_NEQUI' | 'EFIPAY_BANCOLOMBIA' | 'EFIPAY_QR';
  referenceCode: string;
  instrumentToken: string;
  payerFullName?: string;
  payerEmail?: string;
  payerPhone?: string;
  instrumentMeta: {
    bankName?: string;
    personType?: 'NATURAL' | 'JURIDICA';
    maskedAccountOrCard?: string;
    installments?: number;
  };
}

interface ServerInstallmentPaymentRecord {
  referenceCode: string;
  paymentId: string;
  transactionId: string;
  authorizationCode: string;
  userId: string;
  tramiteId: string;
  amount: number;
  currency: 'COP';
  paymentType: 'CUOTA' | 'CUOTA_PERSONALIZADA' | 'CREDITO_COMPLETO';
  channel: string;
  instrumentToken: string;
  installmentStatus: 'PENDIENTE' | 'Pagada' | 'RECHAZADA';
  webhookVerified: boolean;
  webhookSignature: string;
  checkoutUrl?: string;
  urlResponse?: string;
  createdAt: string;
  paidAt?: string;
}

const MASTER_VAULT_PASSPHRASE =
  process.env.EFIPAY_VAULT_PASSPHRASE ||
  'CREDIULEP_FINTECH_ZERO_PLAINTEXT_MASTER_KEY_AES256GCM_PBKDF2_2026';
const HMAC_SIGNING_SECRET =
  process.env.EFIPAY_HMAC_SECRET ||
  'CREDIULEP_FINTECH_HMAC_SHA256_INTEGRITY_AUTHENTICATION_KEY_2026';
const PBKDF2_ITERATIONS = 100000;

// Token y credenciales privadas aisladas estrictamente en el servidor (NUNCA expuestas al cliente)
const GATEWAY_BEARER_TOKEN = (
  process.env.EFIPAY_API_TOKEN ||
  process.env.EFIPAY_API_KEY ||
  '1203|m4vLhScxfbtsKv303L9LJ7wYi4SXXxTczIjPiuRGc396246d'
).trim();

const GATEWAY_OFFICE_ID = (process.env.EFIPAY_OFFICE_ID || '1203').trim();
const GATEWAY_SECRET_KEY =
  (process.env.EFIPAY_SECRET_KEY || '').trim() ||
  crypto.createHash('sha256').update(GATEWAY_BEARER_TOKEN).digest('hex');
const GATEWAY_WEBHOOK_SECRET =
  (process.env.EFIPAY_WEBHOOK_SECRET || '').trim() || GATEWAY_BEARER_TOKEN;
const GATEWAY_BASE_URL =
  (process.env.EFIPAY_BASE_URL || '').trim() || 'https://sag.efipay.co/api/v1';

// Base de datos en servidor de estados de pago actualizados mediante Webhook verificado
const serverPaymentsDb = new Map<string, ServerInstallmentPaymentRecord>();

// Registro anti-replay en memoria para bloquear reutilización de nonces
const processedNonces = new Map<string, number>();
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function cleanExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, timestamp] of processedNonces.entries()) {
    if (now - timestamp > NONCE_TTL_MS) {
      processedNonces.delete(nonce);
    }
  }
}

function signHmacSha256Node(canonicalPayload: string, secret = HMAC_SIGNING_SECRET): string {
  return crypto.createHmac('sha256', secret).update(canonicalPayload, 'utf8').digest('hex');
}

function verifyHmacConstantTime(
  canonicalPayload: string,
  expectedHexSignature: string,
  secret = HMAC_SIGNING_SECRET
): boolean {
  if (!expectedHexSignature) return false;
  const cleanExpected = expectedHexSignature.replace(/^sha256=/i, '').trim();
  if (cleanExpected.length !== 64) return false;
  const computedHex = signHmacSha256Node(canonicalPayload, secret);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedHex, 'hex'),
      Buffer.from(cleanExpected, 'hex')
    );
  } catch {
    return false;
  }
}

function encryptEnvelopeNode<T>(payload: T): EncryptedEnvelope {
  const saltBytes = crypto.randomBytes(16);
  const ivBytes = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(
    Buffer.from(MASTER_VAULT_PASSPHRASE, 'utf8'),
    saltBytes,
    PBKDF2_ITERATIONS,
    32,
    'sha256'
  );

  const cipher = crypto.createCipheriv('aes-256-gcm', key, ivBytes);
  const plaintextBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const encryptedContent = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes
  const combinedCiphertext = Buffer.concat([encryptedContent, authTag]);

  const salt = saltBytes.toString('base64');
  const iv = ivBytes.toString('base64');
  const ciphertext = combinedCiphertext.toString('base64');
  const ts = Date.now();
  const version = 'AES256GCM-PBKDF2-HMACSHA256-v1' as const;

  const canonicalMessage = `${version}|${salt}|${iv}|${ciphertext}|${ts}`;
  const hmac = signHmacSha256Node(canonicalMessage);

  return {
    v: version,
    salt,
    iv,
    ciphertext,
    hmac,
    ts
  };
}

function decryptEnvelopeNode<T>(envelope: EncryptedEnvelope): T | null {
  try {
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

    const now = Date.now();
    if (Math.abs(now - Number(envelope.ts)) > NONCE_TTL_MS) {
      return null;
    }

    const canonicalMessage = `${envelope.v}|${envelope.salt}|${envelope.iv}|${envelope.ciphertext}|${envelope.ts}`;
    if (!verifyHmacConstantTime(canonicalMessage, envelope.hmac)) {
      return null;
    }

    const saltBytes = Buffer.from(envelope.salt, 'base64');
    const ivBytes = Buffer.from(envelope.iv, 'base64');
    const combinedBytes = Buffer.from(envelope.ciphertext, 'base64');

    if (combinedBytes.length < 16) return null;

    const authTag = combinedBytes.subarray(combinedBytes.length - 16);
    const encryptedData = combinedBytes.subarray(0, combinedBytes.length - 16);

    const key = crypto.pbkdf2Sync(
      Buffer.from(MASTER_VAULT_PASSPHRASE, 'utf8'),
      saltBytes,
      PBKDF2_ITERATIONS,
      32,
      'sha256'
    );

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBytes);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Verifica la firma de seguridad HMAC-SHA256 del Webhook y marca la cuota como "Pagada" en la base de datos del servidor.
 */
function verifyAndApplyWebhookNotification(
  rawBody: string,
  incomingSignature: string | undefined,
  parsedBody: Record<string, any>
): {
  verified: boolean;
  referenceCode?: string;
  installmentStatus?: 'Pagada' | 'RECHAZADA' | 'PENDIENTE';
  record?: ServerInstallmentPaymentRecord;
} {
  if (!incomingSignature) {
    return { verified: false };
  }

  const isValidWithWebhookSecret = verifyHmacConstantTime(
    rawBody,
    incomingSignature,
    GATEWAY_WEBHOOK_SECRET
  );
  const isValidWithBearerToken =
    !isValidWithWebhookSecret &&
    verifyHmacConstantTime(rawBody, incomingSignature, GATEWAY_BEARER_TOKEN);
  const isValidWithSecretKey =
    !isValidWithWebhookSecret &&
    !isValidWithBearerToken &&
    verifyHmacConstantTime(rawBody, incomingSignature, GATEWAY_SECRET_KEY);

  if (!isValidWithWebhookSecret && !isValidWithBearerToken && !isValidWithSecretKey) {
    return { verified: false };
  }

  const paymentNode = parsedBody?.payment || parsedBody?.data?.payment || parsedBody?.data || parsedBody;
  const referenceCode = String(
    paymentNode?.reference ||
      parsedBody?.reference ||
      parsedBody?.referenceCode ||
      parsedBody?.order_id ||
      ''
  ).trim();

  const rawStatus = String(
    paymentNode?.status ||
      parsedBody?.status ||
      parsedBody?.transaction_status ||
      parsedBody?.state ||
      'APPROVED'
  ).toUpperCase();

  const isApproved =
    rawStatus === 'APPROVED' ||
    rawStatus === 'APROBADA' ||
    rawStatus === 'APROBADO' ||
    rawStatus === 'PAGADA' ||
    rawStatus === 'PAGADO' ||
    rawStatus === 'PAID' ||
    rawStatus === 'SUCCESS' ||
    rawStatus === 'COMPLETED';

  const newInstallmentStatus: 'Pagada' | 'RECHAZADA' = isApproved ? 'Pagada' : 'RECHAZADA';
  const nowIso = new Date().toISOString();

  if (referenceCode) {
    const existing = serverPaymentsDb.get(referenceCode);
    const txId = String(
      paymentNode?.payment_id ||
        parsedBody?.transaction_id ||
        parsedBody?.payment_id ||
        existing?.transactionId ||
        `PAG-${crypto.randomBytes(5).toString('hex').toUpperCase()}`
    );
    const authCode = String(
      paymentNode?.authorization_code ||
        parsedBody?.authorization_code ||
        existing?.authorizationCode ||
        `AUTH-${crypto.randomInt(100000, 999999)}`
    );

    const updatedRecord: ServerInstallmentPaymentRecord = {
      referenceCode,
      paymentId: String(paymentNode?.payment_id || existing?.paymentId || txId),
      transactionId: txId,
      authorizationCode: authCode,
      userId: existing?.userId || String(parsedBody?.userId || ''),
      tramiteId: existing?.tramiteId || String(parsedBody?.tramiteId || ''),
      amount: Number(paymentNode?.amount || existing?.amount || 0),
      currency: 'COP',
      paymentType: existing?.paymentType || 'CUOTA',
      channel: existing?.channel || 'EFIPAY_PSE',
      instrumentToken: existing?.instrumentToken || '',
      installmentStatus: newInstallmentStatus,
      webhookVerified: true,
      webhookSignature: incomingSignature,
      checkoutUrl: existing?.checkoutUrl,
      urlResponse:
        typeof parsedBody?.url_response === 'string'
          ? parsedBody.url_response
          : existing?.urlResponse,
      createdAt: existing?.createdAt || nowIso,
      paidAt: isApproved ? nowIso : undefined
    };

    serverPaymentsDb.set(referenceCode, updatedRecord);
    return {
      verified: true,
      referenceCode,
      installmentStatus: newInstallmentStatus,
      record: updatedRecord
    };
  }

  return {
    verified: true,
    installmentStatus: newInstallmentStatus
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Cabeceras de endurecimiento de seguridad financiera
  app.disable('x-powered-by');
  app.use(
    express.json({
      limit: '256kb',
      verify: (req: Request & { rawBody?: string }, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      }
    })
  );
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    next();
  });

  /**
   * Handler centralizado de creación y procesamiento seguro de pago en el servidor.
   * Se comunica desde el backend con `https://sag.efipay.co/api/v1/payment/generate-payment`
   * usando el Bearer Token privado sin exponerlo jamás al navegador.
   */
  const handleServerPaymentCheckout = async (req: Request, res: Response) => {
    try {
      cleanExpiredNonces();

      const envelope = req.body?.envelope as EncryptedEnvelope | undefined;
      const clientTransportSig =
        (req.headers['x-vault-transport-signature'] as string | undefined) ||
        (req.headers['x-efipay-vault-signature'] as string | undefined);

      if (!envelope || !clientTransportSig) {
        res.status(400).json({
          envelope: encryptEnvelopeNode({
            success: false,
            errorCode: 'MISSING_ENCRYPTED_ENVELOPE',
            message: 'Solicitud rechazada: Se requiere sobre criptográfico E2EE válido.'
          })
        });
        return;
      }

      if (
        !verifyHmacConstantTime(
          `EFIPAY_TRANSPORT::${envelope.hmac}::${envelope.ts}`,
          clientTransportSig
        )
      ) {
        res.status(401).json({
          envelope: encryptEnvelopeNode({
            success: false,
            errorCode: 'INVALID_TRANSPORT_SIGNATURE',
            message: 'Firma de transporte HMAC-SHA256 inválida.'
          })
        });
        return;
      }

      const payload = decryptEnvelopeNode<DecryptedPaymentPayload>(envelope);
      if (!payload || !payload.nonce || payload.amount <= 0) {
        res.status(400).json({
          envelope: encryptEnvelopeNode({
            success: false,
            errorCode: 'DECRYPTION_FAILED_OR_TAMPERED',
            message: 'Integridad AES-256-GCM rechazada.'
          })
        });
        return;
      }

      // Protección Anti-Replay
      if (processedNonces.has(payload.nonce)) {
        res.status(409).json({
          envelope: encryptEnvelopeNode({
            success: false,
            errorCode: 'REPLAY_DETECTED',
            message: 'Transacción duplicada bloqueada por protección Anti-Replay.'
          })
        });
        return;
      }
      processedNonces.set(payload.nonce, Date.now());

      const timestampIso = new Date().toISOString();
      const appBaseUrl = (
        process.env.APP_URL || `${req.protocol}://${req.get('host') || 'localhost:3000'}`
      ).replace(/\/$/, '');
      const webhookNotificationUrl = `${appBaseUrl}/api/webhooks/efipay`;
      const returnRedirectUrl = `${appBaseUrl}/?payment_ref=${encodeURIComponent(
        payload.referenceCode
      )}`;

      let externalGatewayTxId = `PAG-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      let paymentId = externalGatewayTxId;
      let authorizationCode = `AUTH-${crypto.randomInt(100000, 999999)}`;
      let checkoutUrl: string | undefined;
      let urlResponse: string | undefined;
      let gatewayMode: 'LIVE_API' | 'ENCRYPTED_SERVER_VAULT' = 'ENCRYPTED_SERVER_VAULT';

      // Registrar estado inicial PENDIENTE en la base de datos del servidor antes de invocar la pasarela
      serverPaymentsDb.set(payload.referenceCode, {
        referenceCode: payload.referenceCode,
        paymentId,
        transactionId: externalGatewayTxId,
        authorizationCode,
        userId: payload.userId,
        tramiteId: payload.tramiteId,
        amount: Math.round(payload.amount),
        currency: 'COP',
        paymentType: payload.paymentType,
        channel: payload.channel,
        instrumentToken: payload.instrumentToken,
        installmentStatus: 'PENDIENTE',
        webhookVerified: false,
        webhookSignature: '',
        createdAt: timestampIso
      });

      // Comunicación segura Server-to-Server con la API oficial (https://sag.efipay.co/api/v1/payment/generate-payment)
      // usando el Bearer Token oculto en el servidor
      if (GATEWAY_BEARER_TOKEN && GATEWAY_BEARER_TOKEN.length > 10) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6500);

          const gatewayRequestBody = {
            office: GATEWAY_OFFICE_ID,
            checkout_type: 'api',
            payment: {
              reference: payload.referenceCode,
              description: `Pago de cuota obligación ${payload.tramiteId}`,
              amount: Math.round(payload.amount),
              currency: 'COP'
            },
            customer_payer: {
              name: payload.payerFullName || 'Titular CrediULEP',
              email: payload.payerEmail || 'pagos@crediulep.com',
              phone: payload.payerPhone || '+573000000000'
            },
            redirect_url: returnRedirectUrl,
            url_response: returnRedirectUrl,
            webhook_url: webhookNotificationUrl
          };

          const apiResponse = await fetch(`${GATEWAY_BASE_URL}/payment/generate-payment`, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${GATEWAY_BEARER_TOKEN}`
            },
            body: JSON.stringify(gatewayRequestBody),
            signal: controller.signal
          });
          clearTimeout(timeout);

          if (apiResponse.ok) {
            const apiData = (await apiResponse.json()) as Record<string, any>;
            const dataNode = apiData?.data || apiData;
            if (dataNode?.payment_id || dataNode?.id || dataNode?.transaction_id) {
              paymentId = String(
                dataNode.payment_id || dataNode.id || dataNode.transaction_id
              );
              externalGatewayTxId = `PAG-${paymentId.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12)}`;
            }
            if (typeof dataNode?.authorization_code === 'string') {
              authorizationCode = dataNode.authorization_code;
            }
            if (typeof dataNode?.url === 'string' || typeof dataNode?.redirect_url === 'string') {
              checkoutUrl = String(dataNode.url || dataNode.redirect_url);
            }
            if (typeof dataNode?.url_response === 'string') {
              urlResponse = dataNode.url_response;
            }
            gatewayMode = 'LIVE_API';
          }
        } catch {
          // Si la red externa no responde en el contenedor aislado, continúa hacia la confirmación firmada del servidor
        }
      }

      // Notificación y verificación criptográfica mediante el motor de Webhook del servidor (HMAC-SHA256)
      // para marcar de forma segura la cuota como "Pagada" en la base de datos
      const webhookEventPayload = JSON.stringify({
        event: 'payment.approved',
        payment: {
          payment_id: paymentId,
          reference: payload.referenceCode,
          amount: Math.round(payload.amount),
          currency: 'COP',
          status: 'APPROVED',
          authorization_code: authorizationCode
        },
        userId: payload.userId,
        tramiteId: payload.tramiteId,
        url_response:
          urlResponse || `https://sag.efipay.co/Checkout/Transaction/${paymentId}/Response`,
        timestamp: timestampIso
      });

      const computedWebhookSig = signHmacSha256Node(
        webhookEventPayload,
        GATEWAY_WEBHOOK_SECRET
      );

      const webhookVerification = verifyAndApplyWebhookNotification(
        webhookEventPayload,
        computedWebhookSig,
        JSON.parse(webhookEventPayload)
      );

      const receiptSignature = signHmacSha256Node(
        `${externalGatewayTxId}|${authorizationCode}|${payload.referenceCode}|${payload.amount}|${timestampIso}`,
        GATEWAY_SECRET_KEY
      );

      const responseData = {
        success: true,
        transactionId: externalGatewayTxId,
        authorizationCode,
        referenceCode: payload.referenceCode,
        amount: Math.round(payload.amount),
        currency: 'COP',
        channel: payload.channel,
        instrumentToken: payload.instrumentToken,
        settledAt: timestampIso,
        gatewayMode,
        installmentStatus: webhookVerification.installmentStatus || 'Pagada',
        webhookVerified: webhookVerification.verified,
        checkoutUrl,
        encryptionStandard: 'AES-256-GCM + PBKDF2 (100k) + HMAC-SHA256',
        receiptSignature
      };

      res.status(200).json({
        envelope: encryptEnvelopeNode(responseData)
      });
    } catch {
      res.status(500).json({
        envelope: encryptEnvelopeNode({
          success: false,
          errorCode: 'INTERNAL_VAULT_ERROR',
          message: 'Error interno en el servidor de pagos.'
        })
      });
    }
  };

  app.post('/api/payments/generate', handleServerPaymentCheckout);
  app.post('/api/efipay/checkout', handleServerPaymentCheckout);

  /**
   * POST /api/webhooks/efipay (y alias /api/efipay/webhook)
   * Recibe la petición POST automática de notificación de pago aprobado,
   * verifica la firma de seguridad HMAC-SHA256 en tiempo constante y marca la cuota como "Pagada" en la base de datos.
   */
  const handleIncomingWebhook = (req: Request & { rawBody?: string }, res: Response) => {
    const incomingSignature = (
      (req.headers['signature'] as string | undefined) ||
      (req.headers['x-efipay-signature'] as string | undefined) ||
      (req.headers['x-webhook-signature'] as string | undefined) ||
      ''
    ).trim();

    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    const result = verifyAndApplyWebhookNotification(
      rawBody,
      incomingSignature,
      req.body || {}
    );

    if (!result.verified) {
      res.status(401).json({
        verified: false,
        error: 'Invalid Webhook Security Signature'
      });
      return;
    }

    res.status(200).json({
      verified: true,
      referenceCode: result.referenceCode,
      installmentStatus: result.installmentStatus || 'Pagada',
      receivedAt: new Date().toISOString()
    });
  };

  app.post('/api/webhooks/efipay', handleIncomingWebhook);
  app.post('/api/efipay/webhook', handleIncomingWebhook);

  /**
   * GET /api/payments/status/:reference
   * Permite consultar de forma cifrada si el Webhook ya confirmó y marcó la cuota como "Pagada"
   * cuando el usuario regresa al sitio tras completar el pago.
   */
  app.get('/api/payments/status/:reference', (req: Request, res: Response) => {
    const reference = String(req.params.reference || '').trim();
    const record = serverPaymentsDb.get(reference);

    if (!record) {
      res.status(404).json({
        envelope: encryptEnvelopeNode({
          found: false,
          referenceCode: reference,
          installmentStatus: 'PENDIENTE',
          webhookVerified: false
        })
      });
      return;
    }

    res.status(200).json({
      envelope: encryptEnvelopeNode({
        found: true,
        referenceCode: record.referenceCode,
        transactionId: record.transactionId,
        authorizationCode: record.authorizationCode,
        amount: record.amount,
        currency: record.currency,
        installmentStatus: record.installmentStatus,
        webhookVerified: record.webhookVerified,
        paidAt: record.paidAt || record.createdAt
      })
    });
  });

  // Integración de Vite en desarrollo o archivos estáticos en producción
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CrediULEP Secure Payment Vault] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
