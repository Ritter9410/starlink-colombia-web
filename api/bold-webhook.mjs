import { createHmac, timingSafeEqual } from 'node:crypto';
import { waitUntil } from '@vercel/functions';

const BODY_LIMIT_BYTES = 1024 * 1024;
const CLAIM_TTL_SECONDS = 60 * 60;
const SENT_TTL_SECONDS = 60 * 60 * 24 * 90;

export const config = {
  api: { bodyParser: false },
};

async function readRawBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > BODY_LIMIT_BYTES) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function validBoldSignature(rawBody, signature, secret) {
  if (typeof signature !== 'string' || !signature || !secret) return false;

  const base64Body = rawBody.toString('base64');
  const expected = createHmac('sha256', secret).update(base64Body).digest('hex');
  const receivedBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function requiredWhatsAppConfig() {
  const version = process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0';
  const config = {
    accessToken: process.env.WHATSAPP_CLOUD_API_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    recipient: String(process.env.WHATSAPP_NOTIFY_TO || '').replace(/\D/g, ''),
    templateName: process.env.WHATSAPP_TEMPLATE_NAME || 'compra_aprobada_starlink',
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'es_CO',
    graphVersion: version,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  };

  const missing = [];
  if (!config.accessToken) missing.push('WHATSAPP_CLOUD_API_TOKEN');
  if (!config.phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!/^\d{8,15}$/.test(config.recipient)) missing.push('WHATSAPP_NOTIFY_TO');
  if (!/^[a-z0-9_]{1,512}$/.test(config.templateName)) missing.push('WHATSAPP_TEMPLATE_NAME');
  if (!/^es_[A-Z]{2}$/.test(config.templateLanguage)) missing.push('WHATSAPP_TEMPLATE_LANGUAGE');
  if (!/^v\d+\.\d+$/.test(config.graphVersion)) missing.push('WHATSAPP_GRAPH_API_VERSION');
  if (!config.redisUrl) missing.push('UPSTASH_REDIS_REST_URL');
  if (!config.redisToken) missing.push('UPSTASH_REDIS_REST_TOKEN');

  return { config, missing };
}

async function redisCommand(config, command) {
  const response = await fetch(config.redisUrl.replace(/\/+$/, ''), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.redisToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(1500),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || Object.prototype.hasOwnProperty.call(result, 'error')) {
    throw new Error('No se pudo actualizar el registro de notificaciones.');
  }
  return result.result;
}

function formatAmount(amount, currency) {
  const total = Number(amount);
  if (!Number.isFinite(total) || total < 0) return 'Total no disponible';

  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: typeof currency === 'string' ? currency : 'COP',
      maximumFractionDigits: 0,
    }).format(total);
  } catch (error) {
    return `${Math.round(total).toLocaleString('es-CO')} ${currency || 'COP'}`;
  }
}

function paymentMethodLabel(value) {
  const method = String(value || '').toUpperCase();
  if (method.includes('NEQUI')) return 'Nequi';
  if (method.includes('CARD') || method.includes('BUTTON')) return 'Tarjeta / Bold';
  if (method === 'PSE') return 'PSE';
  return method ? method.replaceAll('_', ' ') : 'Bold';
}

function notificationPayload(event, config) {
  const data = event.data || {};
  const reference = data.metadata?.reference || data.payment_id || event.subject || event.id;

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: config.recipient,
    type: 'template',
    template: {
      name: config.templateName,
      language: { code: config.templateLanguage },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: formatAmount(data.amount?.total, data.amount?.currency) },
          { type: 'text', text: paymentMethodLabel(data.payment_method) },
          { type: 'text', text: String(reference).slice(0, 120) },
        ],
      }],
    },
  };
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function sendWhatsAppNotification(event, config, idempotencyKey) {
  const endpoint = `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(config.phoneNumberId)}/messages`;
  const payload = notificationPayload(event, config);
  let lastError;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        try {
          await redisCommand(config, ['SET', idempotencyKey, 'sent', 'EX', SENT_TTL_SECONDS]);
        } catch (error) {
          // Mantén el bloqueo temporal: Meta ya aceptó el mensaje y no debe enviarse dos veces.
          console.error('WhatsApp aceptó el aviso, pero no se pudo guardar la marca anti-duplicados.', { eventId: event.id });
        }
        console.info('Aviso de compra enviado por WhatsApp.', { eventId: event.id });
        return;
      }

      lastError = new Error(`WhatsApp Cloud API respondió HTTP ${response.status}.`);
      if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }

    if (attempt < 3) await wait(800 * (2 ** attempt));
  }

  // Si Meta nunca aceptó el envío, permite que una entrega posterior del mismo evento vuelva a intentarlo.
  try {
    await redisCommand(config, ['DEL', idempotencyKey]);
  } catch (error) {
    console.error('No se pudo liberar el bloqueo de notificación de WhatsApp.');
  }

  console.error('No se pudo enviar el aviso de compra por WhatsApp.', {
    eventId: event.id,
    reason: lastError?.message || 'Error desconocido.',
  });
}

export default async function boldWebhook(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const boldSecret = process.env.BOLD_WEBHOOK_SECRET || process.env.BOLD_SECRET_KEY;
  if (!boldSecret) return res.status(503).json({ error: 'Falta configurar la llave secreta del webhook de Bold.' });

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    const status = error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return res.status(status).json({ error: status === 413 ? 'Notificación demasiado grande.' : 'No se pudo leer la notificación.' });
  }

  const signature = req.headers['x-bold-signature'];
  if (!validBoldSignature(rawBody, signature, boldSecret)) {
    return res.status(401).json({ error: 'Firma de Bold no válida.' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    return res.status(400).json({ error: 'Notificación JSON no válida.' });
  }

  if (event?.type !== 'SALE_APPROVED') {
    return res.status(200).json({ received: true, ignored: true });
  }

  if (typeof event.id !== 'string' || !event.id || !event.data || typeof event.data !== 'object') {
    return res.status(400).json({ error: 'La notificación de Bold no incluye los datos requeridos.' });
  }

  const { config, missing } = requiredWhatsAppConfig();
  if (missing.length) {
    console.error('Configura las variables requeridas para avisos de compra por WhatsApp.', { missing });
    return res.status(503).json({ error: 'Falta configurar WhatsApp o el registro anti-duplicados.' });
  }

  const idempotencyKey = `starlink:purchase-alert:${event.id}`;
  try {
    const claimed = await redisCommand(config, ['SET', idempotencyKey, 'sending', 'EX', CLAIM_TTL_SECONDS, 'NX']);
    if (claimed !== 'OK') return res.status(200).json({ received: true, duplicate: true });
  } catch (error) {
    return res.status(503).json({ error: 'No se pudo preparar el aviso de compra.' });
  }

  waitUntil(sendWhatsAppNotification(event, config, idempotencyKey));
  return res.status(200).json({ received: true });
}
