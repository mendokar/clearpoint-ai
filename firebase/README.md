# firebase — Reglas de Firestore y Storage, e índices

Configuración de Firestore y Cloud Storage para Colchones Contoso. No se usan Functions ni Hosting: la web vive en
Vercel y el agente en Cloud Run. En Firestore **toda escritura se hace desde el servidor con el Admin SDK** (que
ignora las reglas), así que sus reglas solo deciden qué puede **leer** el navegador. La única escritura desde el
navegador es la **subida de fotos de producto** del panel a Storage, protegida por `storage.rules`.

```
firebase/
├── firebase.json            # Rutas de reglas/índices y puertos de los emuladores
├── firestore.rules          # Reglas de seguridad de Firestore
├── firestore.indexes.json   # Índices compuestos de orders
├── storage.rules            # Reglas de Storage (fotos de producto)
├── tests/firestore.rules.test.ts   # Tests de reglas de Firestore (@firebase/rules-unit-testing + emulador)
├── tests/storage.rules.test.ts     # Tests de reglas de Storage (emulador de Storage)
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
- Los pedidos solo los crea el webhook de Stripe (Admin SDK) y los cambios de estado los hacen el panel de
  administración (`/api/admin/orders`, Admin SDK) y el script `scripts/update-order-status.ts`.

**Rol de administrador**: el custom claim `admin: true` (`scripts/set-admin.ts`) **no aparece en las reglas** a
propósito. El panel lee y escribe solo a través de `/api/admin/**`, que verifica el token y el claim en el servidor
y usa el Admin SDK. Así un admin no tiene más poder desde el navegador que cualquier usuario (hay tests).

**Todo lo demás está denegado por defecto** (por ejemplo `counters/orders`, el contador de números de pedido).

## Reglas de Storage

Bucket `clearpoint-colchones.firebasestorage.app` (europe-southwest1). El panel sube las fotos **directamente desde
el navegador** con el SDK (`uploadBytesResumable`), sin pasar por las funciones de Vercel (que limitan el tamaño del
cuerpo). Por eso aquí, a diferencia de Firestore, el claim `admin` **sí** aparece en las reglas.

```
match /products/{slug}/{file} {
  allow get:            if true;
  allow list:           if isAdmin();
  allow create, update: if isAdmin() && isValidSlug(slug) && isValidFileName(file) && isValidImage();
  allow delete:         if isAdmin() && isValidSlug(slug);
}
```

- `isAdmin()`: claim `admin == true` (un `"true"` en texto **no** vale) **y** `email == 'admin@contoso.example'`
  (exacto) **y** `email_verified == true`. Solo esa cuenta puede subir, borrar o listar. Es la misma lista que aplica
  la web en el servidor (`ADMIN_EMAILS`, por defecto `admin@contoso.example`); las reglas no leen variables, así que
  **si cambia la cuenta de administración hay que editar `storage.rules` y volver a desplegarlas**.
- `isValidSlug(slug)`: 3–80 caracteres y `^[a-z0-9]+(-[a-z0-9]+)*$`, el mismo formato que `SLUG_RE` de
  `web/lib/catalog/admin-schema.ts`.
- `isValidFileName(file)`: nombre simple (`^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$`). La web usa
  `<timestamp>-<aleatorio>.webp`.
- `isValidImage()`: `request.resource.size < 5 MB` y `contentType` `image/jpeg|png|webp|avif`. No se admite SVG,
  que puede llevar scripts.
- **Lectura pública** de cada foto (la tienda las muestra sin sesión). **Listar** la carpeta solo puede un admin,
  para no exponer el contenido del bucket.
- El borrado no tiene `request.resource`, así que solo exige admin y una ruta válida. La web borra la carpeta
  `products/<slug>/` en el servidor (Admin SDK, que ignora las reglas) al eliminar un producto.
- **Todo lo que no sea `products/{slug}/{fichero}` está denegado**, también para un admin (subcarpetas, la raíz y
  cualquier otra ruta).

El claim llega al token del navegador porque la guarda del panel pide uno nuevo con `getIdTokenResult(true)`. Si se
acaba de dar el rol, basta con recargar `/admin`.

## Índices

| Colección | Campos | Para |
|---|---|---|
| `orders` | `userId ASC`, `createdAt DESC` | "Mis pedidos" en la web y la tool `list_my_orders` del agente |
| `orders` | `status ASC`, `createdAt DESC` | Filtro por estado del panel (`/api/admin/orders?status=…`) |

Sin estos índices la consulta falla con `FAILED_PRECONDITION` y un enlace para crearlo. El resumen del panel usa
consultas de un solo campo (`createdAt >=`, `status ==`), que no necesitan índice compuesto.

## Desplegar

Requisitos: proyecto de Firebase con Firestore y Storage (región europea) y la CLI autenticada.

```bash
cd firebase
npm ci
npx firebase login
npx firebase use --add          # elige el proyecto clearpoint-colchones (crea .firebaserc localmente)

npx firebase deploy --only storage --project clearpoint-colchones                        # reglas de Storage
npx firebase deploy --only firestore:rules,firestore:indexes --project clearpoint-colchones
# o todo junto: npm run deploy:rules   ·   solo Storage: npm run deploy:storage
```

`"storage": {"rules": "storage.rules"}` se aplica al **bucket por defecto** del proyecto, que es
`clearpoint-colchones.firebasestorage.app`. Las reglas se pueden revisar después en *Storage → Reglas*.

El índice tarda unos minutos en construirse; su estado se ve en *Firestore → Índices*.

## Probar con el emulador

Los tests usan `@firebase/rules-unit-testing` contra los emuladores de Firestore y Storage, que **requieren Java 21+**
(firebase-tools 14). En esta máquina el Java por defecto es 8, pero hay un JDK 21 en `/usr/lib/jvm`:

```bash
cd firebase
npm ci
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export PATH="$JAVA_HOME/bin:$PATH"
npm run test:rules
```

`test:rules` ejecuta `firebase emulators:exec --only firestore,storage --project demo-contoso "vitest run"`: arranca
los emuladores, carga `firestore.rules` y `storage.rules`, ejecuta los tests y los apaga. El proyecto `demo-*` no toca
ningún proyecto real ni necesita credenciales. La primera vez descarga los jars de los emuladores en
`~/.cache/firebase`.

Puertos (`firebase.json`): **Firestore 8181**, **Storage 9199**, **Auth 9099**. El 8080 queda libre para el
asistente en local (uvicorn).

Resultado actual: **32 tests en verde** (13 de Firestore y 19 de Storage).

### Firestore

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
| Con claim `admin`: escribir productos/pedidos, leer pedidos ajenos o listarlos | Denegado (el panel va por la API) |

### Storage

| Caso | Esperado |
|---|---|
| `admin@contoso.example` (verificado, con claim) sube WebP, JPEG, PNG y AVIF válidos a `products/<slug>/` | Permitido |
| Usuario normal, anónimo o claim `admin: "true"` (texto) sube | Denegado |
| Claim `admin: true` con otro email, o `admin@contoso.example` sin email verificado | Denegado |
| `admin@contoso.example` verificado sin claim, o email con otras mayúsculas | Denegado |
| Fichero de 5 MB o más (y justo por debajo) | Denegado (permitido) |
| SVG, GIF, HTML u `application/octet-stream` | Denegado |
| Slug con mayúsculas, `_`, demasiado corto/largo o con guion inicial | Denegado |
| Subir fuera de `products/{slug}/{fichero}` (otra carpeta, raíz, subcarpeta) | Denegado |
| Leer una foto de producto sin sesión o como usuario | Permitido |
| Leer fuera de `products/` (también admin) | Denegado |
| Listar la carpeta de un producto: anónimo / usuario / admin | Denegado / Denegado / Permitido |
| Borrar: admin / usuario, anónimo, claim en texto, otro email o sin verificar / fuera de `products/` | Permitido / Denegado / Denegado |

Si algún puerto está ocupado por otro proceso, ejecuta con una copia de `firebase.json` (fuera del repo) con otros
puertos: `npx firebase emulators:exec --config /ruta/firebase.json --only firestore,storage --project demo-contoso "npx vitest run"`.

Los mensajes `PERMISSION_DENIED` que aparecen en la salida son los intentos que los tests esperan que fallen.

Para probar los scripts de `scripts/` sin tocar un proyecto real, `firebase.json` también define el emulador de
Auth (puerto 9099); ver [`scripts/README.md`](../scripts/README.md#probar-sin-proyecto-real-emuladores).
