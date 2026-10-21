module.exports = async function paymentStatus(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const identityKey = process.env.BOLD_IDENTITY_KEY;
  const orderId = typeof req.query?.orderId === 'string' ? req.query.orderId : '';
  if (!identityKey) return res.status(503).json({ error: 'La consulta de pagos todavía no está configurada en Vercel.' });
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(orderId)) return res.status(400).json({ error: 'Referencia de pago inválida.' });

  try {
    const response = await fetch(`https://payments.api.bold.co/v2/payment-voucher/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: { Authorization: `x-api-key ${identityKey}`, Accept: 'application/json' },
      cache: 'no-store',
    });

    if (response.status === 404) {
      return res.status(200).json({ reference_id: orderId, payment_status: 'NO_TRANSACTION_FOUND', total: null });
    }
    if (!response.ok) return res.status(502).json({ error: 'Bold no pudo confirmar el estado en este momento.' });

    const transaction = await response.json();
    return res.status(200).json({
      reference_id: typeof transaction.reference_id === 'string' ? transaction.reference_id : '',
      payment_status: typeof transaction.payment_status === 'string' ? transaction.payment_status : 'UNKNOWN',
      total: Number.isFinite(Number(transaction.total)) ? Number(transaction.total) : null,
    });
  } catch (error) {
    return res.status(502).json({ error: 'No pudimos consultar a Bold. Vuelve a intentarlo en unos minutos.' });
  }
};
