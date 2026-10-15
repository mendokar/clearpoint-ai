# Asistente IA de Colchones Contoso (`agent/`)

Servicio Python (FastAPI + LangGraph) que da respuesta al chat de la tienda. Se despliega en Cloud Run
(`europe-southwest1`, Madrid) y el front de `web/` lo consume por HTTP con streaming SSE.

## Qué hace

El asistente es **solo de consulta** y responde en español sobre:

1. **Productos**: los colchones Cafetal y Caribe, sus medidas, núcleos (Brisa / Ceiba+), fundas, precios y stock.
2. **Envíos, devoluciones, cambios y garantía**: la política publicada por la tienda.
3. **Pedidos del usuario autenticado**: estado actual, historial, transportista, seguimiento e importes.

Nunca crea, modifica ni cancela nada. Para devoluciones, cambios o cancelaciones remite a
atención al cliente (**hola@contoso.example**). Sin sesión responde sobre productos y política, y si le
preguntan por pedidos pide que el usuario inicie sesión.

## Arquitectura

```mermaid
graph TD;
	__start__([__start__]):::first
	guard_input(guard_input)
	agent(agent)
	tools(tools)
	limit_reached(limit_reached)
	guard_output(guard_output)
	__end__([__end__]):::last
	__start__ --> guard_input;
	guard_input -. entrada no válida .-> __end__;
	guard_input -. ok .-> agent;
	agent -. tool calls .-> tools;
	agent -. tool calls tras 5 rondas .-> limit_reached;
	agent -. respuesta final .-> guard_output;
	tools --> agent;
	limit_reached --> guard_output;
	guard_output --> __end__;
	classDef default fill:#f2f0ff,line-height:1.2
	classDef first fill-opacity:0
	classDef last fill:#bfb6fc
```

(Generado con `graph.get_graph().draw_mermaid()`, con las etiquetas de las aristas añadidas a mano.)

| Nodo | Qué hace |
|---|---|
| `guard_input` | Valida la conversación del cliente (solo roles `user`/`assistant`, texto, ≤1000 caracteres por mensaje de usuario, último mensaje del usuario y no vacío) y la recorta a los últimos 20 mensajes; si no es válida, termina sin llamar al LLM. |
| `agent` | Antepone el system prompt del servidor y llama al LLM (Anthropic, con fallback a OpenAI) con las tools permitidas para la sesión; cuenta las rondas de tools. |
| `tools` | `ToolNode` de LangGraph que ejecuta las tools de solo lectura; leen `uid` y repositorio de `config["configurable"]` y consultan los datos en cada llamada. |
| `limit_reached` | Si el modelo pide una sexta ronda de tools, corta el bucle y marca la respuesta para sustituirla por un mensaje controlado. |
| `guard_output` | Revisa la respuesta final: si filtra el system prompt, el uid, ids de Stripe, claves o nombres de campos internos (o viene vacía), la sustituye por un mensaje genérico. |

Ficheros:

| Fichero | Contenido |
|---|---|
| `app/main.py` | FastAPI: `/health`, `/chat`, CORS, cabeceras de seguridad, rate limit, errores genéricos, SSE. |
| `app/auth.py` | Verificación del Firebase ID token (`firebase_admin.auth.verify_id_token`) → `uid`. |
| `app/graph.py` | Grafo LangGraph y `stream_chat` (traduce el stream del grafo a eventos SSE). |
| `app/llm.py` | `ChatAnthropic` primario + `ChatOpenAI` de fallback (`with_fallbacks`), `FORCE_FALLBACK`. |
| `app/tools.py` | Las 5 tools de solo lectura y la proyección de campos (lista blanca). |
| `app/guards.py` | Validación de entrada y detección de fugas en la salida. |
| `app/prompts.py` | System prompt (lo pone siempre el servidor). |
| `app/repository.py` | Interfaz `Repository` + `FirestoreRepository` (producción) e `InMemoryRepository` (local/tests). |
| `app/ratelimit.py` | Rate limit en memoria con ventana deslizante. |
| `app/config.py` | Variables de entorno (pydantic-settings). |
| `app/logging_config.py` | Logs JSON estructurados para Cloud Logging. |

