# scripts — Datos demo, roles y estado de pedidos

Scripts de administración en TypeScript (ejecutados con `tsx`) que usan **firebase-admin**. No forman parte
del despliegue: se lanzan a mano contra el proyecto de Firebase (o contra los emuladores).

```
scripts/
├── seed.ts                  # Productos, política, usuarios demo y sus pedidos (idempotente)
├── set-admin.ts             # Asigna o quita el rol de administrador (custom claim admin)
├── update-order-status.ts   # Avanza el estado de un pedido (mismas reglas que el panel)
├── lib/admin.ts             # Inicialización de firebase-admin y utilidades
├── lib/set-admin.ts         # Lógica de set-admin, probada con dobles
├── tests/set-admin.test.ts  # node:test vía tsx (npm test)
├── .env.example
└── package.json             # firebase-admin, zod, tsx (versiones fijadas)
```

## Configuración

```bash
cd scripts
npm ci
cp .env.example .env         # .env está en .gitignore
```

| Variable | Obligatoria | Descripción |
|---|---|---|
| `FIREBASE_ADMIN_CREDENTIALS` | Sí (o la siguiente) | JSON de cuenta de servicio en base64 (mismo valor que en `web/`) |
| `GOOGLE_APPLICATION_CREDENTIALS` + `FIREBASE_PROJECT_ID` | Alternativa | Ruta a un JSON **fuera del repo** o credenciales de `gcloud auth application-default login` |
| `DEMO1_EMAIL` / `DEMO2_EMAIL` | No | Por defecto `demo1@contoso.example` y `demo2@contoso.example` |
| `DEMO1_PASSWORD` / `DEMO2_PASSWORD` | Sí para `seed.ts` | Contraseñas de los usuarios demo (mín. 8 caracteres). **Nunca** van en el código |

Con `FIRESTORE_EMULATOR_HOST` y `FIREBASE_AUTH_EMULATOR_HOST` definidos (lo hace `firebase emulators:exec`) los
scripts trabajan contra los emuladores y no necesitan credenciales.

## `seed.ts`

> `data/catalog.json` es solo la **semilla inicial** del catálogo. Una vez sembrado, los productos se gestionan desde
> el panel `/admin/productos`. **Volver a ejecutar el seed sobrescribe** `colchon-cafetal` y `colchon-caribe` con los
> datos del JSON (los productos nuevos creados en el panel no se tocan).

Carga los datos de [`data/`](../data) en Firestore y Firebase Auth:

1. `products/{slug}` ← cada producto de `data/catalog.json` (con todas sus variantes).
2. `content/shipping_policy` ← `{ title, body_md, updatedAt }` desde `data/shipping_policy.md`.
3. Usuarios demo en Firebase Auth: los crea o, si ya existen (por email), actualiza contraseña y nombre.
4. `users/{uid}` de cada usuario demo.
5. `orders/{id}` ← `data/demo_orders.json`, sustituyendo `DEMO_UID_1`/`DEMO_UID_2` por los `uid` reales y las
   fechas ISO por `Timestamp`.
6. `counters/orders` ← al menos el mayor número de pedido demo (123), para que los pedidos reales sigan en
   `CP-000124`. El contador nunca retrocede.

Es **idempotente**: usa IDs fijos (`set`), busca los usuarios por email y el contador solo sube. Al volver a
ejecutarlo los pedidos demo vuelven a su estado original (útil para reiniciar una demo).

```bash
npm run seed                 # = npx tsx --env-file=.env seed.ts
```

Salida de ejemplo:

```
✓ 2 productos y la política de envíos
✓ usuarios demo: demo1@contoso.example (gDhFqkbjILEOqkMXXmA6g4yjMqsP), demo2@contoso.example (Rkpbl44m63JTWMhUPMG5HHLWP7gR)
✓ 4 pedidos demo; contador de pedidos ≥ 123
```

Resultado: `demo1` tiene 3 pedidos (`CP-000101` entregado, `CP-000118` enviado con SEUR, `CP-000123`
pagado) y `demo2` uno (`CP-000120` en preparación, a Baleares). Sirven para comprobar el aislamiento entre
usuarios en "Mis pedidos" y en el asistente.

## `set-admin.ts`

Asigna o quita el **custom claim `admin: true`** que abre el panel `/admin` y las rutas `/api/admin/**`:

```bash
npm run admin:set -- persona@ejemplo.com            # = npx tsx --env-file=.env set-admin.ts persona@ejemplo.com
npm run admin:set -- persona@ejemplo.com --revoke
```

- La persona debe existir en Firebase Auth (registrada con correo o con Google al menos una vez).
- **Idempotente**: si ya tiene (o ya no tiene) el rol, no escribe nada (`=` en la salida).
- Conserva los demás custom claims del usuario.
- `--revoke` quita el claim y **revoca sus sesiones** (`revokeRefreshTokens`): como las rutas de administración
  verifican el token con `checkRevoked`, pierde el acceso al momento.
