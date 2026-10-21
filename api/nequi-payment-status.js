module.exports = async function nequiPaymentStatus(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const identityKey = process.env.BOLD_IDENTITY_KEY;
  const paymentLink = typeof req.query?.paymentLink === 'string' ? req.query.paymentLink : '';
  if (!identityKey) return res.status(503).json({ error: 'La consulta de pagos con Nequi todavía no está configurada en Vercel.' });
  if (!/^LNK_[A-Za-z0-9_-]{3,60}$/.test(paymentLink)) return res.status(400).json({ error: 'Identificador del pago inválido.' });

  try {
    const response = await fetch(`https://integrations.api.bold.co/online/link/v1/${encodeURIComponent(paymentLink)}`, {
      method: 'GET',
      headers: { Authorization: `x-api-key ${identityKey}`, Accept: 'application/json' },
      cache: 'no-store',
    });

    if (response.status === 404) {
      return res.status(200).json({ paymentLink, reference: '', status: 'NOT_FOUND', total: null, paymentMethod: '' });
    }
    if (response.status === 401 || response.status === 403) {
      return res.status(503).json({ error: 'Bold no autorizó la consulta de API Link para esta llave. Confirma con Bold que la integración esté activa.' });
    }
    if (!response.ok) return res.status(502).json({ error: 'Bold no pudo confirmar el estado del pago en este momento.' });

    const result = await response.json();
    const payment = result.payload || result;
    return res.status(200).json({
      paymentLink: typeof payment.id === 'string' ? payment.id : paymentLink,
      reference: typeof payment.reference === 'string' ? payment.reference : '',
      status: typeof payment.status === 'string' ? payment.status.toUpperCase() : 'UNKNOWN',
      total: Number.isFinite(Number(payment.total)) ? Number(payment.total) : null,
      paymentMethod: typeof payment.payment_method === 'string' ? payment.payment_method.toUpperCase() : '',
    });
  } catch (error) {
    return res.status(502).json({ error: 'No pudimos consultar a Bold. Vuelve a intentarlo en unos minutos.' });
  }
};