## Herramientas

Todas son de solo lectura y consultan el repositorio **en cada llamada** (sin caché), así que el estado de un
pedido es siempre el actual. Ninguna tiene `uid` como parámetro.

| Tool | Parámetros (los que ve el modelo) | Disponible | Fuente | Devuelve |
|---|---|---|---|---|
| `list_products` | — | Siempre | `products` (where `active == true`) | Por producto: `slug`, `name`, `shortDescription`, `priceFrom`, `currency`, `options` |
| `get_product` | `slug` (`^[a-z0-9]+(-[a-z0-9]+)*$`) | Siempre | `products/{slug}` | Lo anterior + `description`, `features`, `optionDetails` y `variants` (`sku`, `options`, `price`, `currency`, `inStock`) |
| `get_shipping_policy` | — | Siempre | `content/shipping_policy` | `title`, `policy_markdown` |
| `list_my_orders` | `limit` (1–10, por defecto 5) | Con sesión | `orders` where `userId == uid` order by `createdAt desc` | Por pedido: `orderNumber`, `status`, `statusLabel`, `total`, `currency`, `createdAt`, `carrier`, `trackingNumber`, `estimatedDelivery`, `items` (texto "1 × Colchón …") |
| `get_my_order` | `order_number` (`CP-` + 6 dígitos) | Con sesión | `orders` where `userId == uid` and `orderNumber == …` | Lo anterior + `statusHistory`, `items` (nombre, opciones, precio unitario, cantidad), `subtotal`, `shipping`, `shippingDestination` (ciudad, CP, país), `updatedAt` |

Nunca se devuelven `userId`, `email`, `stripePaymentIntentId`, el ID del documento (sesión de Stripe) ni el
nombre o la calle de la dirección. Si un pedido no existe **o es de otro usuario**, `get_my_order` devuelve
exactamente el mismo "no encontrado". Entradas con formato no válido se rechazan antes de consultar los datos.

## Seguridad

- **uid inyectado, nunca elegido por el modelo.** FastAPI verifica el ID token y pasa el `uid` al grafo en
  `config["configurable"]["uid"]`. Las tools lo leen de un parámetro `config: RunnableConfig` que LangChain
  inyecta y que **no aparece en el schema** (hay un test que lo comprueba). Si el modelo inventa un argumento
  `uid`/`user_id`, se ignora. El `uid` tampoco está en los mensajes ni en el prompt que ve el LLM.
- **Defensa en profundidad.** Las tools de pedidos solo se enlazan al modelo con sesión; aun así, cada tool
  exige un `uid` en el config y el repositorio filtra por `userId` en la propia consulta y lo vuelve a
  comprobar en el resultado.
- **Solo lectura.** No existe ninguna tool de escritura y en producción la cuenta de servicio solo tiene
  `roles/datastore.viewer`.
- **Auth.** Sin `Authorization` → anónimo. `Authorization` mal formada, token inválido, caducado, revocado
  o de un usuario deshabilitado → `401`.
- **Límites.** `max_tokens` 1024, timeout 30 s y 1 reintento por proveedor, máx. 5 rondas de tools por turno,
  ≤1000 caracteres por mensaje de usuario, últimos 20 mensajes de historial, máx. 100 mensajes por petición
  y 20 peticiones / 10 min por uid (o por IP si es anónimo) → `429`.
- **System prompt solo del servidor.** El cliente solo puede enviar roles `user`/`assistant`; un rol `system`
  o campos extra devuelven `422`.
- **Salida revisada** por `guard_output` (canario del prompt, frases literales del prompt, uid, ids de Stripe,
  claves, nombres de campos internos).
