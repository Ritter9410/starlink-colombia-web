const { createHash, randomBytes } = require('node:crypto');

const CATALOG = Object.freeze({
  'standard-v4': { name: 'Starlink Standard v4', price: 1599000, stock: 1 },
  'mini-x': { name: 'Starlink Mini X', price: 459900, stock: 99 },
  'standard-wall': { name: 'Soporte de pared para Standard v4', price: null, stock: 99 },
  'standard-pipe': { name: 'Adaptador de tubo para Standard v4', price: null, stock: 99 },
  'mini-wall': { name: 'Soporte de pared para Mini', price: null, stock: 99 },
  'mini-travel': { name: 'Kit de viaje Mini', price: null, stock: 99 },
  'power-bank': { name: 'Power Bank Imenso IMS-618S de 60.000 mAh y 100W de potencia', price: 299900, stock: 99 },
  'apowking-r100': { name: 'Generador Solar Apowking de 200 W de Pico, 100 W de Potencia', price: 565518, stock: 99 },
  'ecoflow-river-2-max': { name: 'Estación de energía portátil EcoFlow RIVER 2 Max 500 W', price: 1500000, stock: 99 },
  'mini-fixed-mount': { name: 'Soporte de montaje fijo Starlink Mini con brazo largo ajustable para canal de acero, adaptador para pared y techo', price: 150000, stock: 99 },
  ventosa: { name: 'Soporte ventosa para Starlink Mini', price: 120000, stock: 99 },
  'ethernet-adapter': { name: 'Starlink Ethernet Satelital Red Adapter', price: 115000, stock: 99 },
  'mini-usbc-dc-cable': { name: 'Cable de Poder USB-C a DC 5.5 mm para Starlink Mini 5 m Gris VTA', price: 88900, stock: 99 },
  'vantisan-car-charger': { name: 'Vantisan Cargador Coche Cable 12-48v Para Starlink Mini 5mts', price: 46400, stock: 99 },
});

function getSiteUrl() {
  const configured = process.env.SITE_URL;
  if (!configured) throw new Error('Configura SITE_URL en las variables de entorno de Vercel.');

  const url = new URL(configured);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && isLocal)) {
    throw new Error('SITE_URL debe usar HTTPS.');
  }
  return url.origin;
}

module.exports = function createBoldCheckout(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const identityKey = process.env.BOLD_IDENTITY_KEY;
  const secretKey = process.env.BOLD_SECRET_KEY;
  if (!identityKey || !secretKey) {
    return res.status(503).json({ error: 'La pasarela todavía no está configurada en Vercel.' });
  }

  try {
    const receivedItems = req.body?.items;
    if (!Array.isArray(receivedItems) || receivedItems.length === 0 || receivedItems.length > 20) {
      return res.status(400).json({ error: 'El carrito no tiene productos válidos.' });
    }

    const quantities = new Map();
    for (const item of receivedItems) {
      if (typeof item?.id !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
        return res.status(400).json({ error: 'Hay cantidades inválidas en el carrito.' });
      }
      quantities.set(item.id, (quantities.get(item.id) || 0) + item.quantity);
    }

    const items = [];
    let amount = 0;
    for (const [id, quantity] of quantities) {
      if (!Object.prototype.hasOwnProperty.call(CATALOG, id)) {
        return res.status(400).json({ error: 'El carrito contiene un producto desconocido.' });
      }
      const product = CATALOG[id];
      if (product.price === null) return res.status(400).json({ error: `${product.name} todavía no tiene un precio publicado.` });
      if (quantity > product.stock) return res.status(400).json({ error: `${product.name} no tiene unidades suficientes disponibles.` });
      amount += product.price * quantity;
      items.push({ name: product.name, quantity });
    }

    if (!Number.isSafeInteger(amount) || amount < 1000) {
      return res.status(400).json({ error: 'El total debe ser de al menos $1.000 COP para pagar con Bold.' });
    }

    const orderId = `SC-${Date.now().toString(36).toUpperCase()}-${randomBytes(8).toString('hex').toUpperCase()}`;
    const currency = 'COP';
    const integritySignature = createHash('sha256')
      .update(`${orderId}${amount}${currency}${secretKey}`, 'utf8')
      .digest('hex');
    const description = `Carrito Starlink: ${items.map(item => `${item.name} x${item.quantity}`).join(', ')}`.slice(0, 100);
    const siteUrl = getSiteUrl();

    return res.status(200).json({
      orderId,
      amount,
      checkout: {
        orderId,
        amount: String(amount),
        currency,
        apiKey: identityKey,
        integritySignature,
        description,
        renderMode: 'embedded',
        redirectionUrl: new URL('/?pago=resultado', siteUrl).toString(),
        originUrl: new URL('/?pago=cancelado', siteUrl).toString(),
      },
    });
  } catch (error) {
    const status = error.message?.includes('SITE_URL') || error.message?.includes('HTTPS') ? 503 : 500;
    return res.status(status).json({ error: status === 503 ? error.message : 'No pudimos preparar el pago. Inténtalo nuevamente.' });
  }
};
