# Starlink Colombia — sitio web

El sitio se publica en Vercel. La página es estática y adaptable a móviles; las funciones de `api/` preparan el checkout de Bold y consultan el estado de una transacción. Conserva `fondo-cabana-starlink.jpg` y `divipola.js` junto a `index.html`: la imagen se usa como fondo principal y el archivo JavaScript contiene la lista territorial del DANE que alimenta el selector de departamento y municipio.

## Antes de publicarlo

1. En el panel de Vercel, abre **Settings → Environment Variables** y define `BOLD_IDENTITY_KEY`, `BOLD_SECRET_KEY` y `SITE_URL` (`https://` seguido del dominio publicado). Usa llaves de prueba en Preview y las llaves activas del comercio en Production. La llave secreta se usa únicamente en las funciones de servidor y no debe ponerse en `index.html`.
2. Publica o vuelve a desplegar el sitio después de agregar las variables. La función de Vercel verifica los identificadores, cantidades y precios del catálogo en el servidor, genera la firma de Bold y ofrece el checkout integrado. Al regresar, la página consulta a Bold y solo marca el pago como aprobado cuando coinciden la referencia y el total.
3. Prueba primero una compra desde una URL HTTPS de Preview usando las llaves de prueba de Bold. Luego revisa en el panel de Bold que la transacción y su referencia aparezcan correctamente antes de habilitar llaves activas.
4. En el `<script>` al final de `index.html`, conserva `WHATSAPP_NUMBER` con el número de la tienda y el código de país, solo dígitos. El cliente podrá usar WhatsApp para coordinar la entrega después de confirmar el pago.
5. Para recibir un aviso por WhatsApp cuando Bold confirme una venta, configura las variables de entorno descritas en **Avisos de compra por WhatsApp** y registra `https://<tu-dominio>/api/bold-webhook` en Bold → Integraciones → Webhooks. El webhook verifica la firma de Bold, solo avisa por `SALE_APPROVED` y evita avisos duplicados.
6. Actualiza los textos de atención, aviso legal y datos de contacto según tu negocio.

## Avisos de compra por WhatsApp

Esta integración usa el webhook firmado de Bold y la WhatsApp Business Platform Cloud API de Meta. Antes de activar el webhook, crea una base Redis en Upstash y configura en Vercel, para Production:

- `BOLD_WEBHOOK_SECRET`: llave secreta que Bold usa para firmar estos webhooks. Para los pagos del Botón de pagos, Bold firma con la llave de esa integración. Si es la misma que ya usa el checkout, puede reutilizarse `BOLD_SECRET_KEY` y omitirse esta variable.
- `WHATSAPP_CLOUD_API_TOKEN`: token de acceso de la WhatsApp Cloud API, guardado como Secret.
- `WHATSAPP_PHONE_NUMBER_ID`: identificador del número emisor de WhatsApp Business que muestra Meta en la configuración de la API.
- `WHATSAPP_NOTIFY_TO`: tu número personal de WhatsApp para recibir los avisos, con código de país y solo dígitos (por ejemplo, `57` seguido del número colombiano).
- `WHATSAPP_TEMPLATE_NAME`: nombre de la plantilla aprobada por Meta. Si no se define, el código usa `compra_aprobada_starlink`.
- `WHATSAPP_TEMPLATE_LANGUAGE`: idioma de la plantilla. Si no se define, usa `es_CO`.
- `WHATSAPP_GRAPH_API_VERSION`: versión de Graph API habilitada en Meta, con formato `vN.N` (por ejemplo, `v23.0`). Si se omite, usa `v23.0`.
- `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`: URL REST y token secreto de la base Redis de Upstash. Se usan para que Bold no genere avisos repetidos si reintenta el mismo evento.

En WhatsApp Manager, crea y espera la aprobación de una plantilla **Utility** llamada `compra_aprobada_starlink`, en español de Colombia, con este texto en el cuerpo y tres variables en ese orden:

`✅ Compra aprobada en Starlink Colombia. Total: {{1}}. Método de pago: {{2}}. Referencia: {{3}}.`

Si usas otro nombre o idioma aprobado, configura los valores correspondientes en `WHATSAPP_TEMPLATE_NAME` y `WHATSAPP_TEMPLATE_LANGUAGE`. La cuenta de WhatsApp Business debe tener un número emisor conectado a Cloud API y permisos para enviar plantillas. No compartas el token de Meta ni la llave secreta de Bold en el chat ni en archivos del sitio.

Después de guardar las variables, vuelve a desplegar Vercel. En el panel de Bold, abre **Integraciones → Webhooks**, registra `https://<tu-dominio>/api/bold-webhook` como endpoint y habilita las llaves de integración que usan el botón de pagos y los links de Nequi. Bold indica que algunos eventos pueden demorar hasta 10 minutos. El aviso se envía únicamente cuando Bold reporta `SALE_APPROVED`; intentos rechazados o pagos pendientes no generan aviso.

El checkout no permite pagar artículos que todavía tengan `price: null`; esos productos se cotizan por WhatsApp. Mantén sincronizados los precios del catálogo en `index.html`, `api/create-bold-checkout.js` y `api/create-nequi-payment-link.js`; las funciones del servidor definen el valor real cobrado. El catálogo actual incluye Mini X por `$390.000 COP`, Standard v4 por `$1.199.000 COP` (una unidad), Power Bank Imenso por `$299.900 COP`, Power Bank Peakdo Linkpower 1 por `$450.000 COP`, generador solar Apowking por `$565.518 COP`, EcoFlow RIVER 2 Max por `$1.500.000 COP`, soporte fijo por `$150.000 COP`, kit de montaje Starlink Mini para RV por `$150.000 COP`, soporte giratorio Pivot por `$239.900 COP`, ventosa por `$120.000 COP`, adaptador Ethernet por `$115.000 COP`, Router Mini G4 por `$259.900 COP`, cable USB-C a DC para Mini por `$88.900 COP`, adaptador de pared AC/DC para Starlink Mini por `$120.000 COP`, cable de 5 metros para Starlink Estándar V4/Gen 3/Mini por `$105.000 COP`, cable de 15 metros por `$250.000 COP`, cargador vehicular Vantisan por `$46.400 COP`, cable de alimentación de batería Starlink Mini de 5 m por `$70.000 COP` y de 10 m por `$130.000 COP`, mini mochila Starlink por `$240.000 COP` y soporte magnético para Starlink Mini por `$240.000 COP`. Confirma inventario, precios y condiciones de entrega antes de publicar. La tienda es independiente de Starlink; el equipo y el plan de servicio son conceptos separados. La cobertura debe confirmarse para la ubicación de cada cliente.

Cada tarjeta de producto abre su página individual en una pestaña nueva. Standard v4 usa `/comprar/standard-v4.html`; las demás tarjetas usan `/comprar/producto.html?producto=<id>`. Las fichas muestran sus fotos, descripción, cantidad y precio. Los pagos de productos con precio publicado pasan por Bold o Nequi mediante un link de Bold; el servidor valida el precio y la cantidad máxima. Publica las fichas junto con los archivos de imagen del sitio.

La respuesta de Bold se verifica al volver al sitio, pero la tienda todavía no tiene una base de datos para guardar pedidos en el servidor. Las ventas también quedan disponibles en el panel de Bold; para automatizar seguimiento, despacho o conciliación aunque el comprador no regrese al sitio, conecta un webhook firmado de Bold a un almacenamiento persistente.
