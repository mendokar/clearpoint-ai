# Colchones Contoso · Presentación técnica

Ecommerce de colchones con pago de prueba, panel de administración y asistente de IA de consulta.
Prueba técnica para Desarrollador Full Stack AI Native en Clearpoint.

Este documento resume la solución tal como está construida y desplegada. El detalle está en [`ARQUITECTURA.md`](ARQUITECTURA.md) (versión 2; el plan inicial es la [versión 1](ARQUITECTURA_v1.md)), el plan de QA en [`PLAN_DE_PRUEBAS.md`](PLAN_DE_PRUEBAS.md) y la puesta en marcha en el [`README.md`](README.md).

| | |
|---|---|
| Tienda | https://clearpoint-ai.vercel.app |
| Panel de administración | https://clearpoint-ai.vercel.app/admin |
| Asistente | https://agent-305860844301.europe-southwest1.run.app |
| Pruebas automáticas | 495, todas en verde |
| Casos manuales de QA | 94 |

---

## 0. Evolución de la arquitectura

```mermaid
timeline
    title De la versión 1 a la versión 2
    15/10 · Versión 1 : Plan inicial con colchones de cuna : Asistente con LiteLLM : Email con Resend
    15/10 · Construcción : Marca Contoso y diseño cálido : Asistente con LangGraph en cascada : Login con Google y correo : Stripe y Firebase activos
    16/10 · Operación : Email por Gmail : Panel de administración : Fotos en Firebase Storage
    16/10 · Versión 2 : Tres rondas de QA corregidas : Panel solo para admin@contoso.example : 495 pruebas automáticas
```