- **HTTP.** CORS restringido a `ALLOWED_ORIGINS` (sin credenciales; el token va en cabecera), `/docs` y
  `/openapi.json` desactivados, `debug=False`, cabeceras `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- **Errores y logs.** Al cliente solo le llegan mensajes genéricos (nunca se refleja la entrada ni se envía
  una traza). Logs JSON solo con metadatos (evento, duración, proveedor, nombre de tool, tipo de excepción);
  nunca tokens, claves, contenido de mensajes ni uid. No hay access log de uvicorn en la imagen.
- **Secretos.** Ninguno en el código; en Cloud Run vienen de Secret Manager. `.env*` está en `.gitignore` y
  `.dockerignore`.

### OWASP Top 10 para LLM

| Riesgo | Mitigación en este servicio |
|---|---|
| LLM01 Prompt injection | El `uid` no es parámetro de ninguna tool; los argumentos extra se ignoran; el prompt trata los mensajes y los resultados de tools como datos; `guard_output` bloquea fugas. |
| LLM02 Sensitive information disclosure | Proyección de campos en lista blanca; "no encontrado" idéntico para pedidos ajenos; logs sin datos personales. |
| LLM05 Improper output handling | Respuesta en texto/markdown; el front lo renderiza sin HTML crudo. |
| LLM06 Excessive agency | Solo tools de lectura; cuenta de servicio `datastore.viewer`. |
| LLM07 System prompt leakage | El prompt no contiene secretos; canario + detección de frases literales en `guard_output`. |
| LLM10 Unbounded consumption | Límites de tokens, rondas de tools, longitud, historial y rate limit; `max-instances` bajo. |

## Requisitos

- Python **3.12** (en este equipo, `/usr/bin/python3.12`; el `python3` del sistema es 3.8).
- Para producción: proyecto de Firebase/GCP con Firestore y Auth, y una clave de Anthropic.
- Docker (opcional) para construir la imagen.

## Ejecutar en local

```bash
cd agent
/usr/bin/python3.12 -m venv .venv
# Si falla por falta de ensurepip (Debian/Ubuntu sin python3.12-venv):
#   /usr/bin/python3.12 -m venv --without-pip .venv
#   /usr/bin/python3.12 -m pip --python .venv/bin/python install pip
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env        # y rellena ANTHROPIC_API_KEY
.venv/bin/uvicorn app.main:create_app --factory --port 8080 --reload
```

**Repositorio en memoria vs Firestore** (`REPOSITORY_BACKEND`):

- `memory`: carga `../data/catalog.json`, `../data/shipping_policy.md` y `../data/demo_orders.json`
  (ruta configurable con `DATA_DIR`). No necesita credenciales. Los pedidos demo pertenecen a los uid
  literales `DEMO_UID_1` / `DEMO_UID_2`, así que solo son accesibles en los tests (en local no hay un token
  de Firebase con esos uid).
- `firestore` (por defecto): usa Application Default Credentials. En local:
  `gcloud auth application-default login` y `FIREBASE_PROJECT_ID=<proyecto>`.

Comprobación rápida:

```bash
curl -s localhost:8080/health          # {"status":"ok"}
```

Sin `ANTHROPIC_API_KEY`, `/health` responde y `/chat` devuelve un `503` controlado (`llm_unavailable`).

## Variables de entorno

| Nombre | Obligatoria | Descripción | Ejemplo |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Sí | Clave del proveedor primario. En Cloud Run, desde Secret Manager. | *(secreto)* |
| `ANTHROPIC_MODEL` | No | Modelo de Anthropic (id directo, sin prefijo). | `claude-sonnet-5-5` (por defecto) o `claude-haiku-5-5` |
| `ANTHROPIC_EFFORT` | No | Esfuerzo de razonamiento adaptativo: `low`, `medium`, `high`; vacío = el del modelo. | `low` (por defecto) |
| `OPENAI_API_KEY` | No | Activa el fallback a OpenAI. Si está vacía, no hay fallback. | *(secreto)* |
| `OPENAI_MODEL` | No | Modelo de fallback. | `gpt-5.4-mini` (por defecto) |
| `FORCE_FALLBACK` | No | `true` hace fallar siempre al primario para demostrar el fallback (se ignora sin `OPENAI_API_KEY`). | `false` |
| `REPOSITORY_BACKEND` | No | `firestore` o `memory`. | `firestore` (por defecto) |
| `DATA_DIR` | No | Carpeta de datos del repositorio en memoria. | `../data` |
| `FIREBASE_PROJECT_ID` | Sí en producción | Proyecto de Firebase para verificar tokens y leer Firestore. | `contoso-colchones` |
| `ALLOWED_ORIGINS` | Sí en producción | Orígenes CORS permitidos, separados por comas. | `https://<app>.vercel.app,http://localhost:3000` |
| `LOG_LEVEL` | No | Nivel de log. | `INFO` |
| `PORT` | No | Puerto (Cloud Run lo fija). | `8080` |

