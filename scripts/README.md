# scripts — Datos demo y simulación de pedidos

Scripts de administración en TypeScript (ejecutados con `tsx`) que usan **firebase-admin**. No forman parte
del despliegue: se lanzan a mano contra el proyecto de Firebase (o contra los emuladores).

```
scripts/
├── seed.ts                  # Productos, política, usuarios demo y sus pedidos (idempotente)
├── update-order-status.ts   # Avanza el estado de un pedido
├── lib/admin.ts             # Inicialización de firebase-admin y utilidades
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

## `update-order-status.ts`

Simula el avance de un pedido (no hay panel de administración):

```bash
npm run order:status -- <CP-000123> <paid|preparing|shipped|delivered|cancelled> [--carrier SEUR] [--tracking SE123] [--eta AAAA-MM-DD]
```

- Busca el pedido por `orderNumber`, cambia `status`, añade `{status, at}` a `statusHistory` y actualiza
  `updatedAt`.
- Al pasar a `shipped` rellena `carrier` (por defecto `SEUR`), `trackingNumber` (generado si no hay) y
  `estimatedDelivery` (por defecto, dentro de 2 días laborables).
- Al pasar a `delivered` sin fecha estimada, pone la de hoy.
- Valida el formato del número y el estado; si el pedido no existe, sale con código 1.

Salida de ejemplo:

```
$ npm run order:status -- CP-000123 preparing
✓ CP-000123 (cs_test_demo_000123) → preparing
  historial: paid → preparing

$ npm run order:status -- CP-000123 shipped
✓ CP-000123 (cs_test_demo_000123) → shipped
  transportista: SEUR · seguimiento: SE8906403965 · entrega estimada: 2026-10-19
  historial: paid → preparing → shipped

$ npm run order:status -- CP-999999 shipped
✗ No existe el pedido CP-999999
```

### Demostrar que el asistente ve el estado actualizado

1. Ejecuta `npm run seed` e inicia sesión en la web como `demo1@contoso.example`.
2. Abre el asistente y pregunta: *"¿Cómo va mi pedido CP-000123?"* → responde que está **pagado**.
3. En la terminal: `npm run order:status -- CP-000123 shipped --carrier SEUR --tracking SE48201937 --eta 2026-10-22`.
4. Vuelve a preguntar → ahora responde **enviado con SEUR**, con el número de seguimiento y la entrega
   estimada. "Mis pedidos" en la web muestra lo mismo al recargar.
5. Comprueba el aislamiento: con `demo2` pregunta por `CP-000123` → el asistente no lo encuentra.

## Probar sin proyecto real (emuladores)

Con Java 21 (ver [`firebase/README.md`](../firebase/README.md#probar-con-el-emulador)):

```bash
cd firebase && npm ci
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 PATH="/usr/lib/jvm/java-21-openjdk-amd64/bin:$PATH"
npx firebase emulators:exec --only firestore,auth --project demo-contoso \
  "cd ../scripts && DEMO1_PASSWORD=cambia-esto-1 DEMO2_PASSWORD=cambia-esto-2 npx tsx seed.ts && npx tsx update-order-status.ts CP-000123 shipped"
```

Así se verificaron ambos scripts (incluida una segunda ejecución del seed para comprobar la idempotencia).

## Comprobar tipos

```bash
npm run typecheck
```
