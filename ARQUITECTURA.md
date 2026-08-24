# Belt Fotos — Documento de Referencia (Arquitectura, Stack y Operación)

> Documento único con todo lo necesario para entender, mantener y actualizar la app,
> sin tener que rearmar el contexto desde cero. Ver también `SERVIDOR.md` (detalle
> operativo del servidor) y `DEPLOY-1.6.2.md` (ejemplo de guía de deploy puntual).

---

## 1. Qué es la app

PWA (Progressive Web App) para que los inspectores de **BELT Seguros** saquen fotos
de vehículos (autos y motos) desde el celular, con guía paso a paso, y las envíen
al servidor para que queden guardadas y disponibles para el equipo de emisión y el CRM.

- **Auto**: 9 fotos (frente, laterales, trasera, tablero, cédula frente/dorso, cristales, neumáticos).
- **Moto**: 9 fotos (frente, perfiles, trasera, **chasis/VIN grabado**, motor, tablero, cédula frente/dorso).

Pasos definidos en `src/FotosVehiculo.jsx` (`STEPS_AUTO`, `STEPS_MOTO`).

---

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite, TailwindCSS, lucide-react (íconos) |
| Backend | Node.js + Express 5 |
| Base de datos | SQLite (`better-sqlite3`), un único archivo `inspecciones.db` |
| Subida de fotos | `multer` (multipart/form-data) |
| Email | `nodemailer` vía SMTP de Gmail (Google Workspace) |
| OCR de cédula | API de Anthropic (Claude) — modelo configurable |
| Detección de encuadre en vivo | TensorFlow.js + COCO-SSD (por CDN) + Gemini AI (Google) para validar ángulo |
| Servicio Windows | `node-windows` (corre el server como servicio, `beltfotos.exe`) |
| Túnel/expone a Internet | Cloudflare Tunnel (sin abrir puertos en el router) |
| PWA | `manifest.json` + service worker (`public/sw.js`) — instalable en el celular |

---

## 3. Cómo se conecta todo (arquitectura)

```
Celular del inspector (PWA)
        │  HTTPS
        ▼
inspecciones-belt.com  (Cloudflare CDN, proxy)
        │  Túnel Cloudflare (sin puertos abiertos)
        ▼
Servidor Windows "DESKTOP-K5IO86R" (192.168.0.23)
        │  localhost:3003 (Node.js / Express — servicio "beltfotos.exe")
        ├─► D:\Fotos - Asegurados\<DNI>-<PATENTE>\   (fotos .jpg + datos.txt)
        ├─► D:\Fotos - Asegurados\inspecciones.db    (SQLite, tabla "vehiculos" — la lee el CRM)
        ├─► API Anthropic (Claude)   → OCR de la cédula (dominio/marca/modelo/chasis/motor/cuadro)
        ├─► API Google Gemini        → validación de encuadre en vivo (opcional, mejora UX)
        └─► SMTP Gmail               → email de notificación a emision@beltseguros.com
```

- **Dominio público**: `https://inspecciones-belt.com` (DNS en Cloudflare, zona free).
- **Sin puerto abierto en el router**: todo el tráfico entra por el túnel de Cloudflare
  (Tarea Programada de Windows `CloudflareTunnel`) hacia `localhost:3003`.
- El **frontend de desarrollo** (`vite --port 5173` / `npm run dev`) tiene un proxy
  `/api → http://localhost:3003` (ver `vite.config.js`) para poder developear sin CORS.
- Existe una **versión beta** en `/1-4-0` (detección vehicular en tiempo real con
  COCO-SSD + Gemini) servida en paralelo a la versión estable — ver
  `.devin/workflows/1-4-0.md`.

---

## 4. Flujo de una inspección (backend, `server.js`)