- Tras asignarlo, basta con que recargue `/admin` (la web pide un token nuevo con `getIdTokenResult(true)`).

```
$ npm run admin:set -- demo1@contoso.example
✓ demo1@contoso.example (DyA2pF…) ahora es administrador. Que recargue /admin para refrescar su token.
$ npm run admin:set -- demo1@contoso.example
= demo1@contoso.example (DyA2pF…) ya estaba con rol de administrador; no se ha cambiado nada.
$ npm run admin:set -- nadie@contoso.example
✗ No existe ningún usuario con el email nadie@contoso.example. Debe registrarse (o entrar con Google) antes.
```

## `update-order-status.ts`

Avanza un pedido desde la terminal. El panel `/admin/pedidos` hace lo mismo con interfaz (y además envía el email al
cliente); el script **no envía emails**.

```bash
npm run order:status -- <CP-000123> <paid|preparing|shipped|delivered|cancelled> [--carrier SEUR] [--tracking SE123] [--eta AAAA-MM-DD] [--force]
```

- Usa las **mismas reglas** que el panel, importadas de [`web/lib/orders/status.ts`](../web/lib/orders/status.ts):
  Pagado → En preparación → Enviado → Entregado, paso a paso, y Cancelado solo desde Pagado o En preparación. Una
  transición no permitida sale con código 1; `--force` la salta (solo para reiniciar demos).
- Busca el pedido por `orderNumber`, cambia `status`, añade `{status, at}` a `statusHistory` y actualiza
  `updatedAt`.
- Al pasar a `shipped` rellena `carrier` (por defecto `SEUR`), `trackingNumber` (generado si no hay) y
  `estimatedDelivery` (por defecto, dentro de 2 días laborables).
- Al pasar a `delivered` sin fecha estimada, pone la de hoy.
- Valida el formato del número y el estado; si el pedido no existe, sale con código 1.

Salida de ejemplo:

```
$ npm run order:status -- CP-000123 preparing
✓ CP-000123 (cs_test_demo_000123) → En preparación
  historial: paid → preparing

$ npm run order:status -- CP-000123 shipped
✓ CP-000123 (cs_test_demo_000123) → Enviado
  transportista: SEUR · seguimiento: SE8906403965 · entrega estimada: 2026-10-19
  historial: paid → preparing → shipped

$ npm run order:status -- CP-999999 shipped
✗ No existe el pedido CP-999999
```

### Demostrar que el asistente ve el estado actualizado

1. Ejecuta `npm run seed` e inicia sesión en la web como `demo1@contoso.example`.
2. Abre el asistente y pregunta: *"¿Cómo va mi pedido CP-000123?"* → responde que está **pagado**.
3. En el panel (`/admin/pedidos/cs_test_demo_000123`, con un usuario admin) pasa el pedido a **En preparación** y
   luego a **Enviado** con SEUR, `SE48201937` y la fecha. O en la terminal:
   `npm run order:status -- CP-000123 preparing` y
   `npm run order:status -- CP-000123 shipped --carrier SEUR --tracking SE48201937 --eta 2026-10-22`.
4. Vuelve a preguntar → ahora responde **enviado con SEUR**, con el número de seguimiento y la entrega
   estimada. "Mis pedidos" en la web muestra lo mismo al recargar.
5. Comprueba el aislamiento: con `demo2` pregunta por `CP-000123` → el asistente no lo encuentra.

## Probar sin proyecto real (emuladores)

Con Java 21 (ver [`firebase/README.md`](../firebase/README.md#probar-con-el-emulador)):

```bash
cd firebase && npm ci
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 PATH="/usr/lib/jvm/java-21-openjdk-amd64/bin:$PATH"
npx firebase emulators:exec --only firestore,auth --project demo-contoso \
  "cd ../scripts && DEMO1_PASSWORD=cambia-esto-1 DEMO2_PASSWORD=cambia-esto-2 npx tsx seed.ts && npx tsx set-admin.ts demo1@contoso.example && npx tsx update-order-status.ts CP-000123 preparing && npx tsx update-order-status.ts CP-000123 shipped"
```

Así se verificaron los scripts (incluida una segunda ejecución del seed y de `set-admin` para comprobar la
idempotencia). No uses `--env-file=.env` con los emuladores: `.env` tiene las credenciales del proyecto real.
`firebase.json` usa Firestore en el 8181, Auth en el 9099 y Storage en el 9199 (el 8080 lo usa el asistente en
local). Si alguno está ocupado, usa una copia de `firebase.json` con otros puertos (`--config`).

## Tests

```bash
npm test         # node:test con tsx: set-admin con un doble de firebase-admin/auth (8 tests)
```

## Comprobar tipos

```bash
npm run typecheck
```

## Restaurar solo los pedidos de demo

Después de probar cambios de estado en el panel:

```bash
npm run seed:pedidos
```

Devuelve CP-000101, CP-000118, CP-000120 y CP-000123 a su estado de `data/demo_orders.json`. No modifica colchones, política, contraseñas ni otros pedidos. El contador de pedidos nunca retrocede.
