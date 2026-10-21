# Starlink Colombia — sitio web

El sitio se publica en Vercel. La página es estática y adaptable a móviles; las funciones de `api/` preparan el checkout de Bold y consultan el estado de una transacción. Conserva `fondo-galaxia.jpg`, `fondo-barra-satelites.jpeg` y `divipola.js` junto a `index.html`: las dos imágenes son los fondos y el archivo JavaScript contiene la lista territorial del DANE que alimenta el selector de departamento y municipio.

## Antes de publicarlo

1. En el panel de Vercel, abre **Settings → Environment Variables** y define `BOLD_IDENTITY_KEY`, `BOLD_SECRET_KEY` y `SITE_URL` (`https://` seguido del dominio publicado). Usa llaves de prueba en Preview y las llaves activas del comercio en Production. La llave secreta se usa únicamente en las funciones de servidor y no debe ponerse en `index.html`.
2. Publica o vuelve a desplegar el sitio después de agregar las variables. La función de Vercel verifica los identificadores, cantidades y precios del catálogo en el servidor, genera la firma de Bold y ofrece el checkout integrado. Al regresar, la página consulta a Bold y solo marca el pago como aprobado cuando coinciden la referencia y el total.
3. Prueba primero una compra desde una URL HTTPS de Preview usando las llaves de prueba de Bold. Luego revisa en el panel de Bold que la transacción y su referencia aparezcan correctamente antes de habilitar llaves activas.
4. En el `<script>` al final de `index.html`, conserva `WHATSAPP_NUMBER` con el número de la tienda y el código de país, solo dígitos. El cliente podrá usar WhatsApp para coordinar la entrega después de confirmar el pago.
5. Actualiza los textos de atención, aviso legal y datos de contacto según tu negocio.

El checkout no permite pagar artículos que todavía tengan `price: null`; esos productos se cotizan por WhatsApp. Mantén los precios del catálogo en `index.html` y en `api/create-bold-checkout.js sincronizados: el segundo es la referencia que define el valor real cobrado. El catálogo actual incluye Mini X por `$459.900 COP`, Standard v4 por `$1.599.000 COP` (una unidad), batería por `$299.900 COP`, soporte fijo por `$150.000 COP`, ventosa por `$120.000 COP` y adaptador Ethernet por `$115.000 COP`. Confirma inventario, precios y condiciones de entrega antes de publicar. La tienda es independiente de Starlink; el equipo y el plan de servicio son conceptos separados. La cobertura debe confirmarse para la ubicación de cada cliente.

La respuesta de Bold se verifica al volver al sitio, pero la tienda todavía no tiene una base de datos para guardar pedidos en el servidor. Las ventas también quedan disponibles en el panel de Bold; para automatizar seguimiento, despacho o conciliación aunque el comprador no regrese al sitio, conecta un webhook firmado de Bold a un almacenamiento persistente.