1. **`POST /api/guardar-inspeccion`** — recibe DNI + hasta 15 fotos (multipart).
   Crea la carpeta `D:\Fotos - Asegurados\<DNI>-<GESTION>\`, guarda las fotos como
   `1.jpg, 2.jpg, ...` + `meta.json` (tipo, dni, patente/gestión, fecha).
   Dispara en paralelo:
   - `sendNotificationEmail(...)` → email a `emision@beltseguros.com`.
   - Si hay foto de "cédula frente" → `extractCedulaData()` (Claude) → `guardarDatosVehiculo()`
     (escribe `datos.txt` + upsert en `inspecciones.db`).
2. **`POST /api/corregir-inspeccion`** — reemplaza una foto puntual de una inspección
   ya existente (usado por el flujo de corrección, scope por DNI). Si la foto
   corregida es la cédula frente (`stepId=cedula-f`), vuelve a correr el OCR y
   actualiza los datos guardados.
3. **`POST /api/validar-frame`** — usado por la beta v1.4.0 para mandar un frame de
   la cámara a Gemini y validar en vivo si el encuadre es correcto (silueta verde).
4. **`GET /api/inspecciones-dni/:dni`** — lista inspecciones de un DNI (para el flujo
   de corrección, público pero scopeado por DNI).
5. **`GET /api/inspecciones`** / **`GET /api/imagen/:carpeta/:foto`** — panel admin,
   protegido con header `x-admin-key` (variable `ADMIN_KEY`).
6. **`GET /api/health`** — chequeo de salud simple.

### OCR de cédula (Claude / Anthropic)

- Función `extractCedulaData()` en `server.js`. Envía la foto de "cédula frente" +
  un prompt (`CEDULA_PROMPT`) que pide transcripción carácter por carácter del
  chasis/VIN (para minimizar errores en caracteres ambiguos: O/0, I/1/L, B/8, S/5, Z/2, G/6, U/V)
  y devuelve JSON con: `dominio, marca, modelo, chasis, motor, cuadro`.
- Modelo default: **`claude-sonnet-4-6`** (variable `ANTHROPIC_MODEL`, opcional).
  Antes usaba `claude-sonnet-4-5`, que mostró errores intermitentes en dominio/chasis;
  se validó que `claude-sonnet-4-6` y `claude-opus-4-5-20251101` los corrigen.
- El resultado se guarda en **dos lugares**:
  - `datos.txt` dentro de la carpeta de la inspección (texto plano, para lectura rápida).
  - Tabla `vehiculos` en `inspecciones.db` (la consulta el CRM).
- Scripts de utilidad en el repo (no forman parte del server, son herramientas manuales):
  - `test-cedula-ocr.mjs` — probar el prompt/modelo contra una imagen suelta.
  - `batch-fix-cedulas.mjs` — re-correr el OCR sobre varias carpetas y corregir `datos.txt` localmente.
  - `fix-9-inspecciones.mjs` — re-disparar el OCR **en el servidor real** vía `/api/corregir-inspeccion`
    para que actualice también `inspecciones.db` de forma segura.

---

## 5. Variables de entorno (nivel Machine, en el servidor)

| Variable | Uso | Obligatoria |
|---|---|---|
| `DB_BASE` | Carpeta raíz de fotos/DB (`D:\Fotos - Asegurados` en prod) | Sí (si no está, usa carpeta local del proyecto — modo dev) |
| `SMTP_USER` / `SMTP_PASS` | Envío de emails (Gmail, contraseña de aplicación) | Sí para notificaciones |
| `NOTIFY_EMAIL` | Destinatario de notificaciones (default `emision@beltseguros.com`) | No |
| `ANTHROPIC_KEY` | OCR de cédula con Claude | Sí para OCR (si falta, se salta el OCR sin romper el resto) |
| `ANTHROPIC_MODEL` | Override del modelo Claude (default `claude-sonnet-4-6`) | No |
| `GEMINI_KEY` | Validación de encuadre en vivo (beta v1.4.0) | No (solo afecta esa beta) |
| `ADMIN_KEY` | Protege endpoints `/api/inspecciones*` (panel admin) | Sí para usar el panel admin |

Setear con `setx <VAR> "<valor>" /M` en el servidor y reiniciar el servicio.

---

## 6. Cómo actualizar (deploy)

Ver el detalle completo y los comandos exactos en `SERVIDOR.md` → sección
**"Deploy de actualizaciones"**. Resumen:

1. **En la PC de desarrollo**: `npx vite build` → `Compress-Archive` con
   `dist/`, `server.js`, `package.json`, `package-lock.json`, `public/` → zip versionado
   (ej. `belt-fotos-1.6.2.zip`).
2. **Copiar el zip** al servidor (`C:\BELT\`) por TeamViewer/Escritorio Remoto.
3. **En el servidor**: `Expand-Archive -Force` → `npm install --prefix C:\BELT` →
   `sc.exe stop beltfotos.exe` / `sc.exe start beltfotos.exe`.
4. **Verificar**: `sc.exe query beltfotos.exe`, abrir `http://localhost:3003`,
   confirmar versión en `https://inspecciones-belt.com` desde el celular.

⚠️ **Nunca** usar `taskkill /F /IM node.exe` (mata el wrapper de `node-windows` y
el servicio queda caído con error 1067). Reiniciar siempre con `sc.exe stop/start`.

⚠️ `node-windows` debe estar en `dependencies` del `package.json` — si `npm install`
lo poda, el servicio no arranca (reinstalar con `npm install node-windows --prefix C:\BELT`).

---

## 7. Datos del servidor de producción

| Dato | Valor |
|---|---|
| Hostname | `DESKTOP-K5IO86R` |
| IP LAN | `192.168.0.23` |
| Carpeta app | `C:\BELT` |
| Carpeta fotos/DB | `D:\Fotos - Asegurados` |
| Puerto app | `3003` |
| Dominio público | `https://inspecciones-belt.com` |
| Servicio Windows | `beltfotos.exe` (AUTO_START) |
| Túnel | Cloudflare Tunnel `belt-fotos`, Tarea Programada `CloudflareTunnel` (AtStartup) |

Detalle completo (comandos de diagnóstico, DNS, troubleshooting de 502/1033, etc.)
en `SERVIDOR.md`.

---

## 8. Otros documentos del repo

| Archivo | Contenido |
|---|---|
| `SERVIDOR.md` | Detalle operativo completo del servidor (comandos, troubleshooting) |
| `DEPLOY-1.6.2.md` | Ejemplo de guía de deploy puntual con checklist de verificación |
| `TUNNEL.md` | Notas sobre el túnel de Cloudflare |
| `PROPUESTA-SERVIDOR.md` | Propuesta original de arquitectura de servidor |
| `SETUP-MAC.md` | Notas de setup en Mac (entorno de desarrollo alternativo) |
| `UBICACION-CHASIS-MOTOR.md` | Guía de dónde está grabado el chasis/motor según modelo de moto |
| `.devin/workflows/1-4-0.md` | Cómo buildear/deployar la beta v1.4.0 (detección vehicular en vivo) |

---

## 9. Versión actual

- **App**: v1.6.2
- **Cambio más reciente**: fix de precisión en OCR de cédula (modelo `claude-sonnet-4-6`
  + prompt con transcripción carácter por carácter del chasis/VIN).