Los límites (`MAX_TOKENS`, `MAX_TOOL_ITERATIONS`, `MAX_USER_MESSAGE_CHARS`, `MAX_HISTORY_MESSAGES`,
`RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS`, `LLM_TIMEOUT_SECONDS`, `LLM_MAX_RETRIES`) también se pueden
sobrescribir por entorno; sus valores por defecto son los de la sección de Seguridad.

## Contrato de `/chat` y eventos SSE

### Petición

```
POST /chat
Content-Type: application/json
Authorization: Bearer <Firebase ID token>      (opcional; sin ella = modo anónimo)

{
  "messages": [
    {"role": "user", "content": "¿Qué colchón me recomendáis si duermo de lado?"},
    {"role": "assistant", "content": "Te recomiendo el Colchón Cafetal..."},
    {"role": "user", "content": "¿Y dónde está mi pedido CP-000118?"}
  ]
}
```

- `messages`: 1–100 elementos; `role` ∈ {`user`, `assistant`}; `content` es texto. No se admiten otros campos.
- El último mensaje debe ser del usuario. El servidor usa los últimos 20.
- El front envía el historial completo en cada turno (el servicio no guarda estado).

### Respuestas que no son stream (JSON)

Formato: `{"error": {"code": "...", "message": "..."}}`

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `message_too_long`, `empty` | Mensaje de usuario > 1000 caracteres, último mensaje vacío o que no es del usuario |
| 401 | `unauthorized` | `Authorization` mal formada o token inválido/caducado/revocado |
| 422 | `invalid_request` | JSON no válido, rol no permitido (p. ej. `system`) o campos extra |
| 429 | `rate_limited` | Más de 20 peticiones en 10 min (cabecera `Retry-After`) |
| 503 | `llm_unavailable` / `auth_unavailable` | Sin clave de LLM configurada / no se pueden verificar tokens |
| 500 | `internal_error` | Error inesperado |

### Respuesta en streaming (`200`, `Content-Type: text/event-stream`)

Cada evento tiene la forma `event: <tipo>\ndata: <JSON>\n\n`:

| Evento | `data` | Significado |
|---|---|---|
| `token` | `{"text": "..."}` | Fragmento de texto del asistente. Se concatenan en orden. |
| `tool_start` | `{"name": "list_my_orders"}` | El asistente está consultando una herramienta (útil para mostrar "Consultando tus pedidos…"). |
| `replace` | `{"text": "..."}` | `guard_output` ha sustituido la respuesta (fuga bloqueada, límite de tools o respuesta vacía). **El front debe reemplazar todo el texto mostrado de este turno por `text`.** |
| `done` | `{"provider": "anthropic" \| "openai" \| "unknown"}` | Fin correcto del turno y proveedor que respondió. |
| `error` | `{"code": "llm_unavailable" \| "invalid_input", "message": "..."}` | Error durante el turno; el stream termina sin `done`. Mostrar `message`. |

Notas para el front:
- `EventSource` no admite `POST` ni cabeceras: usar `fetch` y leer `response.body` (o una librería como
  `@microsoft/fetch-event-source`). Comprobar primero `response.ok`; si no, leer el JSON de error.
