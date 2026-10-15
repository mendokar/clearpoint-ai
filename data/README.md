# Datos de Colchones Contoso (`data/`)

Datos **iniciales** de la tienda: semilla del catálogo, política de envíos y pedidos de demostración. Alimentan
Firestore vía `scripts/seed.ts` y el repositorio en memoria del asistente (`REPOSITORY_BACKEND=memory`, tests).

> **`catalog.json` es solo la semilla inicial.** En producción la fuente de verdad del catálogo es la colección
> `products` de Firestore, que se gestiona desde el panel `/admin/productos`. La web solo usa este JSON en
> desarrollo **sin credenciales** de Firebase; con credenciales nunca vuelve a él (ni con cero productos, ni si un
> producto no existe, ni si Firestore falla). Editar este fichero no cambia la tienda desplegada salvo que se vuelva
> a ejecutar el seed, que **sobrescribe** los productos con el mismo slug.

| Fichero | Contenido | Quién lo consume |
|---|---|---|
| `catalog.json` | Semilla: los 2 colchones con opciones y todas sus variantes | `scripts/seed.ts` → `products/{slug}`; `agent/` (`REPOSITORY_BACKEND=memory` y tests); `web/` solo en desarrollo sin credenciales y en tests |
| `shipping_policy.md` | Política de envíos, devoluciones, cambios y garantía (markdown) | `scripts/seed.ts` → `content/shipping_policy.body_md`; `agent/` (memoria y tests); `web/` puede renderizarla en `/envios-y-devoluciones` |
| `demo_orders.json` | 4 pedidos de 2 usuarios demo | `scripts/seed.ts` → `orders/{id}`; tests de aislamiento de `agent/` |

## `catalog.json`

```json
{ "products": [ Product, Product ] }
```

Cada `Product` es exactamente el documento de `products/{slug}`:

| Campo | Tipo | Notas |
|---|---|---|
| `slug` | string | ID del documento. `colchon-cafetal`, `colchon-caribe`. Formato `^[a-z0-9]+(-[a-z0-9]+)*$` (el agente lo valida). |
| `name` | string | "Colchón Cafetal", "Colchón Caribe" |
| `shortDescription` | string | Una línea para tarjetas |
| `description` | string | Texto de la ficha |
| `images` | string[] | Rutas públicas del front (`/images/<slug>-1.jpg`…); las imágenes las aporta `web/` |
| `options` | `{name, values[]}[]` | `Medida`, `Núcleo` (`Brisa`, `Ceiba+`), `Funda` (`Algodón Tolima`, `Térmica Páramo`) |
| `optionDetails` | objeto | Ficha técnica de cada núcleo (altura, kg por persona, capas, zonas, garantía) y descripción de cada funda |
| `variants` | `Variant[]` | Una por combinación Medida × Núcleo × Funda (20 por producto) |
| `priceFrom` | number | Precio mínimo de las variantes (349 y 449) |
| `currency` | string | `EUR` |
| `features` | string[] | Puntos clave |
| `active` | boolean | Solo los activos se listan |

`Variant`: `{ "sku": "CAF-150190-BRI-ALG", "options": {"Medida": "150×190", "Núcleo": "Brisa", "Funda": "Algodón Tolima"}, "price": 499, "currency": "EUR", "inStock": true }`

- SKU = `<CAF|CAR>-<medida (090190, 135190, … o MEDIDA)>-<BRI|CEI>-<ALG|TER>`.
- Precios en euros (enteros, IVA incluido). Precio = base de la medida + suplemento de Ceiba+ (110–210 €)
  + suplemento de Térmica Páramo (40–80 €). "A medida" es la medida más cara y tarda unos 30 días.
- Hay 2 variantes con `inStock: false` para probar el caso sin stock.

`optionDetails` y `priceFrom` amplían el esquema de la sección 5 de `ARQUITECTURA.md` (que solo prevé
`options` y `variants`); son útiles para el configurador y para que el asistente explique los núcleos.

## `shipping_policy.md`

Markdown sin HTML. El seed debe crear `content/shipping_policy` así:

```json
{ "title": "Envíos y devoluciones", "body_md": "<contenido del fichero>", "updatedAt": "<timestamp>" }
```

Resumen: pago → "preparación en curso"; península 24–72 h laborables y gratis; Baleares 5–7 días (45 €);
Canarias, Ceuta y Melilla 5–7 días (89 €); a medida unos 30 días; email con seguimiento al enviarse;
30 días desde la entrega para devolver; recogida a cargo de Contoso solo con embalaje original; cambio de
medida 18 € en la península; reembolso tras revisión; a medida sin devolución; contacto hola@contoso.example.

## `demo_orders.json`

```json
{ "_comment": "...", "orders": [ Order, ... ] }
```

Cada `Order` sigue el esquema de `orders/{stripeSessionId}` de la arquitectura, más el campo `id`, que es el
ID del documento (el seed lo usa como ID y **no** debe guardarlo como campo):

| `orderNumber` | Usuario | `status` | Notas |
|---|---|---|---|
| `CP-000101` | `DEMO_UID_1` | `delivered` | SEUR con seguimiento, historial completo |
| `CP-000118` | `DEMO_UID_1` | `shipped` | SEUR, `trackingNumber` y `estimatedDelivery` |
| `CP-000123` | `DEMO_UID_1` | `paid` | Sin transportista todavía |
| `CP-000120` | `DEMO_UID_2` | `preparing` | Colchón a medida con envío a Baleares (45 €) |

- `DEMO_UID_1` y `DEMO_UID_2` son **placeholders**: el seed crea los usuarios demo en Firebase Auth y
  sustituye estos valores por sus uid reales. `email` usa `demo1@contoso.example` / `demo2@contoso.example`.
- Fechas en ISO 8601 UTC (`createdAt`, `updatedAt`, `statusHistory[].at`; `estimatedDelivery` es fecha). El
  seed debería convertirlas a `Timestamp` de Firestore; el agente acepta ambos formatos.
- `stripePaymentIntentId` es ficticio (`pi_test_demo_…`). Los `sku` y `unitPrice` coinciden con `catalog.json`.

## Cómo modificar

- **Catálogo**: en producción, desde el panel `/admin/productos`. Para cambiar la semilla, edita `catalog.json` manteniendo el esquema (cada variante con las tres opciones y un SKU
  único; `priceFrom` igual al mínimo de `variants[].price`). Vuelve a ejecutar el seed para Firestore.
  En el agente, el repositorio en memoria lo lee al arrancar; Firestore se lee en cada consulta.
- **Política**: edita `shipping_policy.md` (markdown sencillo, sin HTML) y vuelve a ejecutar el seed. El
  asistente responde solo con lo que diga este texto.
- **Pedidos demo**: añade pedidos con `orderNumber` `CP-` + 6 dígitos únicos y un placeholder de uid
  conocido por el seed. Ojo: los tests de `agent/tests` comprueban los pedidos actuales (3 de
  `DEMO_UID_1`, 1 de `DEMO_UID_2`); si cambias estos datos, ejecuta `pytest` y ajusta los tests.
- Tras cualquier cambio: `cd agent && .venv/bin/python -m pytest`.