Los cambios detallados y su motivo están en el historial de versiones de [`ARQUITECTURA.md`](ARQUITECTURA.md#0-historial-de-versiones).

---

## 1. Qué pide la prueba y cómo se resuelve

```mermaid
flowchart LR
    subgraph Requisitos
        R1["R1 · Productos configurables<br/>y carrito"]
        R2["R2 · Registro e inicio de sesión<br/>cada usuario ve solo sus pedidos"]
        R3["R3 · Pago real en modo test"]
        R4["R4 · Email real de confirmación"]
        R5["R5 · Asistente de consulta<br/>productos, envíos y pedidos"]
        R6["R6 · Móvil y escritorio<br/>desplegado y accesible desde España"]
    end
    subgraph Solución
        S1["Cafetal y Caribe<br/>medida · núcleo · funda<br/>carrito persistente"]
        S2["Firebase Auth<br/>Google o correo y contraseña<br/>reglas de Firestore"]
        S3["Stripe Checkout<br/>webhook firmado e idempotente"]
        S4["Gmail SMTP<br/>cliente y aviso a la tienda"]
        S5["FastAPI + LangGraph<br/>Anthropic con respaldo OpenAI"]
        S6["Vercel + Cloud Run Madrid<br/>diseño responsive"]
    end
    R1 --> S1
    R2 --> S2
    R3 --> S3
    R4 --> S4
    R5 --> S5
    R6 --> S6
```

Además de lo pedido: panel de administración para colchones, fotos y pedidos, con avisos por email.

---

## 2. Arquitectura general

```mermaid
flowchart LR
    U["Navegador<br/>móvil o escritorio"]

    subgraph Vercel
        W["Next.js 15<br/>tienda · panel · API"]
    end

    subgraph GCP["Google Cloud · europe-southwest1 (Madrid)"]
        A["Asistente IA<br/>FastAPI + LangGraph<br/>Cloud Run"]
        SM["Secret Manager<br/>claves de IA"]
    end

    subgraph Firebase
        AU["Authentication<br/>Google · correo"]
        FS[("Firestore<br/>Madrid")]
        ST[("Storage<br/>fotos · Madrid")]
    end

    S["Stripe<br/>modo test"]
    G["Gmail SMTP"]
    AN["Anthropic<br/>Claude Sonnet 5.5"]
    OA["OpenAI<br/>respaldo"]

    U -->|HTTPS| W
    U -->|"HTTPS + token de Firebase"| A
    U -->|"login"| AU
    U -->|"subida directa (solo admin)"| ST
    W -->|"Checkout Session"| S
    S -->|"webhook firmado"| W
    W -->|"emails"| G
    W -->|"Admin SDK · lectura y escritura"| FS
    A -->|"solo lectura"| FS
    A --> SM
    A -->|principal| AN
    A -.->|"si falla"| OA
    A -->|"verifica token"| AU
```

| Pieza | Responsabilidad | No hace |
|---|---|---|
| Next.js en Vercel | Tienda, carrito, login, pago, webhook, emails y panel | No ejecuta el asistente |
| Asistente en Cloud Run | Verifica el token y responde con herramientas de consulta | No escribe datos ni gestiona pagos |
| Firebase | Usuarios, datos y fotos | El navegador no puede escribir en Firestore |
| Stripe | Página de pago y confirmación por webhook | Las tarjetas nunca pasan por nuestros servidores |

---

## 3. Flujo de compra

```mermaid
sequenceDiagram
    autonumber
    actor C as Cliente
    participant W as Next.js
    participant S as Stripe
    participant F as Firestore
    participant G as Gmail

    C->>W: Pagar carrito (SKU y cantidad + token)
    W->>W: Verifica token y valida con Zod
    W->>F: Lee precios reales del catálogo
    W->>S: Crea Checkout Session (uid en metadata)
    S-->>C: Página de pago de Stripe
    C->>S: Paga con tarjeta de prueba
    S->>W: Webhook checkout.session.completed (firmado)
    W->>W: Verifica firma y pago completado
    W->>F: Crea el pedido en una transacción<br/>número CP-000xxx, sin duplicados
    W->>G: Email de confirmación al cliente
    W->>G: Aviso de pedido nuevo a la tienda
    S-->>C: Vuelve a /checkout/exito
    C->>W: ¿Esta sesión está pagada y es mía?
    W->>S: Consulta la sesión
    W-->>C: Confirmado
    C->>F: Lee su pedido (reglas: solo el suyo)
```

- El cliente solo envía SKU y cantidad. **El precio siempre lo calcula el servidor.**
- **El pedido solo nace del webhook firmado**, nunca de la página de éxito.
- La página de éxito pregunta a Stripe antes de confirmar. Un identificador inventado muestra "No encontramos este pago".
- Si el email falla, el pedido se guarda igual.

---

## 4. Ciclo de vida de un pedido

```mermaid
stateDiagram-v2
    [*] --> Pagado: webhook de Stripe
    Pagado --> EnPreparacion: panel
    EnPreparacion --> Enviado: panel (transportista, seguimiento, fecha)
    Enviado --> Entregado: panel
    Pagado --> Cancelado: panel
    EnPreparacion --> Cancelado: panel
    Entregado --> [*]
    Cancelado --> [*]

    EnPreparacion: En preparación
    note right of Enviado: email al cliente
    note right of Entregado: email al cliente
    note left of Cancelado: email al cliente, sin reembolso automático
```

El servidor rechaza cualquier salto no permitido. El asistente lee el estado en cada consulta, así que ve el cambio al momento.

---

## 5. Asistente de IA

### Grafo de LangGraph

```mermaid
flowchart TD
    START([Mensaje del cliente]) --> GI[guard_input<br/>roles, longitud, historial de 20]
    GI -->|"no válido"| END1([Error controlado])
    GI -->|ok| AG[agent<br/>system prompt del servidor<br/>Claude Sonnet 5.5]
    AG -->|"necesita datos"| TL[tools<br/>consulta Firestore en cada llamada]
    TL --> AG
    AG -->|"más de 5 rondas"| LR[limit_reached<br/>corta el bucle]
    AG -->|"respuesta final"| GO[guard_output<br/>sin prompt, uid, ids ni claves]
    LR --> GO
    GO --> END2([Respuesta en streaming])
```

### Autenticación híbrida

```mermaid
flowchart LR
    Q["Pregunta"] --> T{"¿Token válido?"}
    T -->|"sin token"| ANON["Herramientas públicas<br/>list_products · get_product<br/>get_shipping_policy"]
    T -->|"token válido"| AUTH["Públicas + pedidos<br/>list_my_orders · get_my_order"]
    T -->|"token falso o caducado"| E401["401"]
    AUTH --> UID["uid inyectado desde el token<br/>nunca como parámetro de la herramienta"]
```

| Control | Valor |
|---|---|
| Modelo principal y respaldo | Claude Sonnet 5.5, y GPT-5.4 mini si falla por 429, 5xx o timeout |
| Límites | 1000 caracteres por mensaje, 20 de historial, 5 rondas de herramientas, 1024 tokens |
| Uso | 20 mensajes cada 10 minutos por usuario o IP |
| Prompt injection | El modelo no puede elegir de quién lee: el uid sale del token |
| Respuestas | Streaming SSE. Fechas en hora peninsular y estados con los mismos nombres que la web |

---

## 6. Modelo de datos

```mermaid
erDiagram
    USERS ||--o{ ORDERS : "hace"
    PRODUCTS ||--|{ VARIANTS : "tiene"
    ORDERS ||--|{ ORDER_ITEMS : "contiene"
    VARIANTS ||--o{ ORDER_ITEMS : "se compra como"

    USERS {
        string uid PK
        string email
        string displayName
        string provider
    }
    PRODUCTS {
        string slug PK
        string name
        array images
        array options
        object badge
        bool active
    }
    VARIANTS {
        string sku PK
        object options
        number price
        bool inStock
    }
    ORDERS {
        string stripeSessionId PK
        string orderNumber
        string userId FK
        string status
        array statusHistory
        number total
        string carrier
        string trackingNumber
        timestamp reviewedAt
    }
    ORDER_ITEMS {
        string sku
        number unitPrice
        number quantity
    }
```

- El identificador del pedido es el de la sesión de Stripe. Así el webhook no puede duplicarlo.
- `counters/orders` genera el número correlativo en una transacción.
- Los datos de los colchones viven en Firestore y se gestionan desde el panel. El fichero `data/catalog.json` solo es la semilla inicial.

---

## 7. Panel de administración y fotos

```mermaid
sequenceDiagram
    autonumber
    actor A as admin@contoso.example
    participant P as Panel (navegador)
    participant ST as Firebase Storage
    participant API as API de admin (Next.js)
    participant F as Firestore

    A->>P: Arrastra fotos al formulario
    P->>P: Valida tipo y tamaño<br/>comprime a WebP 1600 px
    P->>ST: Sube a products/slug/
    ST->>ST: Reglas: admin, correo verificado,<br/>menos de 5 MB, solo imágenes
    ST-->>P: URL de descarga
    A->>P: Guarda el colchón
    P->>API: PUT producto + token
    API->>API: Claim admin + correo verificado<br/>+ correo en ADMIN_EMAILS
    API->>F: Escribe con Admin SDK
    API->>API: Revalida home y ficha
    Note over P,F: La tienda y el asistente ven el cambio al momento
```

**Qué se gestiona:** colchones con variantes, precios, stock, fotos y etiqueta de tarjeta, y pedidos con filtros, cambio de estado y resumen del día.

---

## 8. Seguridad

```mermaid
flowchart TB
    subgraph Navegador
        C1["Cliente"]
        C2["Administrador"]
    end
    subgraph Servidor["Servidor · comprobado en cada petición"]
        CK["/api/checkout<br/>token + precio del catálogo"]
        WH["/api/webhooks/stripe<br/>firma de Stripe"]
        AD["/api/admin/**<br/>claim + correo verificado + lista permitida"]
        AG["Asistente<br/>token verificado, solo lectura"]
    end
    subgraph Datos
        FS[("Firestore<br/>el navegador solo lee lo suyo")]
        ST[("Storage<br/>solo el admin sube y borra")]
    end
    C1 --> CK --> FS
    C1 --> AG --> FS
    WH --> FS
    C2 --> AD --> FS
    C2 --> ST
```

| Riesgo | Mitigación |
|---|---|
| Acceso a datos ajenos | Reglas de Firestore, uid siempre del token y comprobación de propiedad |
| Precio manipulado | El servidor recalcula con el catálogo de Firestore |
| Pedidos falsos | Solo desde el webhook firmado. La página de éxito pregunta a Stripe |
| Prompt injection | El asistente no puede elegir usuario y solo tiene herramientas de lectura |
| Escalada a administrador | Claim que solo pone el servidor, correo verificado y lista permitida, también en Storage |
| Secretos | Ninguno en el repositorio ni con prefijo `NEXT_PUBLIC_`. Claves de IA en Secret Manager |
| Contraseñas | Mínimo 8 caracteres también en Firebase y protección contra la enumeración de correos |
| Cabeceras | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy y CORS restringido |

---

## 9. Despliegue

```mermaid
flowchart LR
    DEV["Desarrollo local"] -->|"rama feature"| GH["GitHub"]
    GH -->|"PR a develop"| DV["develop<br/>preview en Vercel"]
    DV -->|"PR solo desde develop"| MA["master<br/>producción en Vercel"]
    DEV -->|"gcloud run deploy"| CR["Cloud Run<br/>asistente · Madrid"]
    DEV -->|"firebase deploy"| FB["Reglas e índices<br/>Firestore y Storage"]
    SEC["Secret Manager"] --> CR
    ENV["Variables de Vercel<br/>secretas marcadas Sensitive"] --> MA
```

`master` está protegida: solo admite PR desde `develop` y bloquea el push directo, el force push y el borrado.

---

## 10. Estrategia de pruebas

```mermaid
flowchart BT
    U["Unitarias y de componentes<br/>catálogo, carrito, formato, subida de fotos,<br/>emails, chat, guards del asistente"]
    I["Integración de API con dobles<br/>checkout, webhook, panel, asistente FastAPI"]
    R["Reglas en emulador<br/>Firestore 13 · Storage 19"]
    M["Casos manuales de extremo a extremo<br/>94 casos priorizados"]
    U --> I --> R --> M
```

| Suite | Pruebas |
|---|---|
| Web (Vitest) | 315 |
| Asistente (pytest) | 138 |
| Reglas de Firestore y Storage | 32 |
| Scripts | 10 |
| **Total** | **495** |

```mermaid
pie showData
    title Pruebas automáticas por suite
    "Web" : 315
    "Asistente" : 138
    "Reglas" : 32
    "Scripts" : 10
```

QA hizo tres rondas sobre la aplicación desplegada. Todos los defectos encontrados están corregidos y tienen su prueba de regresión:
- el asistente se corregía sin motivo;
- fechas y estados distintos entre la web y el asistente;
- opciones en distinto orden;
- el botón del chat tapaba contenido;
- palabras largas se salían del chat;
- la página de éxito aceptaba pagos inventados.

---

## 11. Guion de la demo

1. **Home y ficha.** Recorrer la home, configurar un Caribe y ver cómo cambia el precio.
2. **Carrito.** Añadir al carrito, abrir el mini carrito y cambiar cantidades.
3. **Asistente sin sesión.** Preguntar qué colchón conviene si duermes de lado y pasas calor, y cuánto tarda el envío a Canarias.
4. **Login.** Entrar con Google o con demo1.
5. **Pago.** Pagar con la tarjeta 4242 y ver la página de éxito con el número de pedido. Mostrar el email de confirmación.
6. **Asistente con sesión.** Preguntar "¿Dónde está mi pedido?".
7. **Prompt injection.** Pedir los pedidos de otro usuario y ver que se niega.
8. **Panel.** Entrar como administrador. Ver el aviso de pedido nuevo y pasar el pedido a En preparación y luego a Enviado con seguimiento.
9. **Datos actualizados.** Volver al asistente y ver el estado nuevo con el número de seguimiento.
10. **Fotos.** Subir una foto a un colchón y verla en la tienda.
11. **Respaldo de IA.** Si hay tiempo, forzar el fallo de Anthropic y ver que responde OpenAI.

---

## 12. Decisiones principales

| Decisión | Motivo |
|---|---|
| Marca propia con identidad colombiana y colchones de adulto | Identidad propia sin copiar la referencia, con los mismos ejes de configuración |
| Asistente separado en Python con LangGraph | Etapas de control explícitas y aislamiento: el asistente no puede escribir ni ver secretos de la tienda |
| Anthropic con respaldo de OpenAI | Disponibilidad ante errores del proveedor |
| Pedidos solo desde el webhook | Integridad: no se puede crear un pedido sin pago confirmado |
| Gmail en lugar de Resend | Resend exige dominio propio para enviar a cualquier cliente |
| Catálogo en Firestore con panel | Un ecommerce no puede tener los productos fijados en el código |
| Subida directa a Storage con reglas | Evita el límite de tamaño de las funciones y protege el acceso en origen |

## 13. Limitaciones conocidas

- El límite de mensajes del asistente es por instancia de Cloud Run.
- Cancelar un pedido no lo reembolsa en Stripe.
- La tarifa de envío la elige el comprador y no se valida con el código postal.
- La opción "A medida" no recoge las medidas en la web.
- Las fotos que se quitan del formulario se quedan en Storage.
- El email sale de una cuenta de Gmail y puede llegar a spam.