- Si el modelo escribe algo antes de llamar a una tool (p. ej. "Voy a consultarlo"), ese texto llega como
  `token` antes del `tool_start`; el texto final continúa después.

### Ejemplo con curl

```bash
curl -N -X POST http://localhost:8080/chat \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ID_TOKEN" \
  -d '{"messages":[{"role":"user","content":"¿En qué estado está mi pedido CP-000118?"}]}'
```

```
event: tool_start
data: {"name": "get_my_order"}

event: token
data: {"text": "Tu pedido **CP-000118** "}

event: token
data: {"text": "está enviado con SEUR (seguimiento SEUR7701239876)..."}

event: done
data: {"provider": "anthropic"}
```

## Tests

```bash
cd agent
.venv/bin/python -m pytest                                  # todos
.venv/bin/python -m pytest --cov=app --cov-report=term-missing
```

No usan red ni credenciales: el LLM es un modelo falso guionizado (`tests/fakes.py`, emite texto en streaming
y tool calls) y `verify_id_token` se sustituye con `monkeypatch`.

| Fichero | Qué cubre |
|---|---|
| `tests/test_tools.py` | `uid` ausente de todos los schemas (y parámetros exactos de cada tool); tools de pedidos solo con sesión; aislamiento (`list`/`get` solo del uid; pedido ajeno = inexistente); argumentos `uid`/`user_id` inventados se ignoran; `slug` y `order_number` malformados o con inyección (`CP-000123' OR 1=1`, `../`, saltos de línea) rechazados sin consultar los datos; sin campos sensibles en la salida; datos frescos en cada llamada. |
| `tests/test_guards.py` | Validación de entrada (vacío, roles `system`/`tool`, longitud, último mensaje, recorte a 20) y detección de fugas (canario, uid, ids de Stripe, claves, campos internos, frases literales del prompt) sin falsos positivos en respuestas normales. |
| `tests/test_graph.py` | Grafo completo: flujo sin tool y con tool, streaming en trozos, system prompt solo del servidor (un rol `system` del cliente no lo sustituye), `guard_input` corta antes del LLM, recorte de historial, límite de 5 rondas, `guard_output` saneando uid/canario/id de Stripe, aislamiento entre usuarios, prompt injection con `uid` extra, anónimo sin tools de pedidos, el uid nunca llega al modelo, errores de tool genéricos, fallback ante 429/500/529/timeout, sin fallback ante 401 y `FORCE_FALLBACK`. |
| `tests/test_api.py` | HTTP: `/health`, docs desactivados, SSE; `Authorization` mal formada/inválida/caducada → 401; backend de auth caído → 503; aislamiento vía API; payloads inválidos (rol `system`, campos extra, longitud) sin reflejar la entrada; rate limit por IP y por uid y expiración de la ventana; CORS (origen permitido y rechazado); sin clave de LLM → 503; error del LLM → evento `error` genérico sin secretos; proveedor de fallback en `done`; los logs (caplog y salida JSON) no contienen token, mensaje ni uid. |
| `tests/test_config_llm_repo.py` | `ALLOWED_ORIGINS` separado por comas; construcción real de `ChatAnthropic`/`ChatOpenAI` sin red (modelo `claude-sonnet-5-5`, `max_tokens`, timeout, reintentos, fallback); detección del proveedor; `FirestoreRepository` filtra por `userId` en la consulta y vuelve a comprobarlo. |

## Docker

```bash
cd agent
docker build -t contoso-agent .
docker run --rm -p 8080:8080 --env-file .env contoso-agent
# Con repositorio en memoria (los datos no van en la imagen):
docker run --rm -p 8080:8080 --env-file .env -e REPOSITORY_BACKEND=memory -e DATA_DIR=/data \
  -v "$(pwd)/../data:/data:ro" contoso-agent
```

Imagen `python:3.12-slim-bookworm`, usuario sin privilegios (uid 10001), escucha en `$PORT` (8080 por defecto),
sin tests ni `.env` dentro (ver `.dockerignore`).

## Despliegue en Cloud Run

