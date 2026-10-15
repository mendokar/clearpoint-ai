# firebase — Reglas e índices de Firestore

Configuración de Firestore para Colchones Contoso. No se usan Functions ni Hosting: la web vive en Vercel y
el agente en Cloud Run. **Toda escritura se hace desde el servidor con el Admin SDK** (que ignora las reglas),
así que las reglas solo tienen que decidir qué puede **leer** el navegador.

```
firebase/
├── firebase.json            # Rutas de reglas/índices y puertos de los emuladores
├── firestore.rules          # Reglas de seguridad
├── firestore.indexes.json   # Índice compuesto de orders
├── tests/firestore.rules.test.ts   # Tests de reglas (@firebase/rules-unit-testing + emulador)
├── vitest.config.ts · tsconfig.json
└── package.json             # firebase-tools, rules-unit-testing, vitest (versiones fijadas)
```

## Reglas, una a una

```
match /products/{id}  { allow read: if true;  allow write: if false; }
```
Catálogo público: cualquiera puede leer un producto (también sin sesión). Nadie puede escribir desde un
cliente; el seed y la web usan el Admin SDK.

```
match /content/{id}   { allow read: if true;  allow write: if false; }
```
Contenido público (la política `content/shipping_policy`). Misma lógica que `products`.

```
match /users/{uid}    { allow read: if request.auth != null && request.auth.uid == uid;
                        allow write: if false; }
```
Cada usuario autenticado solo puede leer **su** perfil (el ID del documento debe ser su `uid`). No hay
escritura desde el cliente: el perfil lo crea/actualiza `POST /api/users/me` en el servidor tras verificar el
ID token, de modo que nadie puede escribir en el perfil de otro ni inventarse campos.

```
match /orders/{id}    { allow read: if request.auth != null
                                    && resource.data.userId == request.auth.uid;
                        allow write: if false; }
```
Un pedido solo lo puede leer su dueño: el campo `userId` del documento debe coincidir con el `uid` del token.
Consecuencias:
- Leer un pedido ajeno por ID (IDOR) → `permission-denied`.
- Las consultas deben llevar `where("userId", "==", uid)`; una consulta sin ese filtro se rechaza entera
  porque Firestore no puede garantizar que todos los resultados cumplan la regla.
- Leer un pedido que aún no existe también da `permission-denied` (`resource` es nulo): la página
  `/checkout/exito` lo trata como "todavía no está" y vuelve a consultar.
- Los pedidos solo los crea el webhook de Stripe (Admin SDK) y los cambios de estado el script
  `scripts/update-order-status.ts`.

**Todo lo demás está denegado por defecto** (por ejemplo `counters/orders`, el contador de números de pedido).

## Índices

| Colección | Campos | Para |
|---|---|---|
| `orders` | `userId ASC`, `createdAt DESC` | "Mis pedidos" en la web y la tool `list_my_orders` del agente |

Sin este índice la consulta falla con `FAILED_PRECONDITION` y un enlace para crearlo.

## Desplegar

Requisitos: proyecto de Firebase con Firestore (región europea) y la CLI autenticada.

```bash
cd firebase
npm ci
npx firebase login
npx firebase use --add          # elige el proyecto (crea .firebaserc localmente)
npx firebase deploy --only firestore:rules,firestore:indexes
# o: npm run deploy:rules
```

El índice tarda unos minutos en construirse; su estado se ve en *Firestore → Índices*.

## Probar con el emulador

Los tests usan `@firebase/rules-unit-testing` contra el emulador de Firestore, que **requiere Java 21+**
(firebase-tools 14). En esta máquina el Java por defecto es 8, pero hay un JDK 21 en `/usr/lib/jvm`:

```bash
cd firebase
npm ci
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export PATH="$JAVA_HOME/bin:$PATH"
npm run test:rules
```

`test:rules` ejecuta `firebase emulators:exec --only firestore --project demo-contoso "vitest run"`: arranca el
emulador, carga `firestore.rules`, ejecuta los tests y lo apaga. El proyecto `demo-*` no toca ningún proyecto
real ni necesita credenciales. La primera vez descarga el jar del emulador (~60 MB) en `~/.cache/firebase`.

Resultado actual: **11 tests en verde**.

| Caso | Esperado |
|---|---|
| El dueño lee su pedido | Permitido |
| Leer el pedido de otro usuario | Denegado |
| Anónimo lee un pedido | Denegado |
| Consulta `where userId == uid` propia | Permitida |
| Consulta de `orders` sin filtro | Denegada |
| Crear, modificar o borrar un pedido desde el cliente | Denegado |
| Leer `products` y `content` sin sesión | Permitido |
| Escribir `products`/`content` (anónimo o autenticado) | Denegado |
| Leer el perfil propio / ajeno / anónimo | Permitido / Denegado / Denegado |
| Escribir el perfil propio desde el cliente | Denegado |
| Leer o escribir `counters/orders` | Denegado |

Los mensajes `PERMISSION_DENIED` que aparecen en la salida son los intentos que los tests esperan que fallen.

Para probar los scripts de `scripts/` sin tocar un proyecto real, `firebase.json` también define el emulador de
Auth (puerto 9099); ver [`scripts/README.md`](../scripts/README.md#probar-sin-proyecto-real-emuladores).