Una vez por proyecto: cuenta de servicio con permisos mínimos y secretos.

```bash
PROJECT_ID=<proyecto>
gcloud iam service-accounts create agent-sa --display-name "Contoso agent (solo lectura)"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member "serviceAccount:agent-sa@$PROJECT_ID.iam.gserviceaccount.com" --role roles/datastore.viewer

printf '%s' "<clave-anthropic>" | gcloud secrets create anthropic-key --data-file=-
printf '%s' "<clave-openai>"    | gcloud secrets create openai-key --data-file=-     # opcional
for s in anthropic-key openai-key; do
  gcloud secrets add-iam-policy-binding $s \
    --member "serviceAccount:agent-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role roles/secretmanager.secretAccessor
done
```

Despliegue (desde la raíz del repo):

```bash
gcloud run deploy agent \
  --source agent \
  --region europe-southwest1 \
  --service-account agent-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --set-secrets ANTHROPIC_API_KEY=anthropic-key:latest,OPENAI_API_KEY=openai-key:latest \
  --set-env-vars "^@^FIREBASE_PROJECT_ID=$PROJECT_ID@REPOSITORY_BACKEND=firestore@ALLOWED_ORIGINS=https://<app>.vercel.app,http://localhost:3000@ANTHROPIC_MODEL=claude-sonnet-5-5" \
  --allow-unauthenticated \
  --max-instances 3 --min-instances 1 \
  --memory 512Mi --cpu 1 --concurrency 40 --timeout 120
```

- `^@^` cambia el separador de `--set-env-vars` para que la coma de `ALLOWED_ORIGINS` no rompa el comando.
- Sin fallback: quita `,OPENAI_API_KEY=openai-key:latest`.
- `--allow-unauthenticated` es necesario porque el navegador llama directamente; la autorización la hace el
  propio servicio con el ID token de Firebase.
- Firestore necesita el índice compuesto `orders: userId ASC, createdAt DESC` (`firebase deploy --only firestore:indexes`).
- Para demostrar el fallback: `gcloud run services update agent --region europe-southwest1 --update-env-vars FORCE_FALLBACK=true`.

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| `/chat` → `503 llm_unavailable` | Falta `ANTHROPIC_API_KEY` (log `llm_not_configured`). |
| Evento `error` `llm_unavailable` en el stream | Error del proveedor sin fallback posible (clave inválida, 400, o 429/5xx sin `OPENAI_API_KEY`). Ver log `chat_failed` (`exc_type`, `status_code`). |
| Todo token → `401` | Falta `FIREBASE_PROJECT_ID` o el token es de otro proyecto de Firebase (log `auth_rejected`). |
| `503 auth_unavailable` | No se pudieron descargar los certificados de Google (red) o credenciales mal configuradas. |
| Error de CORS en el navegador | El origen del front no está en `ALLOWED_ORIGINS` (sin barra final, con esquema). |
| Log `tool_error` con `exc_type` `FailedPrecondition` | Falta el índice compuesto de `orders`. |
| Log `tool_error` con `exc_type` `PermissionDenied` | La cuenta de servicio no tiene `roles/datastore.viewer`. |
| `python3 -m venv` falla | Usa `/usr/bin/python3.12` (ver "Ejecutar en local"). |

## Limitaciones

- El rate limit es en memoria: no se comparte entre instancias de Cloud Run (mitigado con `max-instances 3`).
- `guard_output` actúa sobre la respuesta completa: los tokens ya se han enviado en streaming y, si bloquea,
  el front recibe `replace` y debe sustituir el texto. La protección principal es que las tools nunca
  devuelven datos internos ni ajenos.
- El fallback solo actúa si el primario falla antes de empezar a responder; un corte a mitad de stream
  termina en evento `error`.
- `FORCE_FALLBACK` simula el fallo del primario (no hace una llamada real a Anthropic).
- La detección de fugas es heurística (canario, patrones y frases literales); no detecta paráfrasis.
- El servicio no guarda conversaciones: el historial lo envía el front en cada turno.
